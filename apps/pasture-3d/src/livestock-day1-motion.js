// 第 1 天早出晚归轨迹：纯几何 / 纯数据，不依赖 DOM，可在 Node 里直接跑自检。
//
// 时间线：06:00-07:00 出牧 · 07:00-17:00 放牧 · 17:00-18:00 归牧 · 18:00-06:00 休息
// 约束：所有航点以及航点之间的线段都必须落在该牧户 HERDER_ACTIVITY_RANGES 的多边形内。
import { pointInPolygon } from './livestock-sprites.js';

export const DAY_ONE = 1;
export const DAY_ONE_PHASE_HOURS = { outbound: 6, grazing: 7, returning: 17, resting: 18 };
export const ROUTE_WAYPOINT_COUNT = 8;
export const SEGMENT_SAMPLE_COUNT = 64;
export const DAY_ONE_MOTION_SEED = 2026091701;
export const ANIMAL_SEED_STRIDE = 7919;
export const REST_ANCHOR_VERTEX_RATIO = 0.58;

const ROUTE_ATTEMPTS = 400;
const FIRST_LEG_DISTANCES = [[0.012, 0.026], [0.008, 0.014], [0.004, 0.009], [0.0015, 0.004]];
const GRAZING_LEG_DISTANCES = [[0.0035, 0.009], [0.0015, 0.004]];

export function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function lerp(first, second, ratio) {
  return first + (second - first) * ratio;
}

export function smoothStep(value) {
  const clamped = clamp(value, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

export function normalizeHour(hour) {
  return ((hour % 24) + 24) % 24;
}

export function phaseLabelAtHour(hour) {
  const normalized = normalizeHour(hour);
  if (normalized >= DAY_ONE_PHASE_HOURS.outbound && normalized < DAY_ONE_PHASE_HOURS.grazing) return '出牧';
  if (normalized >= DAY_ONE_PHASE_HOURS.grazing && normalized < DAY_ONE_PHASE_HOURS.returning) return '放牧';
  if (normalized >= DAY_ONE_PHASE_HOURS.returning && normalized < DAY_ONE_PHASE_HOURS.resting) return '归牧';
  return '休息';
}

export function createSeededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ result >>> 15, result | 1);
    result ^= result + Math.imul(result ^ result >>> 7, result | 61);
    return ((result ^ result >>> 14) >>> 0) / 4294967296;
  };
}

export function polygonCenter(polygon) {
  const total = polygon.reduce(
    (sum, [longitude, latitude]) => [sum[0] + longitude, sum[1] + latitude],
    [0, 0]
  );
  return [total[0] / polygon.length, total[1] / polygon.length];
}

export function segmentStaysInPolygon(start, end, polygon, sampleCount = SEGMENT_SAMPLE_COUNT) {
  for (let index = 0; index <= sampleCount; index += 1) {
    const progress = index / sampleCount;
    const point = [lerp(start[0], end[0], progress), lerp(start[1], end[1], progress)];
    if (!pointInPolygon(point, polygon)) return false;
  }
  return true;
}

export function lerpGeo(first, second, ratio) {
  return [lerp(first[0], second[0], ratio), lerp(first[1], second[1], ratio)];
}

// 夜间休息锚点：休息区中心朝某个边界顶点偏移 58%，落在休息区内部。
export function createRestAnchor(restZonePolygon, restPointIndex, ratio = REST_ANCHOR_VERTEX_RATIO) {
  const center = polygonCenter(restZonePolygon);
  const vertex = restZonePolygon[((restPointIndex % restZonePolygon.length) + restZonePolygon.length)
    % restZonePolygon.length];
  return lerpGeo(center, vertex, ratio);
}

function randomRoutePoint(origin, [minimumDistance, maximumDistance], polygon, random) {
  for (let attempt = 0; attempt < ROUTE_ATTEMPTS; attempt += 1) {
    const angle = random() * Math.PI * 2;
    const distance = lerp(minimumDistance, maximumDistance, random());
    const candidate = [
      origin[0] + Math.cos(angle) * distance,
      origin[1] + Math.sin(angle) * distance
    ];
    if (pointInPolygon(candidate, polygon) && segmentStaysInPolygon(origin, candidate, polygon)) {
      return candidate;
    }
  }
  return null;
}

function routePointWithFallback(origin, windows, polygon, random) {
  for (const window of windows) {
    const candidate = randomRoutePoint(origin, window, polygon, random);
    if (candidate) return candidate;
  }
  return null;
}

// 出牧目标点（休息区 → 放牧区，约 1.3-2.9 公里）与随后的放牧航点，全部受活动范围约束。
export function createDayOneRoute({ restAnchor, rangePolygon, random }) {
  const firstPoint = routePointWithFallback(restAnchor, FIRST_LEG_DISTANCES, rangePolygon, random);
  if (!firstPoint) {
    throw new Error('[day1-motion] 无法在该牧户活动范围内生成出牧目标点');
  }

  const waypoints = [firstPoint];
  let current = firstPoint;
  for (let index = 1; index < ROUTE_WAYPOINT_COUNT; index += 1) {
    const next = routePointWithFallback(current, GRAZING_LEG_DISTANCES, rangePolygon, random) ?? current;
    waypoints.push(next);
    current = next;
  }
  return waypoints;
}

function geoAlongPath(waypoints, progress) {
  if (waypoints.length === 1) return [...waypoints[0]];
  const scaled = clamp(progress, 0, 1) * (waypoints.length - 1);
  const index = Math.min(Math.floor(scaled), waypoints.length - 2);
  return lerpGeo(waypoints[index], waypoints[index + 1], smoothStep(scaled - index));
}

// 与场景里的世界坐标插值一一对应，只是改在经纬度空间计算，便于校验是否越界。
export function geoPositionAtHour(plan, hour) {
  const { restAnchor, waypoints } = plan;
  const normalizedHour = normalizeHour(hour);
  if (!waypoints.length) return [...restAnchor];
  if (normalizedHour >= DAY_ONE_PHASE_HOURS.outbound && normalizedHour < DAY_ONE_PHASE_HOURS.grazing) {
    return lerpGeo(restAnchor, waypoints[0], smoothStep(normalizedHour - DAY_ONE_PHASE_HOURS.outbound));
  }
  if (normalizedHour >= DAY_ONE_PHASE_HOURS.grazing && normalizedHour < DAY_ONE_PHASE_HOURS.returning) {
    return geoAlongPath(waypoints, (normalizedHour - DAY_ONE_PHASE_HOURS.grazing) / 10);
  }
  if (normalizedHour >= DAY_ONE_PHASE_HOURS.returning && normalizedHour < DAY_ONE_PHASE_HOURS.resting) {
    return lerpGeo(
      waypoints[waypoints.length - 1],
      restAnchor,
      smoothStep(normalizedHour - DAY_ONE_PHASE_HOURS.returning)
    );
  }
  return [...restAnchor];
}

// 为每头牲畜排定第 1 天轨迹：按各自的随机种子出牧/放牧/归牧。
// 第 1 天掉线名单同样要拿到轨迹——掉线期间由 livestock-offline.js 冻结在原地，恢复后继续走当天轨迹。
export function planDayOneMotions({ livestock, sites, ranges }) {
  const ownerIndexes = new Map();
  return livestock.map((animal, animalIndex) => {
    const range = ranges.find((candidate) => candidate.ownerId === animal.ownerId);
    if (!range) throw new Error(`[day1-motion] ${animal.id} 所属牧户 ${animal.ownerId} 缺少活动范围定义`);

    const site = sites.find((candidate) => candidate.ownerId === animal.ownerId);
    if (!site?.restZone?.polygon?.length) {
      throw new Error(`[day1-motion] ${animal.id} 所属牧户 ${animal.ownerId} 缺少夜间休息区`);
    }

    const ownerIndex = ownerIndexes.get(animal.ownerId) ?? 0;
    ownerIndexes.set(animal.ownerId, ownerIndex + 1);
    const restAnchor = createRestAnchor(site.restZone.polygon, ownerIndex);
    const random = createSeededRandom(DAY_ONE_MOTION_SEED + animalIndex * ANIMAL_SEED_STRIDE);
    const waypoints = createDayOneRoute({ restAnchor, rangePolygon: range.polygon, random });
    return { animal, range, moving: true, restAnchor, waypoints };
  });
}

// 自检：每头牲畜的运动范围、全天采样是否越界。
export function validateDayOneMotion(plans, { sampleStepHours = 0.25 } = {}) {
  const rows = [];
  const violatingAnimals = [];
  let sampledPositions = 0;
  let outOfRangeSamples = 0;

  for (const plan of plans) {
    const { animal, range, restAnchor, waypoints, moving } = plan;
    const polygon = range.polygon;
    const path = moving ? [restAnchor, ...waypoints, restAnchor] : [[animal.longitude, animal.latitude]];
    const outOfRangeWaypoints = path.filter((point) => !pointInPolygon(point, polygon)).length;
    const brokenSegments = [];
    for (let index = 0; index + 1 < path.length; index += 1) {
      if (!segmentStaysInPolygon(path[index], path[index + 1], polygon)) brokenSegments.push(index + 1);
    }

    let animalOutOfRangeSamples = 0;
    for (let hour = 0; hour < 24; hour += sampleStepHours) {
      sampledPositions += 1;
      if (!pointInPolygon(geoPositionAtHour(plan, hour), polygon)) animalOutOfRangeSamples += 1;
    }
    outOfRangeSamples += animalOutOfRangeSamples;

    const passed = outOfRangeWaypoints === 0 && brokenSegments.length === 0 && animalOutOfRangeSamples === 0;
    rows.push({
      编号: animal.id,
      牧户: animal.ownerName,
      状态: animal.status,
      运动范围: range.id,
      范围顶点数: polygon.length,
      轨迹航点: waypoints.length,
      越界航点: outOfRangeWaypoints,
      越界线段: brokenSegments.length,
      全天越界采样: animalOutOfRangeSamples,
      结果: passed ? '范围内' : '越界'
    });
    if (!passed) violatingAnimals.push(animal.id);
  }

  const summary = {
    天数: DAY_ONE,
    牲畜总数: plans.length,
    运动牲畜: plans.filter((plan) => plan.moving).length,
    原地牲畜: plans.filter((plan) => !plan.moving).length,
    活动范围数: new Set(plans.map((plan) => plan.range.id)).size,
    全天采样点数: sampledPositions,
    越界采样点数: outOfRangeSamples,
    越界牲畜: violatingAnimals,
    passed: violatingAnimals.length === 0
  };

  console.groupCollapsed(`[day1-motion] 第 ${DAY_ONE} 天运动自检 · 每头牲畜的运动范围`);
  console.table(rows);
  console.info('[day1-motion] 第 1 天汇总:', summary);
  console.groupEnd();
  if (violatingAnimals.length > 0) {
    console.error(`[day1-motion] 第 1 天出现越界：${violatingAnimals.join('、')}`);
  }
  return { rows, summary, violatingAnimals };
}
