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
  { id: 'owner-d', name: '央金家', count: 15, areaId: 'area-d' }
];

// 固定的牧民定居点与夜间休息区。休息区均位于可放牧草场内；
// 央金家的牲畜统计仍保留原有 area-d 归属，但其居住设施单独落在 area-a，
// 避免将定居点或休息区放入禁牧区。
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

export const STATUS = {
  normal: { label: '正常', color: 0x00e676, cssColor: '#00E676' },
  attention: { label: '需关注', color: 0xffd600, cssColor: '#FFD600' },
  abnormal: { label: '异常', color: 0xff1744, cssColor: '#FF1744' },
  offline: { label: '掉线', color: 0xe3f2fd, cssColor: '#E3F2FD' }
};
