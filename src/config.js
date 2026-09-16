export const MAP_BOUNDS = [101.95, 32.95, 102.05, 33.05];
export const MAP_CENTER = { longitude: 102, latitude: 33 };

export const AREAS = [
  {
    id: 'area-a',
    name: '北部优良草场',
    quality: '优良',
    capacity: 18,
    color: 0x35c978,
    polygon: [[101.954, 33.009], [101.972, 33.004], [101.991, 33.010], [101.997, 33.027], [101.986, 33.045], [101.967, 33.047], [101.953, 33.034]]
  },
  {
    id: 'area-b',
    name: '东北一般草场',
    quality: '一般',
    capacity: 16,
    color: 0xf0cf45,
    polygon: [[102.005, 33.010], [102.022, 33.004], [102.043, 33.011], [102.048, 33.028], [102.040, 33.046], [102.018, 33.044], [102.003, 33.030]]
  },
  {
    id: 'area-c',
    name: '西南退化草场',
    quality: '较差',
    capacity: 15,
    color: 0xe58b38,
    polygon: [[101.954, 32.969], [101.963, 32.955], [101.982, 32.953], [101.997, 32.966], [101.991, 32.987], [101.973, 32.995], [101.955, 32.986]]
  },
  {
    id: 'area-d',
    name: '东南禁牧区',
    quality: '禁牧',
    capacity: 0,
    color: 0xe04443,
    polygon: [[102.009, 32.961], [102.027, 32.953], [102.044, 32.960], [102.048, 32.979], [102.038, 32.995], [102.019, 32.991], [102.003, 32.977]]
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
