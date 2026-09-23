// 第 2 天「越界 → 自动提醒 → 回到活动范围」：纯数据 + 纯几何，不依赖 DOM，可在 Node 里直接跑自检。
//
// 这一版专门修三件事：
//  1. 越界不再是「瞬移出界 + 原地抽动」，而是一条按匀速走完的完整路径：
//       当天轨迹上的越界起点 → 走出活动范围边界 → 在范围外小幅游走 → 沿边界走回范围 → 当天轨迹上的越界终点
//  2. 全程只有一个步速（该牲畜当天在同一时段的平均步速，上限不超过它自己的 P90 步速），
//     越界途中和越界结束往回走都是这个速度：不加速、不抖动、不冲刺回范围。
//  3. 越界名单不是从牲畜里随便抽的：先在候补里算「按正常步速能不能走出活动范围」，再挑路程最短的个体，
//     保证「走出去 + 在外面待一会儿 + 走回来」这件事在真实步速下真的成立。
import { AREAS, HERDER_ACTIVITY_RANGES, HERDER_SITES, MAP_BOUNDS } from './config.js';
import { createSeededRandom, geoPositionAtHour, lerpGeo, planDayOneMotions, polygonCenter } from './livestock-day1-motion.js';
import { pointInPolygon } from './livestock-sprites.js';

export const DAY_HOURS = 24;
export const DAY_ONE = 1;
export const DAY_TWO = 2;
export const DAY_TWO_START_HOUR = DAY_HOURS;
export const SIMULATION_TOTAL_HOURS = DAY_HOURS * 3;
export const DAY_TWO_OVERFLOW_SEED = 2026091802;
export const OVERFLOW_MIN_HOURS = 3;
export const OVERFLOW_MAX_HOURS = 4;

// 越界期间没有「越界专用速度」：步速取该牲畜当天同一时段的平均步速，上限不超过它自己的 P90 步速，
// 所以走出去、绕圈、走回来都和平时一样快——不加速、不抖动、不瞬移。
export const OVERFLOW_SPEED_SAMPLE_HOURS = 0.05;
export const OVERFLOW_SPEED_FLOOR_METERS_PER_HOUR = 180;
// 越界时段里希望「牲畜在活动范围外」的时间占比：步速按它反推，但最低不会低于当天平均步速。
// 余下的时间要留给「走到边界」和「慢慢走回来」，所以这个比例不可能接近 1。
export const OVERFLOW_OUTSIDE_TARGET_RATIO = 0.6;
// 越界期间的步速上限：既不超过该牲畜当天 P90，也不超过它当天均速的这个倍数。
// 越界不是冲刺——最多比平时快三成，「走出去 / 走回来」才看起来像正常放牧。
export const OVERFLOW_SPEED_MAX_MEAN_MULTIPLE = 1.35;
// 锚点至少走出边界多远（米），保证「越界」在地形上看得见。
export const OVERFLOW_EXIT_DEPTH_MIN_METERS = 120;
// 范围外游走圆的半径区间、离边界的最小余量，以及一次越界最多绕几圈。
export const OVERFLOW_WANDER_RADIUS_MIN_METERS = 45;
export const OVERFLOW_WANDER_RADIUS_MAX_METERS = 240;
export const OVERFLOW_RING_CLEARANCE_METERS = 70;
// 游走圆用 18 个点：点太少时拐角很尖，采样到的「瞬时步速」会在拐角处掉下去，
// 看起来像忽快忽慢。18 个点既保留自然的不规则感，转弯又足够平顺。
export const OVERFLOW_WANDER_RING_POINTS = 18;
export const OVERFLOW_MAX_LOOPS = 2.4;
export const OVERFLOW_MIN_LOOPS = 0.35;

const MAX_EXIT_CANDIDATES = 24;
// 出口候选先多取一些再筛「走得出去」的：最短路程的出口可能整片都被禁牧区或地图边界挡住。
const EXIT_CANDIDATE_POOL = 900;
// 出口方向不能只试一个角度：卓玛家的南边界紧贴禁牧区，正对南侧往外一步就踩进禁牧区。
// 主方向走不通时，沿左右张开这个扇形换方向；都不行才放弃这个出口点。
const EXIT_ANGLE_FAN_DEGREES = [0, 12, -12, 25, -25, 40, -40, 60, -60, 85, -85, 110, -110, 140, -140];
// 「这个出口能不能用」的试探深度 = 最小越界深度 + 游走圆离边界的余量。
const EXIT_PROBE_DEPTH_METERS = OVERFLOW_EXIT_DEPTH_MIN_METERS + OVERFLOW_RING_CLEARANCE_METERS;
const BOUNDS_PADDING = 0.0015;
const LATITUDE_METERS_PER_DEGREE = 111320;
const METERS_PER_DEGREE_LONGITUDE = LATITUDE_METERS_PER_DEGREE * Math.cos((33 * Math.PI) / 180);
const PROHIBITED_POLYGONS = AREAS.filter((area) => area.quality === '禁牧').map((area) => area.polygon);

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

// 第 2 天越界时段表：扎西家 2 头（10:00 / 14:00）、卓玛家 1 头（11:00），各持续 4 小时（要求 3-4 小时）。
// 时长统一取上限 4 小时：时段越长，走完「出界再回界」所需步速越接近牲畜平时的正常步速。
export const DAY_TWO_OVERFLOW_WINDOWS = [
  { ownerId: 'owner-a', ownerName: '扎西家', dayHour: 10, durationHours: 4 },
  { ownerId: 'owner-b', ownerName: '卓玛家', dayHour: 11, durationHours: 4 },
  { ownerId: 'owner-a', ownerName: '扎西家', dayHour: 14, durationHours: 4 }
];

export function formatSimulationStamp(absoluteHour) {
  const normalized = ((absoluteHour % DAY_HOURS) + DAY_HOURS) % DAY_HOURS;
  const totalMinutes = Math.round(normalized * 60) % 1440;
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const minutes = String(totalMinutes % 60).padStart(2, '0');
  return `第 ${Math.floor(absoluteHour / DAY_HOURS) + 1} 天 ${hours}:${minutes}`;
}

export function dayIndexAtHour(absoluteHour) {
  return Math.floor(absoluteHour / DAY_HOURS) + 1;
}

// 经纬度差 → 米（按场景纬度 33° 估算，够用于「越界多远」这类量级判断）。
export function degreesToMeters([longitudeDelta, latitudeDelta]) {
  return Math.hypot(
    longitudeDelta * METERS_PER_DEGREE_LONGITUDE,
    latitudeDelta * LATITUDE_METERS_PER_DEGREE
  );
}

function metersBetween(start, end) {
  return degreesToMeters([end[0] - start[0], end[1] - start[1]]);
}

function closestPointOnSegment(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  const ratio = lengthSquared === 0
    ? 0
    : clamp(((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared, 0, 1);
  return [start[0] + ratio * dx, start[1] + ratio * dy];
}

export function distanceToPolygonBoundary(point, polygon) {
  let minimum = Infinity;
  for (let index = 0; index < polygon.length; index += 1) {
    const closest = closestPointOnSegment(point, polygon[index], polygon[(index + 1) % polygon.length]);
    minimum = Math.min(minimum, metersBetween(point, closest));
  }
  return minimum;
}

export function isProhibitedPoint(point) {
  return PROHIBITED_POLYGONS.some((polygon) => pointInPolygon(point, polygon));
}

export function isInsideMapBounds(point) {
  return point[0] >= MAP_BOUNDS[0] - BOUNDS_PADDING && point[0] <= MAP_BOUNDS[2] + BOUNDS_PADDING
    && point[1] >= MAP_BOUNDS[1] - BOUNDS_PADDING && point[1] <= MAP_BOUNDS[3] + BOUNDS_PADDING;
}

// 以某个点为原点、按「米」偏移出一个新点。
function offsetByMeters(origin, angle, distanceMeters) {
  return [
    origin[0] + (Math.cos(angle) * distanceMeters) / METERS_PER_DEGREE_LONGITUDE,
    origin[1] + (Math.sin(angle) * distanceMeters) / LATITUDE_METERS_PER_DEGREE
  ];
}

// 在活动范围边界上采样，找出「出界一次再回来」最省路程的那个出口点。
// 越界牲畜就是从这个点走出去：路程最短，意味着需要的步速最低，越界看起来最自然。
function findExitCandidates(start, end, polygon, limit) {
  const candidates = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const edgeStart = polygon[index];
    const edgeEnd = polygon[(index + 1) % polygon.length];
    const samplesPerEdge = 96;
    for (let step = 0; step <= samplesPerEdge; step += 1) {
      const ratio = step / samplesPerEdge;
      const point = [
        edgeStart[0] + (edgeEnd[0] - edgeStart[0]) * ratio,
        edgeStart[1] + (edgeEnd[1] - edgeStart[1]) * ratio
      ];
      candidates.push({ point, total: metersBetween(start, point) + metersBetween(point, end) });
    }
  }
  candidates.sort((left, right) => left.total - right.total);
  return candidates.slice(0, limit);
}

// 可用的出口候选：按「出界一次再回来」的路程从短到长，只保留外面确实有合法落脚点的出口。
function findFeasibleExitCandidates(start, end, polygon, limit) {
  const feasible = [];
  for (const candidate of findExitCandidates(start, end, polygon, EXIT_CANDIDATE_POOL)) {
    const baseAngle = outwardAngle(candidate.point, start, end, polygon);
    const resolved = resolveExitAnchor(candidate.point, baseAngle, EXIT_PROBE_DEPTH_METERS, polygon);
    if (!resolved) continue;
    feasible.push({ point: candidate.point, total: candidate.total, baseAngle: resolved.angle });
    if (feasible.length >= limit) break;
  }
  return feasible;
}

// 出口点朝外的方向：以「点到当天轨迹的垂线」为准，退化时改用多边形中心的方向。
function outwardAngle(point, start, end, polygon) {
  const projection = closestPointOnSegment(point, start, end);
  const dx = (point[0] - projection[0]) * METERS_PER_DEGREE_LONGITUDE;
  const dy = (point[1] - projection[1]) * LATITUDE_METERS_PER_DEGREE;
  if (Math.hypot(dx, dy) > 1) return Math.atan2(dy, dx);
  const center = polygonCenter(polygon);
  const cx = (point[0] - center[0]) * METERS_PER_DEGREE_LONGITUDE;
  const cy = (point[1] - center[1]) * LATITUDE_METERS_PER_DEGREE;
  if (Math.hypot(cx, cy) > 1) return Math.atan2(cy, cx);
  return 0;
}

function isUsableOverflowPoint(point, polygon) {
  return isInsideMapBounds(point)
    && !pointInPolygon(point, polygon)
    && !isProhibitedPoint(point);
}

function pushOutOfPolygon(origin, angle, polygon) {
  if (isUsableOverflowPoint(origin, polygon)) return origin;
  for (let step = 1; step <= 8; step += 1) {
    const candidate = offsetByMeters(origin, angle, OVERFLOW_RING_CLEARANCE_METERS * step);
    if (isUsableOverflowPoint(candidate, polygon)) return candidate;
  }
  return null;
}

// 站在某个点上、朝 baseAngle 方向往外找一块合法落脚点（不在活动范围内、不在禁牧区、没出地图）。
// 主方向被挡住时按扇形换方向再试——这样「南边紧贴禁牧区」的草场也能从别的口子走出去。
function resolveExitAnchor(point, baseAngle, targetDepthMeters, polygon) {
  for (const fanDegrees of EXIT_ANGLE_FAN_DEGREES) {
    const angle = baseAngle + (fanDegrees * Math.PI) / 180;
    const anchor = pushOutOfPolygon(offsetByMeters(point, angle, targetDepthMeters), angle, polygon);
    if (anchor) return { angle, anchor, depthMeters: metersBetween(point, anchor) };
  }
  return null;
}

// 越界游走圆上的点：先按原位置用，站不住就按同一个扇形换个方向挪出去。
function resolveOverflowPoint(raw, angle, polygon) {
  if (isUsableOverflowPoint(raw, polygon)) return raw;
  return resolveExitAnchor(raw, angle, 0, polygon)?.anchor ?? null;
}

// 整条越界路径不能在禁牧区里穿行。
function pathAvoidsProhibited(coordinates) {
  for (let index = 0; index + 1 < coordinates.length; index += 1) {
    const start = coordinates[index];
    const end = coordinates[index + 1];
    const steps = Math.max(1, Math.ceil(metersBetween(start, end) / 40));
    for (let step = 0; step <= steps; step += 1) {
      const ratio = step / steps;
      const point = lerpGeo(start, end, ratio);
      if (isProhibitedPoint(point)) return false;
    }
  }
  return true;
}

// 该牲畜当天的步速统计：越界期间就走这个步速。
function sampleSpeedStats(plan, startHour, endHour) {
  const speeds = [];
  let previous = geoPositionAtHour(plan, startHour);
  for (
    let hour = startHour + OVERFLOW_SPEED_SAMPLE_HOURS;
    hour <= endHour + 1e-9;
    hour += OVERFLOW_SPEED_SAMPLE_HOURS
  ) {
    const current = geoPositionAtHour(plan, hour);
    speeds.push(metersBetween(previous, current) / OVERFLOW_SPEED_SAMPLE_HOURS);
    previous = current;
  }
  if (!speeds.length) return { mean: OVERFLOW_SPEED_FLOOR_METERS_PER_HOUR, p90: OVERFLOW_SPEED_FLOOR_METERS_PER_HOUR, max: 0 };
  const sorted = [...speeds].sort((left, right) => left - right);
  return {
    mean: speeds.reduce((sum, value) => sum + value, 0) / speeds.length,
    p90: sorted[Math.floor(0.9 * (sorted.length - 1))],
    max: sorted[sorted.length - 1]
  };
}

// 挑越界牲畜：先算出「这头牲畜在这个时段能不能按正常步速走出活动范围」，
// 再取路程最短的那几头。排序是确定的，所以名单每次刷新都一样。
function rankOverflowCandidates(livestock, range, planByAnimal, window) {
  const startHour = DAY_TWO_START_HOUR + window.dayHour;
  const endHour = startHour + window.durationHours;
  return livestock
    .filter((animal) => animal.ownerId === window.ownerId && !animal.dayOfflineCandidate)
    .map((animal) => {
      const plan = planByAnimal.get(animal);
      const start = geoPositionAtHour(plan, startHour);
      const end = geoPositionAtHour(plan, endHour);
      // 出口要「真的走得出去」才算候补：四周全被禁牧区/地图边界围死的位置直接淘汰。
      const exitMeters = findFeasibleExitCandidates(start, end, range.polygon, 1)[0]?.total ?? Infinity;
      const stats = sampleSpeedStats(plan, startHour, endHour);
      return { animal, plan, startHour, endHour, exitMeters, stats };
    })
    .filter((candidate) => Number.isFinite(candidate.exitMeters))
    .sort((left, right) => left.exitMeters - right.exitMeters);
}

// 排出第 2 天越界计划：谁越界、几点开始、持续多久、从哪个口子走出去。
export function createDayTwoOverflowSchedule({
  livestock,
  ranges = HERDER_ACTIVITY_RANGES,
  sites = HERDER_SITES,
  plans
} = {}) {
  // 越界名单要按「出界路程」排序，所以先要每头牲畜当天的轨迹。
  // 轨迹完全由固定种子生成，调用方再算一次也只是重复计算、结果一致。
  const motionPlans = plans ?? planDayOneMotions({ livestock, sites, ranges });
  const planByAnimal = new Map(motionPlans.map((plan) => [plan.animal, plan]));

  // 每个时段各自排名，不能按户共用一份名单：扎西家 10:00 和 14:00 两个时段里，
  // 牲畜在当天轨迹上的位置不同，出界难度也不同；共用名单会让第二个时段沿用第一个时段的时刻。
  const poolsByWindow = DAY_TWO_OVERFLOW_WINDOWS.map((window) => {
    const range = ranges.find((candidate) => candidate.ownerId === window.ownerId);
    if (!range) throw new Error(`[day2-overflow] 缺少 ${window.ownerName} 的活动范围定义`);
    return rankOverflowCandidates(livestock, range, planByAnimal, window);
  });

  // 同一头牲畜只越界一次：前面时段已经选走的牲畜，从后面时段的候选里剔除。
  const assignedByOwner = new Map();
  const schedule = DAY_TWO_OVERFLOW_WINDOWS.map((window, windowIndex) => {
    const range = ranges.find((candidate) => candidate.ownerId === window.ownerId);
    if (!range) throw new Error(`[day2-overflow] 缺少 ${window.ownerName} 的活动范围定义`);

    const assigned = assignedByOwner.get(window.ownerId) ?? new Set();
    const candidate = poolsByWindow[windowIndex].find((entry) => !assigned.has(entry.animal));
    if (!candidate) {
      throw new Error(`[day2-overflow] ${window.ownerName} 在 ${window.dayHour}:00 时段没有可用的越界牲畜`);
    }
    assigned.add(candidate.animal);
    assignedByOwner.set(window.ownerId, assigned);
    const { animal, plan, startHour, endHour, exitMeters, stats } = candidate;

    return {
      animal,
      animalId: animal.id,
      ownerId: window.ownerId,
      ownerName: window.ownerName,
      rangeId: range.id,
      rangePolygon: range.polygon,
      startHour,
      durationHours: window.durationHours,
      endHour,
      dayOnePlan: plan,
      exitMeters,
      speedStats: stats
    };
  });

  // 锚点在第一版里是「依赖路径」才存在的，但越界计划自检需要在拿到路径之前就能看到锚点，所以这里先算好。
  schedule.forEach((entry) => { buildOverflowGeoPath(entry, entry.dayOnePlan); });
  return schedule;
}

// 是否处在越界时段内（用于显示感叹号、推送提醒）。
export function isOverflowAtHour(entry, absoluteHour) {
  return absoluteHour >= entry.startHour && absoluteHour < entry.endHour;
}

// 解出「出界深度」和「范围内侧游走半径」：
// 越界多出来的路程 = 往返两段深度 + 若干圈游走周长，且游走整圈都要留在活动范围之外。
function solveWanderShape(extraMeters) {
  const minDepth = OVERFLOW_EXIT_DEPTH_MIN_METERS;
  const radiusForOneLoop = (extraMeters - 2 * OVERFLOW_RING_CLEARANCE_METERS)
    / (2 + 2 * Math.PI);

  if (radiusForOneLoop >= OVERFLOW_WANDER_RADIUS_MIN_METERS
    && radiusForOneLoop <= OVERFLOW_WANDER_RADIUS_MAX_METERS) {
    return { radiusMeters: radiusForOneLoop, depthMeters: Math.max(minDepth, radiusForOneLoop + OVERFLOW_RING_CLEARANCE_METERS) };
  }

  if (radiusForOneLoop > OVERFLOW_WANDER_RADIUS_MAX_METERS) {
    const radiusMeters = OVERFLOW_WANDER_RADIUS_MAX_METERS;
    const depthMeters = Math.max(minDepth, radiusMeters + OVERFLOW_RING_CLEARANCE_METERS);
    const remaining = extraMeters - 2 * depthMeters;
    const loops = clamp(
      remaining / (2 * Math.PI * radiusMeters),
      OVERFLOW_MIN_LOOPS,
      OVERFLOW_MAX_LOOPS
    );
    return { radiusMeters, depthMeters, loops };
  }

  const radiusMeters = OVERFLOW_WANDER_RADIUS_MIN_METERS;
  const depthMeters = Math.max(minDepth, radiusMeters + OVERFLOW_RING_CLEARANCE_METERS);
  const remaining = extraMeters - 2 * depthMeters;
  const loops = clamp(
    remaining / (2 * Math.PI * radiusMeters),
    OVERFLOW_MIN_LOOPS,
    OVERFLOW_MAX_LOOPS
  );
  return { radiusMeters, depthMeters, loops };
}

// 游走圆用「一圈 12 个点、半径略带抖动」的折线表示：看起来像牲畜在外面转着吃草，
// 而不是绕着一个完美的圆画圈。
function createWanderRing(anchor, angle, radiusMeters, random) {
  const ring = [];
  for (let index = 0; index < OVERFLOW_WANDER_RING_POINTS; index += 1) {
    const pointAngle = angle + (index / OVERFLOW_WANDER_RING_POINTS) * Math.PI * 2;
    const jitter = 0.88 + random() * 0.24;
    ring.push({ angle: pointAngle, radiusMeters: radiusMeters * jitter });
  }
  return ring;
}

function ringStopsFor(anchor, ring, loops) {
  const stops = [];
  // loops 是「绕几圈」，环上的步进单位是「一个环点」，所以先把圈数换算成环点数。
  // （这里如果直接把 loops 当步进单位，路径只会扫过不到一圈的弧，越界时间会被压得很短。）
  const totalIndexSteps = Math.max(1, loops * ring.length);
  const steps = Math.max(1, Math.round(totalIndexSteps));
  for (let step = 1; step <= steps; step += 1) {
    const progress = (step / steps) * totalIndexSteps;
    const base = Math.floor(progress);
    const index = base % ring.length;
    const nextIndex = (index + 1) % ring.length;
    const offset = offsetByMeters(anchor, ring[index].angle, ring[index].radiusMeters);
    const nextOffset = offsetByMeters(anchor, ring[nextIndex].angle, ring[nextIndex].radiusMeters);
    stops.push(lerpGeo(offset, nextOffset, progress - base));
  }
  return stops;
}

function coordinatesLength(coordinates) {
  let total = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    total += metersBetween(coordinates[index - 1], coordinates[index]);
  }
  return total;
}

// 越界路径的几何：越界起点 → 锚点 → 范围外游走 → 越界终点。
// 路径长度被校准成「步速 × 越界时长」，所以整段路程只有一个速度。
function buildExcursionCoordinates(entry, anchor, ring, loops) {
  const coordinates = [entry.startPoint, anchor, ...ringStopsFor(anchor, ring, loops), entry.endPoint];
  return coordinates;
}

export function buildOverflowGeoPath(entry, plan) {
  const start = geoPositionAtHour(plan, entry.startHour);
  const end = geoPositionAtHour(plan, entry.endHour);
  const polygon = entry.rangePolygon;
  const duration = entry.durationHours;
  const stats = entry.speedStats ?? sampleSpeedStats(plan, entry.startHour, entry.endHour);

  const exitCandidates = findFeasibleExitCandidates(start, end, polygon, MAX_EXIT_CANDIDATES);
  if (!exitCandidates.length) {
    throw new Error(`[day2-overflow] ${entry.animalId} 的活动范围外没有合法落脚点（被禁牧区或地图边界围住）`);
  }
  const minimumExitMeters = exitCandidates[0].total;
  // 步速：优先按该牲畜当天的平均步速走；如果平均步速走不出活动范围，就提高到刚好够走出去的水平，
  // 但最高不超过它自己的 P90 步速——越界再远，也是「它自己走得出来的速度」。
  const exitOnlySpeed = (minimumExitMeters * 1.03) / duration;
  // 上限同时受「当天 P90」和「当天均速 × 1.35」约束；但「刚好够走出去」所需的速度必须给足，
  // 否则牲畜按再快的正常步速也走不出活动范围。
  const ceiling = Math.max(
    exitOnlySpeed,
    Math.min(stats.p90, OVERFLOW_SPEED_MAX_MEAN_MULTIPLE * stats.mean)
  );
  const floor = Math.min(ceiling, Math.max(OVERFLOW_SPEED_FLOOR_METERS_PER_HOUR, exitOnlySpeed));
  const targetSpeed = Math.max(
    stats.mean,
    minimumExitMeters / (duration * (1 - OVERFLOW_OUTSIDE_TARGET_RATIO))
  );
  const speed = clamp(targetSpeed, floor, ceiling);
  // 路程预算至少够「走出去 → 在外面绕最小的一圈 → 走回来」，
  // 否则按平均步速算出来的路程会短到走不出活动范围。
  const minimumExcursionMeters = minimumExitMeters
    + 2 * EXIT_PROBE_DEPTH_METERS
    + OVERFLOW_MIN_LOOPS * 2 * Math.PI * OVERFLOW_WANDER_RADIUS_MIN_METERS;
  const totalMeters = Math.max(speed * duration, minimumExcursionMeters);

  const shape = solveWanderShape(Math.max(0, totalMeters - minimumExitMeters));
  const randomSeed = DAY_TWO_OVERFLOW_SEED
    + entry.animalId.split('').reduce((sum, character) => sum + character.charCodeAt(0), 0);

  let built = null;
  for (const candidate of exitCandidates) {
    const angle = candidate.baseAngle;
    const resolvedAnchor = resolveExitAnchor(candidate.point, angle, shape.depthMeters, polygon);
    if (!resolvedAnchor) continue;
    const { anchor } = resolvedAnchor;

    // 游走圆的抖动要按候选各自取种子：换一个出口重试时不会跟着变，路径仍然可复现。
    const ring = createWanderRing(anchor, angle, shape.radiusMeters, createSeededRandom(randomSeed));
    const resolvedRing = [];
    let ringOk = true;
    for (const point of ring) {
      const raw = offsetByMeters(anchor, point.angle, point.radiusMeters);
      const resolved = resolveOverflowPoint(raw, point.angle, polygon);
      if (!resolved) { ringOk = false; break; }
      resolvedRing.push({ angle: point.angle, radiusMeters: metersBetween(anchor, resolved) });
    }
    if (!ringOk) continue;

    entry.startPoint = start;
    entry.endPoint = end;
    // 让路径总长刚好等于「步速 × 时长」：圈数按实测长度微调，避免出现忽快忽慢的接缝。
    let loops = shape.loops ?? 1;
    let coordinates = buildExcursionCoordinates(entry, anchor, resolvedRing, loops);
    for (let iteration = 0; iteration < 6; iteration += 1) {
      const measured = coordinatesLength(coordinates);
      const delta = totalMeters - measured;
      if (Math.abs(delta) < 2) break;
      const ringMeters = Math.max(1, 2 * Math.PI * shape.radiusMeters);
      loops = clamp(loops + delta / ringMeters, OVERFLOW_MIN_LOOPS, OVERFLOW_MAX_LOOPS * 2);
      coordinates = buildExcursionCoordinates(entry, anchor, resolvedRing, loops);
    }
    if (!pathAvoidsProhibited(coordinates)) continue;
    built = { anchor, ring: resolvedRing, loops, coordinates };
    break;
  }

  if (!built) throw new Error(`[day2-overflow] ${entry.animalId} 无法在活动范围外生成合法越界路径`);

  const { anchor, coordinates } = built;
  const cumulativeMeters = [0];
  for (let index = 1; index < coordinates.length; index += 1) {
    cumulativeMeters.push(cumulativeMeters[index - 1] + metersBetween(coordinates[index - 1], coordinates[index]));
  }

  const totalMeasured = cumulativeMeters[cumulativeMeters.length - 1];
  entry.anchor = anchor;
  entry.overflowGeoPath = coordinates;
  entry.overflowCumulativeMeters = cumulativeMeters;
  entry.overflowTotalMeters = totalMeasured;
  // 实际速度：路径总长 / 越界时长。自检里会核对它和当天正常步速是不是同一个量级。
  entry.overflowSpeedMetersPerHour = totalMeasured / duration;
  entry.overflowWanderRadiusMeters = coordinates.reduce(
    (maximum, point) => Math.max(maximum, metersBetween(anchor, point)),
    0
  );
  entry.dayOnePlan = plan;
  return entry;
}

// 给整张越界时段表配上路径（需要每头牲畜第 1 天的轨迹计划）。
export function attachOverflowPaths(schedule, plans) {
  const planByAnimal = new Map((plans ?? []).map((plan) => [plan.animal, plan]));
  schedule.forEach((entry) => {
    const plan = planByAnimal.get(entry.animal) ?? entry.dayOnePlan;
    if (!plan) throw new Error(`[day2-overflow] ${entry.animalId} 缺少第 1 天轨迹计划，无法生成越界路径`);
    buildOverflowGeoPath(entry, plan);
  });
  return schedule;
}

// 匀速路径：按「已经走过去多少米」定位到具体线段和段内比例。
// 经纬度路径和世界坐标路径共用同一套线段索引，保证两条路径的位置完全对应。
function pathProgressAtMeters(cumulativeMeters, targetMeters) {
  let index = 0;
  while (index < cumulativeMeters.length - 2 && cumulativeMeters[index + 1] <= targetMeters) index += 1;
  const segment = cumulativeMeters[index + 1] - cumulativeMeters[index];
  const ratio = segment > 0 ? (targetMeters - cumulativeMeters[index]) / segment : 0;
  return { index, ratio: clamp(ratio, 0, 1) };
}

function elapsedRatioAtHour(entry, absoluteHour) {
  return clamp((absoluteHour - entry.startHour) / entry.durationHours, 0, 1);
}

export function hasOverflowPath(entry) {
  return Array.isArray(entry.overflowGeoPath) && entry.overflowGeoPath.length >= 2;
}

// 越界时段内：沿越界路径匀速前进的位置（经纬度）。
export function overflowGeoPositionAtHour(entry, absoluteHour) {
  if (!hasOverflowPath(entry) || !isOverflowAtHour(entry, absoluteHour)) return null;
  const target = elapsedRatioAtHour(entry, absoluteHour) * entry.overflowTotalMeters;
  const { index, ratio } = pathProgressAtMeters(entry.overflowCumulativeMeters, target);
  return lerpGeo(entry.overflowGeoPath[index], entry.overflowGeoPath[index + 1], ratio);
}

// 同一个位置的世界坐标版本：主场景每帧用这个（线段索引和经纬度路径一一对应）。
export function overflowWorldPositionAtHour(entry, absoluteHour, targetVector) {
  if (!hasOverflowPath(entry) || !entry.overflowWorldPath || !isOverflowAtHour(entry, absoluteHour)) return null;
  const target = elapsedRatioAtHour(entry, absoluteHour) * entry.overflowTotalMeters;
  const { index, ratio } = pathProgressAtMeters(entry.overflowCumulativeMeters, target);
  return targetVector.copy(entry.overflowWorldPath[index]).lerp(entry.overflowWorldPath[index + 1], ratio);
}

// 沿越界路径逐步采样，找到光点实际离开参考区域的那一刻。
// 普通越界 → 离开活动范围；禁牧区越界 → 进入禁牧区。
// 消息卡片和感叹号都用这个时刻触发，而不是越界时段起点。
export function overflowActualExitHour(entry, { stepHours = 0.05 } = {}) {
  if (!hasOverflowPath(entry)) return entry.startHour;
  const isProhibited = entry.overflowType === 'prohibited';
  for (let hour = entry.startHour; hour <= entry.endHour + 1e-9; hour += stepHours) {
    const position = overflowGeoPositionAtHour(entry, hour);
    if (!position) continue;
    if (isProhibited) {
      if (isProhibitedPoint(position)) return hour;
    } else {
      if (!pointInPolygon(position, entry.rangePolygon)) return hour;
    }
  }
  return entry.startHour;
}

// 感叹号只在「确实走出活动范围」时出现：刚出发、还没走出边界的阶段不显示，
// 越界结束往回走、重新进入活动范围后立刻消失（走回去是正常步速，不是弹回去）。
export function isOverflowVisibleAtHour(entry, absoluteHour) {
  if (!isOverflowAtHour(entry, absoluteHour)) return false;
  const position = overflowGeoPositionAtHour(entry, absoluteHour);
  if (!position) return true;
  return !pointInPolygon(position, entry.rangePolygon);
}

// 牲畜按正常步速走回活动范围的那一刻：感叹号在这时消失，「已回到活动范围」也在这时推送。
// 它比越界时段结束得更早——因为剩余时间要留给牲畜继续在范围内正常走动，而不是卡在边界上。
export function overflowReentryHour(entry, { stepHours = 0.02 } = {}) {
  if (!hasOverflowPath(entry)) return entry.endHour;
  const exitHour = overflowActualExitHour(entry, { stepHours });
  let wasOutside = false;
  for (let hour = exitHour; hour <= entry.endHour + 1e-9; hour += stepHours) {
    const position = overflowGeoPositionAtHour(entry, hour);
    if (!position) break;
    if (pointInPolygon(position, entry.rangePolygon)) {
      if (wasOutside) return hour;
      continue;
    }
    wasOutside = true;
  }
  return entry.endHour;
}

function anchorFacts(entry) {
  return {
    在活动范围外: !pointInPolygon(entry.anchor, entry.rangePolygon),
    距活动范围边界米: Math.round(distanceToPolygonBoundary(entry.anchor, entry.rangePolygon)),
    位于禁牧区: isProhibitedPoint(entry.anchor),
    在地图范围内: isInsideMapBounds(entry.anchor)
  };
}

// 自检一：越界名单、时刻、时长、锚点是否合法。
export function validateDayTwoOverflowSchedule(schedule) {
  const rows = schedule.map((entry) => ({
    编号: entry.animalId,
    牧户: entry.ownerName,
    健康状态: entry.animal.telemetry.lastHealthStatus,
    越界开始: formatSimulationStamp(entry.startHour),
    越界结束: formatSimulationStamp(entry.endHour),
    持续小时: entry.durationHours,
    出界最短路程米: Math.round(entry.exitMeters),
    越界锚点: `${entry.anchor[0].toFixed(4)}°E / ${entry.anchor[1].toFixed(4)}°N`,
    ...anchorFacts(entry)
  }));

  const ownerNames = [...new Set(schedule.map((entry) => entry.ownerName))];
  const perOwner = Object.fromEntries(ownerNames.map((ownerName) => [
    ownerName,
    schedule.filter((entry) => entry.ownerName === ownerName).length
  ]));
  const durationViolations = schedule
    .filter((entry) => entry.durationHours < OVERFLOW_MIN_HOURS || entry.durationHours > OVERFLOW_MAX_HOURS)
    .map((entry) => entry.animalId);
  const anchorViolations = schedule
    .filter((entry) => {
      const facts = anchorFacts(entry);
      return !facts.在活动范围外 || facts.位于禁牧区 || !facts.在地图范围内;
    })
    .map((entry) => entry.animalId);
  const offlineConflicts = schedule
    .filter((entry) => entry.animal.dayOfflineCandidate)
    .map((entry) => entry.animalId);
  const duplicateAnimals = schedule
    .map((entry) => entry.animalId)
    .filter((id, index, ids) => ids.indexOf(id) !== index);

  const summary = {
    天数: DAY_TWO,
    越界头数: schedule.length,
    按牧户: perOwner,
    越界时刻: schedule.map((entry) => formatSimulationStamp(entry.startHour)),
    时长范围: `${OVERFLOW_MIN_HOURS}-${OVERFLOW_MAX_HOURS} 小时`,
    时长违规: durationViolations,
    锚点违规: anchorViolations,
    与第1天掉线名单冲突: offlineConflicts,
    重复牲畜: duplicateAnimals,
    passed: durationViolations.length === 0
      && anchorViolations.length === 0
      && offlineConflicts.length === 0
      && duplicateAnimals.length === 0
  };

  console.groupCollapsed(`[day2-overflow] 第 ${DAY_TWO} 天越界事件自检（${schedule.length} 头）`);
  console.table(rows);
  console.info('[day2-overflow] 越界事件汇总:', summary);
  console.groupEnd();
  if (!summary.passed) console.error('[day2-overflow] 越界计划自检未通过，请查看汇总');
  return { rows, summary };
}

// 综合位置：越界时段内走越界路径，越界时段外继续走当天轨迹。
export function combinedGeoPositionAtHour(entry, absoluteHour) {
  const overflowPosition = overflowGeoPositionAtHour(entry, absoluteHour);
  return overflowPosition ?? geoPositionAtHour(entry.dayOnePlan, absoluteHour);
}

// 自检二：逐点采样，确认三件事——
//  1. 越界时段确实走出了活动范围，时段之外确实回到范围内；
//  2. 越界全程（含越界结束往回走）步速恒定，且不超过该牲畜当天的正常步速（不抖动、不冲刺）；
//  3. 越界位置始终在锚点附近（不跑远）。
export function validateDayTwoOverflowMotion(schedule, { sampleStepHours = 0.05 } = {}) {
  const rows = [];
  const problems = [];
  // 越界期间拐角处会有轻微放慢（用弦长采样，本来就短于实际路程），所以不卡「速度是否分毫不差」，
  // 只卡真正要命的那件事：越界途中的任何一段，都不许比这头牲畜自己平时的上限更快。
  const speedSpikeTolerance = 1.05;
  const minimumOutsideRatio = 0.15;
  let sampledPositions = 0;
  let maximumWanderRadiusMeters = 0;
  let maximumSpeedSpikeRatio = 0;
  let maximumSpeedVariance = 0;

  schedule.forEach((entry) => {
    if (!entry.dayOnePlan) {
      problems.push(`${entry.animalId} 缺少第 1 天轨迹计划`);
      return;
    }

    let outsideInWindow = 0;
    let insideInWindow = 0;
    let outsideOutOfWindow = 0;
    let outOfWindowSamples = 0;
    let maxStepMeters = 0;
    let distanceFromAnchorMeters = 0;
    const windowSpeeds = [];

    let previous = combinedGeoPositionAtHour(entry, entry.startHour - 1);
    for (let hour = entry.startHour - 1; hour <= entry.endHour + 1; hour += sampleStepHours) {
      const current = combinedGeoPositionAtHour(entry, hour);
      const stepMeters = metersBetween(previous, current);
      const insideRange = pointInPolygon(current, entry.rangePolygon);
      sampledPositions += 1;

      if (isOverflowAtHour(entry, hour)) {
        if (insideRange) insideInWindow += 1;
        else outsideInWindow += 1;
        // 只统计越界时段中段的步速：首尾两个采样点跨在「轨迹 ↔ 越界路径」的接缝上。
        const elapsedRatio = elapsedRatioAtHour(entry, hour);
        if (elapsedRatio > 0.05 && elapsedRatio < 0.95) windowSpeeds.push(stepMeters / sampleStepHours);
        distanceFromAnchorMeters = Math.max(distanceFromAnchorMeters, metersBetween(current, entry.anchor));
      } else {
        outOfWindowSamples += 1;
        if (!insideRange) outsideOutOfWindow += 1;
      }

      maxStepMeters = Math.max(maxStepMeters, stepMeters);
      previous = current;
    }

    const outsideRatio = outsideInWindow / Math.max(1, outsideInWindow + insideInWindow);
    const meanWindowSpeed = windowSpeeds.length
      ? windowSpeeds.reduce((sum, value) => sum + value, 0) / windowSpeeds.length
      : 0;
    const maximumWindowSpeed = windowSpeeds.length ? Math.max(...windowSpeeds) : 0;
    const minimumWindowSpeed = windowSpeeds.length ? Math.min(...windowSpeeds) : 0;
    // 速度是否恒定：越界期间任何一段的步速都不该明显偏离中位步速（否则就是「抽搐」）。
    const speedVarianceRatio = minimumWindowSpeed > 0 ? maximumWindowSpeed / minimumWindowSpeed : 1;
    // 越界期间允许比平时慢，但不允许比这头牲畜自己平时的高限更快——那才是用户说的「抽搐 / 冲刺」。
    const speedCeiling = Math.max(entry.speedStats.p90, entry.overflowSpeedMetersPerHour);
    const speedSpikeRatio = speedCeiling > 0 ? maximumWindowSpeed / speedCeiling : 0;
    const speedRatio = entry.speedStats.max > 0 ? meanWindowSpeed / entry.speedStats.max : 0;
    const passed = outsideRatio >= minimumOutsideRatio
      && outsideOutOfWindow === 0
      && speedSpikeRatio <= speedSpikeTolerance
      && distanceFromAnchorMeters <= entry.overflowWanderRadiusMeters * 1.05 + 5;

    maximumWanderRadiusMeters = Math.max(maximumWanderRadiusMeters, distanceFromAnchorMeters);
    maximumSpeedSpikeRatio = Math.max(maximumSpeedSpikeRatio, speedSpikeRatio);
    maximumSpeedVariance = Math.max(maximumSpeedVariance, speedVarianceRatio);
    rows.push({
      编号: entry.animalId,
      牧户: entry.ownerName,
      越界开始: formatSimulationStamp(entry.startHour),
      越界结束: formatSimulationStamp(entry.endHour),
      越界时段在范围外占比: `${Math.round(outsideRatio * 100)}%`,
      时段外仍在范围外: outsideOutOfWindow,
      越界步速均速: Math.round(meanWindowSpeed),
      当天均速: Math.round(entry.speedStats.mean),
      当天P90: Math.round(entry.speedStats.p90),
      越界均速比当天最高: Number(speedRatio.toFixed(2)),
      越界最快步速比当天P90: Number(speedSpikeRatio.toFixed(2)),
      越界速度波动比参考: Number(speedVarianceRatio.toFixed(3)),
      偏离锚点最大米: Math.round(distanceFromAnchorMeters),
      出界深度米: Math.round(distanceToPolygonBoundary(entry.anchor, entry.rangePolygon)),
      结果: passed ? '越界正常' : '越界异常'
    });
    if (!passed) {
      problems.push(
        `${entry.animalId}（范围外占比 ${Math.round(outsideRatio * 100)}%`
        + ` / 时段外越界 ${outsideOutOfWindow} 次`
        + ` / 越界最快步速比当天P90 ${speedSpikeRatio.toFixed(2)}`
        + ` / 偏离锚点 ${Math.round(distanceFromAnchorMeters)} 米）`
      );
    }
  });

  const summary = {
    天数: DAY_TWO,
    越界头数: schedule.length,
    采样间隔小时: sampleStepHours,
    全天采样点数: sampledPositions,
    偏离锚点最大米: Math.round(maximumWanderRadiusMeters),
    越界最快步速容忍上限: speedSpikeTolerance,
    越界最快步速比当天P90: Number(maximumSpeedSpikeRatio.toFixed(2)),
    越界速度波动比参考: Number(maximumSpeedVariance.toFixed(3)),
    越界占比下限: minimumOutsideRatio,
    违规: problems,
    passed: problems.length === 0
  };

  console.groupCollapsed(`[day2-overflow] 第 ${DAY_TWO} 天越界运动自检 · 位置与速度`);
  console.table(rows);
  console.info('[day2-overflow] 越界运动汇总:', summary);
  console.groupEnd();
  if (problems.length > 0) console.error(`[day2-overflow] 越界运动异常：${problems.join('、')}`);
  return { rows, summary };
}
