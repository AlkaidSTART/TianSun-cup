// 第 3 天越界：多吉家 2 头，两种类型——
//  1. 常规越界（SC-2026-00376，09:30 开始，3.5 小时）：走出活动范围但不进禁牧区，与第 2 天同逻辑。
//  2. 进入禁牧区（SC-2026-00380，15:00 开始，3.5 小时）：从 area-c 跨越共享边界进入 area-d（禁牧区），
//     路径故意穿过禁牧区，触发弹窗告警。
//
// 纯数据 + 纯几何，不依赖 DOM，可在 Node 里跑自检。
import { AREAS, HERDER_ACTIVITY_RANGES, HERDER_SITES } from './config.js';
import {
  DAY_HOURS,
  OVERFLOW_EXIT_DEPTH_MIN_METERS,
  OVERFLOW_RING_CLEARANCE_METERS,
  OVERFLOW_SPEED_FLOOR_METERS_PER_HOUR,
  OVERFLOW_SPEED_MAX_MEAN_MULTIPLE,
  OVERFLOW_WANDER_RADIUS_MAX_METERS,
  OVERFLOW_WANDER_RADIUS_MIN_METERS,
  buildOverflowGeoPath,
  dayIndexAtHour,
  degreesToMeters,
  distanceToPolygonBoundary,
  formatSimulationStamp,
  isInsideMapBounds,
  isProhibitedPoint,
  overflowGeoPositionAtHour,
  overflowReentryHour
} from './livestock-day2-overflow.js';
import {
  createSeededRandom,
  geoPositionAtHour,
  lerp,
  lerpGeo,
  planDayOneMotions,
  polygonCenter
} from './livestock-day1-motion.js';
import { pointInPolygon } from './livestock-sprites.js';

export const DAY_THREE = 3;
export const DAY_THREE_START_HOUR = DAY_HOURS * 2;
export const SIMULATION_TOTAL_HOURS = DAY_HOURS * 3;
export const DAY_THREE_OVERFLOW_SEED = 2026091903;

// 固定选中的两头牲畜（多吉家 owner-c，12 头：SC-2026-00375 ~ SC-2026-00386）。
export const DAY_THREE_REGULAR_ANIMAL_ID = 'SC-2026-00376';
export const DAY_THREE_PROHIBITED_ANIMAL_ID = 'SC-2026-00380';

export const DAY_THREE_OVERFLOW_WINDOWS = [
  {
    type: 'regular',
    ownerId: 'owner-c',
    ownerName: '多吉家',
    targetAnimalId: DAY_THREE_REGULAR_ANIMAL_ID,
    dayHour: 9.5,
    durationHours: 3.5
  },
  {
    type: 'prohibited',
    ownerId: 'owner-c',
    ownerName: '多吉家',
    targetAnimalId: DAY_THREE_PROHIBITED_ANIMAL_ID,
    dayHour: 15,
    durationHours: 5.5
  }
];

// —— 禁牧区路径专用常量 ——
// 锚点至少深入禁牧区多远（米），保证「进入禁牧区」在地形上看得见。
const PROHIBITED_ENTRY_DEPTH_MIN_METERS = 200;
// 禁牧区内随机游走的步长区间（米）——与第 1 天放牧步长一致，保证运动自然。
const PROHIBITED_WANDER_STEP_MIN_METERS = 150;
const PROHIBITED_WANDER_STEP_MAX_METERS = 500;
// 游走点离禁牧区边界的最小余量，避免游走时滑出禁牧区。
const PROHIBITED_WANDER_BOUNDARY_CLEARANCE_METERS = 80;
// 共享边界判定容差（度）：活动范围边界点与禁牧区边界距离小于此值视为「共享段」。
const SHARED_BOUNDARY_TOLERANCE_DEGREES = 0.0008;
// 出口方向扇形搜索角度。
const PROHIBITED_EXIT_ANGLE_FAN = [0, 15, -15, 30, -30, 50, -50, 75, -75, 100, -100, 130, -130, 160, -160];
// 随机游走生成失败时的最大重试次数。
const PROHIBITED_WANDER_MAX_ATTEMPTS = 60;

const LATITUDE_METERS_PER_DEGREE = 111320;
const METERS_PER_DEGREE_LONGITUDE = LATITUDE_METERS_PER_DEGREE * Math.cos((33 * Math.PI) / 180);
const PROHIBITED_AREAS = AREAS.filter((area) => area.quality === '禁牧');
const PROHIBITED_POLYGONS = PROHIBITED_AREAS.map((area) => area.polygon);

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function metersBetween(start, end) {
  return degreesToMeters([end[0] - start[0], end[1] - start[1]]);
}

function offsetByMeters(origin, angle, distanceMeters) {
  return [
    origin[0] + (Math.cos(angle) * distanceMeters) / METERS_PER_DEGREE_LONGITUDE,
    origin[1] + (Math.sin(angle) * distanceMeters) / LATITUDE_METERS_PER_DEGREE
  ];
}

// —— 共享边界检测 ——
// area-c（多吉家活动范围）与 area-d（禁牧区）共享一段边界（DIVIDE[7]→DIVIDE[10]）。
// 这里通过几何距离自动找出共享段，不硬编码顶点。

// 活动范围边界上哪些点「紧贴」禁牧区边界 → 这些点构成交汇段。
function findSharedBoundarySegment(rangePolygon, prohibitedPolygon, toleranceDegrees) {
  const closePoints = [];
  for (let index = 0; index < rangePolygon.length; index += 1) {
    const vertex = rangePolygon[index];
    for (let sub = 0; sub < 8; sub += 1) {
      const ratio = sub / 8;
      const next = rangePolygon[(index + 1) % rangePolygon.length];
      const point = lerpGeo(vertex, next, ratio);
      let minDist = Infinity;
      for (let pi = 0; pi < prohibitedPolygon.length; pi += 1) {
        const pStart = prohibitedPolygon[pi];
        const pEnd = prohibitedPolygon[(pi + 1) % prohibitedPolygon.length];
        const d = distanceToSegment(point, pStart, pEnd);
        if (d < minDist) minDist = d;
      }
      if (minDist < toleranceDegrees) closePoints.push(point);
    }
  }
  if (!closePoints.length) return null;
  return closePoints.reduce(
    (sum, point) => [sum[0] + point[0] / closePoints.length, sum[1] + point[1] / closePoints.length],
    [0, 0]
  );
}

function distanceToSegment(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  const ratio = lengthSquared === 0
    ? 0
    : clamp(((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared, 0, 1);
  return Math.hypot(point[0] - (start[0] + ratio * dx), point[1] - (start[1] + ratio * dy));
}

// 禁牧区中心（所有禁牧区多边形的顶点均值）。
function computeProhibitedCenter() {
  const allPoints = PROHIBITED_POLYGONS.flat();
  return allPoints.reduce(
    (sum, point) => [sum[0] + point[0] / allPoints.length, sum[1] + point[1] / allPoints.length],
    [0, 0]
  );
}

const PROHIBITED_CENTER = computeProhibitedCenter();

// —— 禁牧区出口候选 ——
// 在活动范围边界上找「靠近禁牧区」的点作为出口。
// 优先使用共享边界段中点（最自然），退化时用距离排序。
function findProhibitedExitCandidates(rangePolygon, prohibitedPolygon, sharedCenter, start, end, limit) {
  const candidates = [];
  const seen = new Set();

  if (sharedCenter) {
    const key = `${sharedCenter[0].toFixed(6)}:${sharedCenter[1].toFixed(6)}`;
    if (!seen.has(key)) {
      seen.add(key);
      candidates.push({
        point: sharedCenter,
        total: metersBetween(start, sharedCenter) + metersBetween(sharedCenter, end)
      });
    }
  }

  for (let index = 0; index < rangePolygon.length; index += 1) {
    const edgeStart = rangePolygon[index];
    const edgeEnd = rangePolygon[(index + 1) % rangePolygon.length];
    const samplesPerEdge = 64;
    for (let step = 0; step <= samplesPerEdge; step += 1) {
      const ratio = step / samplesPerEdge;
      const point = lerpGeo(edgeStart, edgeEnd, ratio);
      let minProhibitedDist = Infinity;
      for (let pi = 0; pi < prohibitedPolygon.length; pi += 1) {
        const pStart = prohibitedPolygon[pi];
        const pEnd = prohibitedPolygon[(pi + 1) % prohibitedPolygon.length];
        const d = distanceToSegment(point, pStart, pEnd);
        if (d < minProhibitedDist) minProhibitedDist = d;
      }
      if (minProhibitedDist > 0.015) continue;
      const key = `${point[0].toFixed(6)}:${point[1].toFixed(6)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({
        point,
        total: metersBetween(start, point) + metersBetween(point, end),
        prohibitedDistance: minProhibitedDist
      });
    }
  }

  candidates.sort((left, right) => left.total - right.total);
  return candidates.slice(0, limit);
}

// 出口方向：从出口点指向禁牧区内部。
function prohibitedOutwardAngle(exitPoint, prohibitedPolygon) {
  const prohibitedCenter = polygonCenter(prohibitedPolygon);
  const dx = (prohibitedCenter[0] - exitPoint[0]) * METERS_PER_DEGREE_LONGITUDE;
  const dy = (prohibitedCenter[1] - exitPoint[1]) * LATITUDE_METERS_PER_DEGREE;
  if (Math.hypot(dx, dy) > 1) return Math.atan2(dy, dx);
  return 0;
}

// 从出口点沿某个角度深入禁牧区，找到首个合法游走起点。
// 起点必须距离所有禁牧区边界至少 clearance 米，确保后续随机游走不会立刻滑出。
function resolveProhibitedEntryPoint(exitPoint, baseAngle, targetDepthMeters, prohibitedPolygon, clearanceMeters) {
  const depths = [targetDepthMeters, targetDepthMeters * 1.5, targetDepthMeters * 2.5, targetDepthMeters * 3.5];
  for (const depth of depths) {
    for (const fanDegrees of PROHIBITED_EXIT_ANGLE_FAN) {
      const angle = baseAngle + (fanDegrees * Math.PI) / 180;
      const candidate = offsetByMeters(exitPoint, angle, depth);
      if (!isInsideMapBounds(candidate) || !pointInPolygon(candidate, prohibitedPolygon)) continue;
      const boundaryDistance = distanceToPolygonBoundary(candidate, prohibitedPolygon);
      if (boundaryDistance >= clearanceMeters) {
        return { angle, point: candidate, depthMeters: metersBetween(exitPoint, candidate) };
      }
    }
  }
  return null;
}

// 在禁牧区内生成随机游走航点序列。
// 每步从当前位置出发，随机方向走 stepMin~stepMax 米，
// 要求落点仍在禁牧区内且距边界 >= clearanceMeters。
// 如果某步找不到合法点，尝试缩小步长窗口；连续失败则终止。
function generateProhibitedWanderPoints(startPoint, prohibitedPolygon, clearanceMeters, totalTargetMeters, random) {
  const points = [];
  let current = startPoint;
  let accumulatedMeters = 0;
  let consecutiveFailures = 0;

  while (accumulatedMeters < totalTargetMeters) {
    let placed = false;
    for (let attempt = 0; attempt < PROHIBITED_WANDER_MAX_ATTEMPTS; attempt += 1) {
      const angle = random() * Math.PI * 2;
      const distance = lerp(PROHIBITED_WANDER_STEP_MIN_METERS, PROHIBITED_WANDER_STEP_MAX_METERS, random());
      const candidate = offsetByMeters(current, angle, distance);
      if (!isInsideMapBounds(candidate) || !pointInPolygon(candidate, prohibitedPolygon)) continue;
      if (distanceToPolygonBoundary(candidate, prohibitedPolygon) < clearanceMeters) continue;
      points.push(candidate);
      accumulatedMeters += metersBetween(current, candidate);
      current = candidate;
      placed = true;
      consecutiveFailures = 0;
      break;
    }
    if (!placed) {
      consecutiveFailures += 1;
      if (consecutiveFailures >= 3) break;
    }
  }
  return { points, lastPoint: current, accumulatedMeters };
}

// 整条路径必须在地图范围内（但允许进入禁牧区——这与第 2 天的 pathAvoidsProhibited 相反）。
function pathWithinMapBounds(coordinates) {
  for (let index = 0; index + 1 < coordinates.length; index += 1) {
    const start = coordinates[index];
    const end = coordinates[index + 1];
    const steps = Math.max(1, Math.ceil(metersBetween(start, end) / 40));
    for (let step = 0; step <= steps; step += 1) {
      if (!isInsideMapBounds(lerpGeo(start, end, step / steps))) return false;
    }
  }
  return true;
}

// —— 禁牧区越界路径 ——
// 起点 → 出口（共享边界）→ 禁牧区深处 → 禁牧区内随机游走 → 出口 → 终点。
// 运动逻辑与第 1 天放牧一致：正常步速 + 随机游走，不使用绕圈。
export function buildProhibitedOverflowGeoPath(entry, plan) {
  const start = geoPositionAtHour(plan, entry.startHour);
  const end = geoPositionAtHour(plan, entry.endHour);
  const polygon = entry.rangePolygon;
  const duration = entry.durationHours;
  const prohibitedPolygon = PROHIBITED_POLYGONS[0];

  const sharedCenter = findSharedBoundarySegment(polygon, prohibitedPolygon, SHARED_BOUNDARY_TOLERANCE_DEGREES);
  const exitCandidates = findProhibitedExitCandidates(
    polygon, prohibitedPolygon, sharedCenter, start, end, 24
  );
  if (!exitCandidates.length) {
    throw new Error(`[day3-overflow] ${entry.animalId} 无法找到通往禁牧区的出口`);
  }

  const stats = entry.speedStats;
  // 使用正常放牧步速（与第 1 天一致），不用加速倍率。
  // 随机游走自然消耗距离，不需要靠高速凑路程。
  const speed = clamp(stats.mean, OVERFLOW_SPEED_FLOOR_METERS_PER_HOUR, stats.p90);
  const totalMeters = speed * duration;

  const randomSeed = DAY_THREE_OVERFLOW_SEED
    + entry.animalId.split('').reduce((sum, character) => sum + character.charCodeAt(0), 0);
  const random = createSeededRandom(randomSeed);

  // 进出禁牧区的穿越距离（入口→深处 + 深处→出口）预留。
  const transitMetersEstimate = 800;
  const wanderTargetMeters = Math.max(500, totalMeters - transitMetersEstimate);

  let built = null;
  for (const candidate of exitCandidates) {
    const baseAngle = prohibitedOutwardAngle(candidate.point, prohibitedPolygon);
    const entryResolved = resolveProhibitedEntryPoint(
      candidate.point, baseAngle,
      PROHIBITED_WANDER_STEP_MAX_METERS, prohibitedPolygon,
      PROHIBITED_WANDER_BOUNDARY_CLEARANCE_METERS
    );
    if (!entryResolved) continue;

    const { point: deepEntry } = entryResolved;

    const wander = generateProhibitedWanderPoints(
      deepEntry, prohibitedPolygon,
      PROHIBITED_WANDER_BOUNDARY_CLEARANCE_METERS,
      wanderTargetMeters, random
    );

    const coordinates = [
      entry.startPoint ?? start,
      candidate.point,
      deepEntry,
      ...wander.points,
      candidate.point,
      entry.endPoint ?? end
    ];

    entry.startPoint = start;
    entry.endPoint = end;

    if (!pathWithinMapBounds(coordinates)) continue;
    built = { deepEntry, wanderPoints: wander.points, coordinates };
    break;
  }

  if (!built) throw new Error(`[day3-overflow] ${entry.animalId} 无法在禁牧区内生成合法越界路径`);

  const { deepEntry, coordinates } = built;
  const cumulativeMeters = [0];
  for (let index = 1; index < coordinates.length; index += 1) {
    cumulativeMeters.push(cumulativeMeters[index - 1] + metersBetween(coordinates[index - 1], coordinates[index]));
  }

  entry.anchor = deepEntry;
  entry.overflowGeoPath = coordinates;
  entry.overflowCumulativeMeters = cumulativeMeters;
  entry.overflowTotalMeters = cumulativeMeters[cumulativeMeters.length - 1];
  entry.overflowSpeedMetersPerHour = entry.overflowTotalMeters / duration;
  entry.overflowWanderRadiusMeters = coordinates.reduce(
    (maximum, point) => Math.max(maximum, metersBetween(deepEntry, point)),
    0
  );
  entry.dayOnePlan = plan;
  return entry;
}

// —— 排定第 3 天越界计划 ——
export function createDayThreeOverflowSchedule({
  livestock,
  ranges = HERDER_ACTIVITY_RANGES,
  sites = HERDER_SITES,
  plans
} = {}) {
  const motionPlans = plans ?? planDayOneMotions({ livestock, sites, ranges });
  const planByAnimal = new Map(motionPlans.map((plan) => [plan.animal, plan]));

  const schedule = DAY_THREE_OVERFLOW_WINDOWS.map((window) => {
    const animal = livestock.find((candidate) => candidate.id === window.targetAnimalId);
    if (!animal) throw new Error(`[day3-overflow] 找不到牲畜 ${window.targetAnimalId}`);
    if (animal.ownerId !== window.ownerId) {
      throw new Error(`[day3-overflow] ${animal.id} 不属于 ${window.ownerName}`);
    }

    const range = ranges.find((candidate) => candidate.ownerId === window.ownerId);
    if (!range) throw new Error(`[day3-overflow] 缺少 ${window.ownerName} 的活动范围定义`);

    const plan = planByAnimal.get(animal);
    if (!plan) throw new Error(`[day3-overflow] ${animal.id} 缺少第 1 天轨迹计划`);

    const startHour = DAY_THREE_START_HOUR + window.dayHour;
    const endHour = startHour + window.durationHours;

    // 步速统计：复用 day2 的逻辑。
    const speeds = [];
    const sampleStep = 0.05;
    let previous = geoPositionAtHour(plan, startHour);
    for (let hour = startHour + sampleStep; hour <= endHour + 1e-9; hour += sampleStep) {
      const current = geoPositionAtHour(plan, hour);
      speeds.push(metersBetween(previous, current) / sampleStep);
      previous = current;
    }
    const sorted = [...speeds].sort((left, right) => left - right);
    const speedStats = {
      mean: speeds.length ? speeds.reduce((sum, value) => sum + value, 0) / speeds.length : OVERFLOW_SPEED_FLOOR_METERS_PER_HOUR,
      p90: sorted.length ? sorted[Math.floor(0.9 * (sorted.length - 1))] : OVERFLOW_SPEED_FLOOR_METERS_PER_HOUR,
      max: sorted.length ? sorted[sorted.length - 1] : 0
    };

    return {
      animal,
      animalId: animal.id,
      ownerId: window.ownerId,
      ownerName: window.ownerName,
      overflowType: window.type,
      rangeId: range.id,
      rangePolygon: range.polygon,
      startHour,
      durationHours: window.durationHours,
      endHour,
      dayOnePlan: plan,
      exitMeters: 0,
      speedStats
    };
  });

  // 为每个越界事件生成路径。
  schedule.forEach((entry) => {
    const plan = planByAnimal.get(entry.animal) ?? entry.dayOnePlan;
    if (entry.overflowType === 'prohibited') {
      buildProhibitedOverflowGeoPath(entry, plan);
    } else {
      buildOverflowGeoPath(entry, plan);
    }
  });

  return schedule;
}

// —— 自检 ——
export function validateDayThreeOverflowSchedule(schedule) {
  const rows = schedule.map((entry) => ({
    编号: entry.animalId,
    类型: entry.overflowType === 'prohibited' ? '进入禁牧区' : '常规越界',
    牧户: entry.ownerName,
    越界开始: formatSimulationStamp(entry.startHour),
    越界结束: formatSimulationStamp(entry.endHour),
    持续小时: entry.durationHours,
    锚点: `${entry.anchor[0].toFixed(4)}°E / ${entry.anchor[1].toFixed(4)}°N`,
    锚点在禁牧区: isProhibitedPoint(entry.anchor),
    锚点在活动范围外: !pointInPolygon(entry.anchor, entry.rangePolygon),
    在地图范围内: isInsideMapBounds(entry.anchor)
  }));

  const problems = [];
  schedule.forEach((entry) => {
    if (entry.overflowType === 'prohibited' && !isProhibitedPoint(entry.anchor)) {
      problems.push(`${entry.animalId} 锚点不在禁牧区内`);
    }
    if (pointInPolygon(entry.anchor, entry.rangePolygon)) {
      problems.push(`${entry.animalId} 锚点在活动范围内`);
    }
    if (!isInsideMapBounds(entry.anchor)) {
      problems.push(`${entry.animalId} 锚点超出地图范围`);
    }
    const minDuration = entry.overflowType === 'prohibited' ? 5 : 3;
    const maxDuration = entry.overflowType === 'prohibited' ? 6 : 4;
    if (entry.durationHours < minDuration || entry.durationHours > maxDuration) {
      problems.push(`${entry.animalId} 越界时长 ${entry.durationHours}h 不在 ${minDuration}-${maxDuration}h 范围`);
    }
  });

  const summary = {
    天数: DAY_THREE,
    越界头数: schedule.length,
    常规越界: schedule.filter((entry) => entry.overflowType === 'regular').length,
    禁牧区越界: schedule.filter((entry) => entry.overflowType === 'prohibited').length,
    违规: problems,
    passed: problems.length === 0
  };

  console.groupCollapsed(`[day3-overflow] 第 ${DAY_THREE} 天越界事件自检（${schedule.length} 头）`);
  console.table(rows);
  console.info('[day3-overflow] 越界事件汇总:', summary);
  console.groupEnd();
  if (!summary.passed) console.error('[day3-overflow] 第 3 天越界计划自检未通过');
  return { rows, summary };
}

// 逐点采样自检：确认越界时段内走出活动范围、步速恒定。
export function validateDayThreeOverflowMotion(schedule, { sampleStepHours = 0.05 } = {}) {
  const rows = [];
  const problems = [];
  const speedSpikeTolerance = 1.05;

  schedule.forEach((entry) => {
    if (!entry.dayOnePlan) {
      problems.push(`${entry.animalId} 缺少第 1 天轨迹计划`);
      return;
    }

    let outsideInWindow = 0;
    let insideInWindow = 0;
    let outsideOutOfWindow = 0;
    const windowSpeeds = [];
    let prohibitedSamples = 0;

    const combinedPosition = (hour) => {
      const overflowPosition = overflowGeoPositionAtHour(entry, hour);
      return overflowPosition ?? geoPositionAtHour(entry.dayOnePlan, hour);
    };

    let previous = combinedPosition(entry.startHour - 1);
    for (let hour = entry.startHour - 1; hour <= entry.endHour + 1; hour += sampleStepHours) {
      const current = combinedPosition(hour);
      const stepMeters = metersBetween(previous, current);
      const insideRange = pointInPolygon(current, entry.rangePolygon);

      if (hour >= entry.startHour && hour < entry.endHour) {
        if (insideRange) insideInWindow += 1;
        else outsideInWindow += 1;
        const elapsedRatio = clamp((hour - entry.startHour) / entry.durationHours, 0, 1);
        if (elapsedRatio > 0.05 && elapsedRatio < 0.95) windowSpeeds.push(stepMeters / sampleStepHours);
        if (entry.overflowType === 'prohibited' && isProhibitedPoint(current)) prohibitedSamples += 1;
      } else if (!insideRange) {
        outsideOutOfWindow += 1;
      }
      previous = current;
    }

    const outsideRatio = outsideInWindow / Math.max(1, outsideInWindow + insideInWindow);
    const meanSpeed = windowSpeeds.length
      ? windowSpeeds.reduce((sum, value) => sum + value, 0) / windowSpeeds.length
      : 0;
    const maxSpeed = windowSpeeds.length ? Math.max(...windowSpeeds) : 0;
    const speedCeiling = Math.max(entry.speedStats.p90, entry.overflowSpeedMetersPerHour);
    const speedSpikeRatio = speedCeiling > 0 ? maxSpeed / speedCeiling : 0;

    const passed = outsideRatio >= 0.15
      && outsideOutOfWindow === 0
      && speedSpikeRatio <= speedSpikeTolerance
      && (entry.overflowType !== 'prohibited' || prohibitedSamples > 0);

    rows.push({
      编号: entry.animalId,
      类型: entry.overflowType === 'prohibited' ? '禁牧区' : '常规',
      范围外占比: `${Math.round(outsideRatio * 100)}%`,
      时段外越界: outsideOutOfWindow,
      禁牧区采样: entry.overflowType === 'prohibited' ? prohibitedSamples : '-',
      最快步速比P90: Number(speedSpikeRatio.toFixed(2)),
      结果: passed ? '正常' : '异常'
    });
    if (!passed) {
      problems.push(`${entry.animalId}（范围外 ${Math.round(outsideRatio * 100)}% / 时段外 ${outsideOutOfWindow}）`);
    }
  });

  const summary = {
    天数: DAY_THREE,
    越界头数: schedule.length,
    违规: problems,
    passed: problems.length === 0
  };

  console.groupCollapsed(`[day3-overflow] 第 ${DAY_THREE} 天越界运动自检`);
  console.table(rows);
  console.info('[day3-overflow] 运动汇总:', summary);
  console.groupEnd();
  if (problems.length > 0) console.error(`[day3-overflow] 运动异常：${problems.join('、')}`);
  return { rows, summary };
}
