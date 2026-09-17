import { AREAS, OWNERS } from './config.js';

function mulberry32(seed) {
  return function random() {
    let value = seed += 0x6d2b79f5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function pointInPolygon([x, y], polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function randomPointInPolygon(polygon, random) {
  const longitudes = polygon.map(([longitude]) => longitude);
  const latitudes = polygon.map(([, latitude]) => latitude);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);

  for (let attempt = 0; attempt < 100; attempt += 1) {
    // 三次均匀采样取平均，使牲畜自然聚集在各户草场中心附近。
    const clusteredLongitude = (random() + random() + random()) / 3;
    const clusteredLatitude = (random() + random() + random()) / 3;
    const point = [
      minLongitude + clusteredLongitude * (maxLongitude - minLongitude),
      minLatitude + clusteredLatitude * (maxLatitude - minLatitude)
    ];
    if (pointInPolygon(point, polygon)) return point;
  }

  return polygon[0];
}

function shuffledStatuses(random) {
  const statuses = [
    ...Array(48).fill('normal'),
    ...Array(9).fill('attention'),
    ...Array(3).fill('abnormal')
  ];
  for (let index = statuses.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [statuses[index], statuses[other]] = [statuses[other], statuses[index]];
  }
  return statuses;
}

export function createLivestock() {
  const random = mulberry32(7319);
  const statuses = shuffledStatuses(random);
  let index = 0;

  return OWNERS.flatMap((owner) => {
    const area = AREAS.find((candidate) => candidate.id === owner.areaId);
    return Array.from({ length: owner.count }, () => {
      const [longitude, latitude] = randomPointInPolygon(area.polygon, random);
      const status = statuses[index];
      const temperatureBase = status === 'abnormal' ? 40.1 : status === 'attention' ? 39.3 : 38.5;
      const heartRateBase = status === 'abnormal' ? 96 : status === 'attention' ? 84 : 72;
      const ruminationBase = status === 'abnormal' ? 22 : status === 'attention' ? 28 : 46;
      index += 1;
      const id = `SC-2026-${String(341 + index).padStart(5, '0')}`;
      const temperature = Number((temperatureBase + (random() - 0.5) * 0.6).toFixed(1));
      const heartRate = Math.round(heartRateBase + (random() - 0.5) * 10);
      const rumination = Math.round(ruminationBase + (random() - 0.5) * 8);
      const recordedAt = `2026-09-16T${String(9 + Math.floor(index / 50)).padStart(2, '0')}:${String((index * 7) % 60).padStart(2, '0')}:00+08:00`;
      return {
        id,
        ownerId: owner.id,
        ownerName: owner.name,
        areaId: owner.areaId,
        longitude,
        latitude,
        status,
        temperature,
        heartRate,
        profile: {
          livestockId: id,
          type: '牛',
          breed: ['九龙牦牛', '麦洼牦牛', '阿坝牦牛'][index % 3]
        },
        device: {
          deviceId: `COLLAR-AB-${String(index).padStart(4, '0')}`,
          deviceType: 'GNSS 智能项圈',
          protocol: 'MQTT',
          lastSeenAt: recordedAt
        },
        telemetry: {
          recordedAt,
          healthStatus: status,
          metrics: {
            bodyTemperature: { value: temperature, unit: '°C', normalRange: [37.5, 39.5] },
            heartRate: { value: heartRate, unit: '次/分', normalRange: [40, 80] },
            rumination: { value: rumination, unit: '次/天', normalRange: [30, 60] }
          },
          location: {
            longitude,
            latitude,
            coordinateSystem: 'WGS84'
          }
        }
      };
    });
  });
}

export function getAreaMetrics(area, livestock) {
  const currentLoad = livestock.filter((animal) => animal.areaId === area.id).length;
  const pressure = area.capacity === 0 ? (currentLoad > 0 ? Infinity : 0) : currentLoad / area.capacity;
  return {
    currentLoad,
    pressure,
    overloaded: pressure > 1
  };
}

export { pointInPolygon };
