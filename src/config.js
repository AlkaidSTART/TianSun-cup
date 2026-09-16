export const MAP_BOUNDS = [101.95, 32.95, 102.05, 33.05];
export const MAP_CENTER = { longitude: 102, latitude: 33 };

export const AREAS = [
  {
    id: 'area-a',
    name: '北部优良草场',
    quality: '优良',
    capacity: 18,
    color: 0x236b45,
    polygon: [[101.954, 33.008], [101.996, 33.008], [101.994, 33.046], [101.956, 33.044]]
  },
  {
    id: 'area-b',
    name: '东北一般草场',
    quality: '一般',
    capacity: 16,
    color: 0x9aaa3f,
    polygon: [[102.004, 33.008], [102.046, 33.008], [102.044, 33.044], [102.006, 33.046]]
  },
  {
    id: 'area-c',
    name: '西南退化草场',
    quality: '较差',
    capacity: 15,
    color: 0xb28b43,
    polygon: [[101.956, 32.956], [101.994, 32.954], [101.996, 32.992], [101.954, 32.992]]
  },
  {
    id: 'area-d',
    name: '东南禁牧区',
    quality: '禁牧',
    capacity: 0,
    color: 0xc64135,
    polygon: [[102.006, 32.954], [102.044, 32.956], [102.046, 32.992], [102.004, 32.992]]
  }
];

export const OWNERS = [
  { id: 'owner-a', name: '扎西家', count: 15, areaId: 'area-a' },
  { id: 'owner-b', name: '卓玛家', count: 18, areaId: 'area-b' },
  { id: 'owner-c', name: '多吉家', count: 12, areaId: 'area-c' },
  { id: 'owner-d', name: '央金家', count: 15, areaId: 'area-d' }
];

export const STATUS = {
  normal: { label: '正常', color: 0x39d98a },
  attention: { label: '需关注', color: 0xf4c95d },
  abnormal: { label: '异常', color: 0xff5c5c }
};
