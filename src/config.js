export const MAP_BOUNDS = [101.95, 32.95, 102.05, 33.05];
export const MAP_CENTER = { longitude: 102, latitude: 33 };

// One shared outer boundary and shared interior vertices make the four zones a
// topologically closed partition rather than four independent shapes.
const DIVIDE = [
  [102.002, 33.046], [101.997, 33.038], [102.001, 33.030], [101.996, 33.021],
  [101.999, 33.012], [101.997, 33.002], [102.002, 32.993], [101.998, 32.984],
  [102.003, 32.975], [101.999, 32.965], [101.998, 32.954]
];
const TOP_LEFT = [[101.952, 33.042], [101.960, 33.046], [101.970, 33.048], [101.982, 33.047], [101.992, 33.049], DIVIDE[0]];
const TOP_RIGHT = [DIVIDE[0], [102.013, 33.048], [102.024, 33.046], [102.035, 33.047], [102.047, 33.041], [102.049, 33.031], [102.047, 33.020], [102.050, 33.009], [102.048, 32.997]];
const BOTTOM_RIGHT = [[102.048, 32.997], [102.049, 32.986], [102.046, 32.973], [102.041, 32.957], [102.031, 32.953], [102.020, 32.955], [102.010, 32.951], DIVIDE[10]];
const BOTTOM_LEFT = [DIVIDE[10], [101.987, 32.952], [101.975, 32.954], [101.964, 32.952], [101.955, 32.958], [101.951, 32.969], [101.953, 32.981]];
const LEFT_EDGE = [[101.953, 32.981], [101.950, 32.993], [101.952, 33.005], [101.950, 33.016], [101.953, 33.029], [101.952, 33.042]];
const LEFT_DIVIDE = [[101.953, 32.981], [101.963, 32.984], [101.974, 32.981], [101.984, 32.986], [101.991, 32.981], DIVIDE[7]];
const RIGHT_DIVIDE = [DIVIDE[6], [102.012, 32.989], [102.022, 32.994], [102.033, 32.990], [102.042, 32.994], [102.048, 32.997]];
const reverse = (points) => [...points].reverse();

export const TOTAL_BOUNDARY = [...TOP_LEFT, ...TOP_RIGHT.slice(1), ...BOTTOM_RIGHT.slice(1), ...BOTTOM_LEFT.slice(1), ...LEFT_EDGE.slice(1)];

export const AREAS = [
  {
    id: 'area-a',
    name: '北部优良草场',
    quality: '优良',
    capacity: 18,
    color: 0x35c978,
    polygon: [...TOP_LEFT, ...DIVIDE.slice(1, 8), ...reverse(LEFT_DIVIDE).slice(1), ...LEFT_EDGE.slice(1)]
  },
  {
    id: 'area-b',
    name: '东北一般草场',
    quality: '一般',
    capacity: 16,
    color: 0xf0cf45,
    polygon: [...TOP_RIGHT, ...reverse(RIGHT_DIVIDE).slice(1), ...reverse(DIVIDE.slice(0, 7)).slice(1)]
  },
  {
    id: 'area-c',
    name: '西南退化草场',
    quality: '较差',
    capacity: 15,
    color: 0xe58b38,
    polygon: [...reverse(BOTTOM_LEFT), ...reverse(DIVIDE.slice(7)).slice(1), ...reverse(LEFT_DIVIDE).slice(1)]
  },
  {
    id: 'area-d',
    name: '东南禁牧区',
    quality: '禁牧',
    capacity: 0,
    color: 0xe04443,
    polygon: [...RIGHT_DIVIDE, ...BOTTOM_RIGHT.slice(1), ...reverse(DIVIDE.slice(6)).slice(1)]
  }
];

export const OWNERS = [
  { id: 'owner-a', name: '扎西家', count: 15, areaId: 'area-a' },
  { id: 'owner-b', name: '卓玛家', count: 18, areaId: 'area-b' },
  { id: 'owner-c', name: '多吉家', count: 12, areaId: 'area-c' },
  { id: 'owner-d', name: '央金家', count: 15, areaId: 'area-a' }
];

// 固定的牧民定居点与夜间休息区。休息区均位于可放牧草场内；
// 央金家统一归属 area-a：牲畜统计、定居点、休息区、活动范围四处一致，
// 不再涉及禁牧区 area-d。
export const HERDER_SITES = [
  {
    id: 'site-owner-a',
    ownerId: 'owner-a',
    ownerName: '扎西家',
    settlementAreaId: 'area-a',
    grazingAreaId: 'area-a',
    settlement: { longitude: 101.969, latitude: 33.032 },
    restZone: {
      id: 'rest-owner-a',
      areaId: 'area-a',
      polygon: [
        [101.965, 33.029], [101.970, 33.028], [101.974, 33.031],
        [101.972, 33.036], [101.967, 33.035]
      ]
    }
  },
  {
    id: 'site-owner-b',
    ownerId: 'owner-b',
    ownerName: '卓玛家',
    settlementAreaId: 'area-b',
    grazingAreaId: 'area-b',
    settlement: { longitude: 102.030, latitude: 33.027 },
    restZone: {
      id: 'rest-owner-b',
      areaId: 'area-b',
      polygon: [
        [102.025, 33.023], [102.031, 33.021], [102.036, 33.025],
        [102.034, 33.031], [102.028, 33.030], [102.024, 33.027]
      ]
    }
  },
  {
    id: 'site-owner-c',
    ownerId: 'owner-c',
    ownerName: '多吉家',
    settlementAreaId: 'area-c',
    grazingAreaId: 'area-c',
    settlement: { longitude: 101.970, latitude: 32.970 },
    restZone: {
      id: 'rest-owner-c',
      areaId: 'area-c',
      polygon: [
        [101.965, 32.966], [101.971, 32.963], [101.977, 32.967],
        [101.976, 32.974], [101.970, 32.978], [101.965, 32.974]
      ]
    }
  },
  {
    id: 'site-owner-d',
    ownerId: 'owner-d',
    ownerName: '央金家',
    settlementAreaId: 'area-a',
    grazingAreaId: 'area-a',
    settlement: { longitude: 101.985, latitude: 33.005 },
    restZone: {
      id: 'rest-owner-d',
      areaId: 'area-a',
      polygon: [
        [101.980, 33.001], [101.986, 32.998], [101.991, 33.002],
        [101.990, 33.008], [101.985, 33.011], [101.980, 33.007]
      ]
    }
  }
];

// 每户活动范围（＝该户放牧区 + 休息区），仅作为数据层定义，不渲染到大屏。
// area-b / area-c 内各只有一户，活动范围就是整块草场；
// area-a 内有两户（扎西家在北部、央金家在南部），用一条不规则分界线南北分治，
// 两户共用同一条分界线，四户活动范围两两不重叠。
const AREA_POLYGON = Object.fromEntries(AREAS.map((area) => [area.id, area.polygon]));

export const HERDER_ACTIVITY_RANGES = [
  {
    id: 'range-owner-a',
    ownerId: 'owner-a',
    ownerName: '扎西家',
    areaId: 'area-a',
    restZoneId: 'rest-owner-a',
    // area-a 北部：北侧草场 + 扎西家休息区
    polygon: [
      [101.9512, 33.021], [101.953, 33.029], [101.952, 33.042], [101.960, 33.046],
      [101.970, 33.048], [101.982, 33.047], [101.992, 33.049], [102.002, 33.046],
      [101.997, 33.038], [102.001, 33.030], [101.996, 33.021],
      [101.986, 33.019], [101.978, 33.023], [101.968, 33.020], [101.960, 33.024]
    ]
  },
  {
    id: 'range-owner-b',
    ownerId: 'owner-b',
    ownerName: '卓玛家',
    areaId: 'area-b',
    restZoneId: 'rest-owner-b',
    polygon: AREA_POLYGON['area-b']
  },
  {
    id: 'range-owner-c',
    ownerId: 'owner-c',
    ownerName: '多吉家',
    areaId: 'area-c',
    restZoneId: 'rest-owner-c',
    polygon: AREA_POLYGON['area-c']
  },
  {
    id: 'range-owner-d',
    ownerId: 'owner-d',
    ownerName: '央金家',
    areaId: 'area-a',
    restZoneId: 'rest-owner-d',
    // area-a 南部：南侧草场 + 央金家休息区
    polygon: [
      [101.996, 33.021], [101.999, 33.012], [101.997, 33.002], [102.002, 32.993],
      [101.998, 32.984], [101.991, 32.981], [101.984, 32.986], [101.974, 32.981],
      [101.963, 32.984], [101.953, 32.981], [101.950, 32.993], [101.952, 33.005],
      [101.950, 33.016], [101.9512, 33.021],
      [101.960, 33.024], [101.968, 33.020], [101.978, 33.023], [101.986, 33.019]
    ]
  }
];

// —— 数据层自检：四户活动范围两两不重叠 ——
// 相邻活动范围共用同一条边界线属于“相接”，只有真正的面积交叠才算重叠。
const GEOMETRY_EPSILON = 1e-9;

function pointInPolygon([x, y], polygon) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const [currentX, currentY] = polygon[index];
    const [previousX, previousY] = polygon[previous];
    const intersects = currentY > y !== previousY > y
      && x < ((previousX - currentX) * (y - currentY)) / (previousY - currentY) + currentX;
    if (intersects) inside = !inside;
  }
  return inside;
}

function orientation([ax, ay], [bx, by], [cx, cy]) {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

function distanceToSegment([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const ratio = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  return Math.hypot(px - (ax + ratio * dx), py - (ay + ratio * dy));
}

function onBoundary(point, polygon) {
  return polygon.some((start, index) => (
    distanceToSegment(point, start, polygon[(index + 1) % polygon.length]) <= GEOMETRY_EPSILON
  ));
}

function strictlyInside(point, polygon) {
  return !onBoundary(point, polygon) && pointInPolygon(point, polygon);
}

function edgesCrossProperly(firstStart, firstEnd, secondStart, secondEnd) {
  const firstOrientation = orientation(firstStart, firstEnd, secondStart);
  const secondOrientation = orientation(firstStart, firstEnd, secondEnd);
  const thirdOrientation = orientation(secondStart, secondEnd, firstStart);
  const fourthOrientation = orientation(secondStart, secondEnd, firstEnd);
  const straddlesFirst = (firstOrientation > GEOMETRY_EPSILON && secondOrientation < -GEOMETRY_EPSILON)
    || (firstOrientation < -GEOMETRY_EPSILON && secondOrientation > GEOMETRY_EPSILON);
  const straddlesSecond = (thirdOrientation > GEOMETRY_EPSILON && fourthOrientation < -GEOMETRY_EPSILON)
    || (thirdOrientation < -GEOMETRY_EPSILON && fourthOrientation > GEOMETRY_EPSILON);
  return straddlesFirst && straddlesSecond;
}

function edgeMidpoint([ax, ay], [bx, by]) {
  return [(ax + bx) / 2, (ay + by) / 2];
}

function sameVertexSet(first, second) {
  const matches = (point, polygon) => polygon.some(([x, y]) => (
    Math.abs(x - point[0]) <= GEOMETRY_EPSILON && Math.abs(y - point[1]) <= GEOMETRY_EPSILON
  ));
  return first.length === second.length && first.every((point) => matches(point, second));
}

function polygonsOverlap(first, second) {
  if (sameVertexSet(first, second)) return true;

  for (let firstIndex = 0; firstIndex < first.length; firstIndex += 1) {
    const firstStart = first[firstIndex];
    const firstEnd = first[(firstIndex + 1) % first.length];
    for (let secondIndex = 0; secondIndex < second.length; secondIndex += 1) {
      const secondStart = second[secondIndex];
      const secondEnd = second[(secondIndex + 1) % second.length];
      if (edgesCrossProperly(firstStart, firstEnd, secondStart, secondEnd)) return true;
    }
  }

  const probesInside = (source, target) => source.some((start, index) => {
    const end = source[(index + 1) % source.length];
    return strictlyInside(start, target) || strictlyInside(edgeMidpoint(start, end), target);
  });
  return probesInside(first, second) || probesInside(second, first);
}

export function validateHerderActivityRanges(ranges = HERDER_ACTIVITY_RANGES) {
  const overlapPairs = [];
  for (let firstIndex = 0; firstIndex < ranges.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < ranges.length; secondIndex += 1) {
      if (polygonsOverlap(ranges[firstIndex].polygon, ranges[secondIndex].polygon)) {
        overlapPairs.push(`${ranges[firstIndex].ownerName} ↔ ${ranges[secondIndex].ownerName}`);
      }
    }
  }

  console.groupCollapsed('[herder-activity] 四户活动范围（仅数据层，不上屏）');
  ranges.forEach((range) => {
    console.info(`${range.ownerName}（${range.ownerId}，${range.areaId}）`, range.polygon);
  });
  console.info('[herder-activity] 不重叠校验:', {
    ownerCount: ranges.length,
    overlapPairs,
    passed: overlapPairs.length === 0
  });
  console.groupEnd();

  if (overlapPairs.length > 0) {
    throw new Error(`[herder-activity] 活动范围存在重叠：${overlapPairs.join('、')}`);
  }
  return { overlapPairs, passed: true };
}

validateHerderActivityRanges();

export const STATUS = {
  normal: { label: '正常', color: 0x00e676, cssColor: '#00E676' },
  attention: { label: '需关注', color: 0xffd600, cssColor: '#FFD600' },
  abnormal: { label: '异常', color: 0xff1744, cssColor: '#FF1744' },
  offline: { label: '掉线', color: 0xe3f2fd, cssColor: '#E3F2FD' }
};
