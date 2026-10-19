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

const MIN_LIVESTOCK_DISTANCE_DEGREES = 0.0005;
const LIVESTOCK_RANDOM_SEED = 20260917;

// 位置约束按经纬度平面距离判断。目标范围很小（0.1° × 0.1°），
// 因此使用经度/纬度差的欧氏距离即可稳定避免光点重叠。
function distanceDegrees([longitudeA, latitudeA], [longitudeB, latitudeB]) {
  return Math.hypot(longitudeA - longitudeB, latitudeA - latitudeB);
}

function randomPointInPolygon(polygon, random, occupiedPoints) {
  const longitudes = polygon.map(([longitude]) => longitude);
  const latitudes = polygon.map(([, latitude]) => latitude);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);

  for (let attempt = 0; attempt < 1000; attempt += 1) {
    // 三次均匀采样取平均，使牲畜自然聚集在各户草场中心附近。
    const clusteredLongitude = (random() + random() + random()) / 3;
    const clusteredLatitude = (random() + random() + random()) / 3;
    const point = [
      minLongitude + clusteredLongitude * (maxLongitude - minLongitude),
      minLatitude + clusteredLatitude * (maxLatitude - minLatitude)
    ];
    if (
      pointInPolygon(point, polygon)
      && occupiedPoints.every((occupiedPoint) => distanceDegrees(point, occupiedPoint) >= MIN_LIVESTOCK_DISTANCE_DEGREES)
    ) {
      return { point, regenerated: attempt > 0, attempts: attempt + 1 };
    }
  }

  throw new Error(`[livestock] 无法在 1000 次尝试内生成满足最小间距 ${MIN_LIVESTOCK_DISTANCE_DEGREES}° 的位置`);
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

function applyStatusCorrections(statuses) {
  const corrections = new Map([
    [3, 'attention'],  // SC-2026-00345
    [19, 'normal']     // SC-2026-00361
  ]);
  corrections.forEach((desiredStatus, targetIndex) => {
    if (statuses[targetIndex] === desiredStatus) return;
    const sourceIndex = statuses.findIndex((status, index) => index !== targetIndex && status === desiredStatus);
    if (sourceIndex < 0) throw new Error(`[livestock] 无法为索引 ${targetIndex} 设置状态 ${desiredStatus}`);
    [statuses[targetIndex], statuses[sourceIndex]] = [statuses[sourceIndex], statuses[targetIndex]];
  });
  return statuses;
}

export function createLivestock() {
  const random = mulberry32(LIVESTOCK_RANDOM_SEED);
  const statuses = applyStatusCorrections(shuffledStatuses(random));
  const occupiedPoints = [];
  const regeneratedPositions = [];
  let index = 0;

  const livestock = OWNERS.flatMap((owner) => {
    const area = AREAS.find((candidate) => candidate.id === owner.areaId);
    return Array.from({ length: owner.count }, () => {
      const generatedPosition = randomPointInPolygon(area.polygon, random, occupiedPoints);
      const [longitude, latitude] = generatedPosition.point;
      occupiedPoints.push(generatedPosition.point);
      const generatedStatus = statuses[index];
      index += 1;
      const id = `SC-2026-${String(341 + index).padStart(5, '0')}`;
      const status = generatedStatus;
      const temperatureBase = status === 'abnormal' ? 40.1 : status === 'attention' ? 39.3 : 38.5;
      const heartRateBase = status === 'abnormal' ? 96 : status === 'attention' ? 84 : 72;
      const ruminationBase = status === 'abnormal' ? 22 : status === 'attention' ? 28 : 46;
      const temperature = Number((temperatureBase + (random() - 0.5) * 0.6).toFixed(1));
      const heartRate = Math.round(heartRateBase + (random() - 0.5) * 10);
      const rumination = Math.round(ruminationBase + (random() - 0.5) * 8);
      const recordedAt = `2026-09-16T${String(9 + Math.floor(index / 50)).padStart(2, '0')}:${String((index * 7) % 60).padStart(2, '0')}:00+08:00`;
      if (generatedPosition.regenerated) regeneratedPositions.push({ id, attempts: generatedPosition.attempts });
      return {
        id,
        ownerId: owner.id,
        ownerName: owner.name,
        areaId: owner.areaId,
        longitude,
        latitude,
        status,
        positionRegenerated: generatedPosition.regenerated,
        positionAttempts: generatedPosition.attempts,
        positionConstraintFailed: Boolean(generatedPosition.constraintFailed),
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

  if (regeneratedPositions.length) {
    console.info('[livestock] 为满足最小间距重新生成位置:', regeneratedPositions);
  }

  const positionRows = livestock.map(({ id, status, longitude, latitude }) => ({
    id,
    status,
    longitude: longitude.toFixed(6),
    latitude: latitude.toFixed(6)
  }));
  console.table(positionRows);

  const statusCounts = livestock.reduce((counts, animal) => {
    counts[animal.status] = (counts[animal.status] ?? 0) + 1;
    return counts;
  }, {});
  const ownerCounts = livestock.reduce((counts, animal) => {
    counts[animal.ownerName] = (counts[animal.ownerName] ?? 0) + 1;
    return counts;
  }, {});
  const areaCounts = livestock.reduce((counts, animal) => {
    counts[animal.areaId] = (counts[animal.areaId] ?? 0) + 1;
    return counts;
  }, {});
  console.info('[livestock] 全量重新生成后的统计:', {
    total: livestock.length,
    randomSeed: LIVESTOCK_RANDOM_SEED,
    statusCounts,
    ownerCounts,
    areaCounts
  });

  let minimumDistance = Infinity;
  let closestPair = null;
  const violations = [];
  for (let firstIndex = 0; firstIndex < livestock.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < livestock.length; secondIndex += 1) {
      const first = livestock[firstIndex];
      const second = livestock[secondIndex];
      const distance = distanceDegrees(
        [first.longitude, first.latitude],
        [second.longitude, second.latitude]
      );
      if (distance < minimumDistance) {
        minimumDistance = distance;
        closestPair = [first.id, second.id];
      }
      if (distance < MIN_LIVESTOCK_DISTANCE_DEGREES) {
        violations.push({ first: first.id, second: second.id, distance });
      }
    }
  }
  console.info('[livestock] 位置间距校验:', {
    thresholdDegrees: MIN_LIVESTOCK_DISTANCE_DEGREES,
    minimumDistanceDegrees: minimumDistance,
    closestPair,
    violations
  });
  if (violations.length) {
    throw new Error(`[livestock] 位置间距校验失败：${violations.length} 对光点小于 ${MIN_LIVESTOCK_DISTANCE_DEGREES}°`);
  }
  return livestock;
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
