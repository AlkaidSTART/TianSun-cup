import * as THREE from 'three';
import { AREAS, HERDER_ACTIVITY_RANGES, HERDER_SITES, OWNERS, STATUS } from './config.js';

const LIVESTOCK_COUNT = 60;
const MIN_DISTANCE_DEGREES = 0.002;
const MAX_POSITION_ATTEMPTS = 1000;
const RANDOM_SEED = 2026091701;
const OFFLINE_COUNT = 4;
const VALID_STATUSES = new Set(['normal', 'attention', 'abnormal', 'offline']);
// Reduce the previous marker size by 20%.
export const BASE_SPRITE_SIZE = 149.76;
const ABNORMAL_SPRITE_SIZE = 172.8;
const SELECTED_SPRITE_SIZE = 172.8;
const REFERENCE_CAMERA_DISTANCE = 16000;
const MIN_DISTANCE_SCALE = 0.75;
const MAX_DISTANCE_SCALE = 1.5;
const SCALE_DAMPING = 8;

function createSeededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ result >>> 15, result | 1);
    result ^= result + Math.imul(result ^ result >>> 7, result | 61);
    return ((result ^ result >>> 14) >>> 0) / 4294967296;
  };
}

function distanceDegrees(first, second) {
  return Math.hypot(first[0] - second[0], first[1] - second[1]);
}

export function pointInPolygon([x, y], polygon) {
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

function randomPointInPolygon(polygon, random, occupiedPositions) {
  const longitudes = polygon.map(([longitude]) => longitude);
  const latitudes = polygon.map(([, latitude]) => latitude);
  const minimumLongitude = Math.min(...longitudes);
  const maximumLongitude = Math.max(...longitudes);
  const minimumLatitude = Math.min(...latitudes);
  const maximumLatitude = Math.max(...latitudes);

  for (let attempt = 1; attempt <= MAX_POSITION_ATTEMPTS; attempt += 1) {
    const position = [
      THREE.MathUtils.lerp(minimumLongitude, maximumLongitude, random()),
      THREE.MathUtils.lerp(minimumLatitude, maximumLatitude, random())
    ];
    const isFarEnough = occupiedPositions.every(
      (occupiedPosition) => distanceDegrees(position, occupiedPosition) >= MIN_DISTANCE_DEGREES
    );
    if (pointInPolygon(position, polygon) && isFarEnough) return position;
  }

  throw new Error(`[livestock-sprites] 位置生成失败：${MAX_POSITION_ATTEMPTS} 次尝试后仍无法满足 ${MIN_DISTANCE_DEGREES}° 最小间距`);
}

// 第 1 天掉线名单：固定种子洗牌后选出 OFFLINE_COUNT 头，只标记「谁会在第 1 天掉线」。
// 掉线/恢复的具体时刻由 livestock-offline.js 的时间表驱动，因此这里的 status 一律等于健康状态。
function createStatuses(random) {
  const statuses = [
    ...Array(48).fill('normal'),
    ...Array(9).fill('attention'),
    ...Array(3).fill('abnormal')
  ];
  for (let index = statuses.length - 1; index > 0; index -= 1) {
    const otherIndex = Math.floor(random() * (index + 1));
    [statuses[index], statuses[otherIndex]] = [statuses[otherIndex], statuses[index]];
  }

  const offlineRandom = createSeededRandom(RANDOM_SEED ^ 0x0ff11e);
  const candidateIndexes = Array.from({ length: statuses.length }, (_, index) => index);
  for (let index = candidateIndexes.length - 1; index > 0; index -= 1) {
    const otherIndex = Math.floor(offlineRandom() * (index + 1));
    [candidateIndexes[index], candidateIndexes[otherIndex]] = [candidateIndexes[otherIndex], candidateIndexes[index]];
  }
  const offlineIndexes = new Set(candidateIndexes.slice(0, OFFLINE_COUNT));
  return statuses.map((healthStatus, index) => ({
    status: healthStatus,
    lastHealthStatus: healthStatus,
    dayOfflineCandidate: offlineIndexes.has(index)
  }));
}

export function createLivestockData() {
  const random = createSeededRandom(RANDOM_SEED);
  const statusAssignments = createStatuses(random);
  const occupiedPositions = [];
  let livestockIndex = 0;

  const livestock = OWNERS.flatMap((owner) => {
    const site = HERDER_SITES.find((candidate) => candidate.ownerId === owner.id);
    const grazingAreaId = site?.grazingAreaId ?? owner.areaId;
    const area = AREAS.find((candidate) => candidate.id === grazingAreaId);
    if (!area || area.quality === '禁牧') {
      throw new Error(`[livestock-sprites] 牧户 ${owner.name} 没有合法的可放牧草场`);
    }
    // 出生位置以该牧户的活动范围（放牧区 + 休息区）为边界，而不是整块草场：
    // area-a 由扎西家（北）与央金家（南）分治，用整块草场会把牲畜放到对方范围里。
    const activityRange = HERDER_ACTIVITY_RANGES.find((candidate) => candidate.ownerId === owner.id);
    const spawnPolygon = activityRange?.polygon ?? area.polygon;

    return Array.from({ length: owner.count }, () => {
      const [longitude, latitude] = randomPointInPolygon(spawnPolygon, random, occupiedPositions);
      occupiedPositions.push([longitude, latitude]);
      const { status, lastHealthStatus, dayOfflineCandidate } = statusAssignments[livestockIndex];
      const sequence = livestockIndex + 1;
      const id = `SC-2026-${String(341 + sequence).padStart(5, '0')}`;
      livestockIndex += 1;

      const metricStatus = status;
      const temperatureBase = metricStatus === 'abnormal' ? 40.1 : metricStatus === 'attention' ? 39.3 : 38.5;
      const heartRateBase = metricStatus === 'abnormal' ? 96 : metricStatus === 'attention' ? 84 : 72;
      const ruminationBase = metricStatus === 'abnormal' ? 22 : metricStatus === 'attention' ? 28 : 46;
      const temperature = Number((temperatureBase + (random() - 0.5) * 0.6).toFixed(1));
      const heartRate = Math.round(heartRateBase + (random() - 0.5) * 10);
      const rumination = Math.round(ruminationBase + (random() - 0.5) * 8);
      const recordedAt = `2026-09-17T${String(9 + Math.floor(sequence / 50)).padStart(2, '0')}:${String((sequence * 7) % 60).padStart(2, '0')}:00+08:00`;

      return {
        id,
        ownerId: owner.id,
        ownerName: owner.name,
        areaId: grazingAreaId,
        longitude,
        latitude,
        status,
        // 第 1 天掉线名单标记（具体掉线时刻见 livestock-offline.js）
        dayOfflineCandidate,
        // 掉线相关字段：出生时为空，设备掉线期间由模拟时钟写入
        lastOnlineTime: null,
        offlineDuration: 0,
        temperature,
        heartRate,
        rumination,
        animalType: sequence % 4 === 0 ? '羊' : '牛',
        profile: {
          livestockId: id,
          type: sequence % 4 === 0 ? '羊' : '牛',
          breed: ['九龙牦牛', '麦洼牦牛', '阿坝牦牛'][sequence % 3]
        },
        device: {
          deviceId: `COLLAR-AB-${String(sequence).padStart(4, '0')}`,
          deviceType: 'GNSS 智能项圈',
          protocol: 'MQTT',
          lastSeenAt: recordedAt
        },
        telemetry: {
          recordedAt,
          healthStatus: status,
          lastHealthStatus,
          metrics: {
            bodyTemperature: { value: temperature, unit: '°C', normalRange: [37.5, 39.5] },
            heartRate: { value: heartRate, unit: '次/分', normalRange: [40, 80] },
            rumination: { value: rumination, unit: '次/天', normalRange: [30, 60] }
          },
          location: { longitude, latitude, coordinateSystem: 'WGS84' }
        }
      };
    });
  });

  if (livestock.length !== LIVESTOCK_COUNT) {
    throw new Error(`[livestock-sprites] 数据数量错误：期望 ${LIVESTOCK_COUNT}，实际 ${livestock.length}`);
  }
  return livestock;
}

function validatePositions(livestock) {
  let minimumDistance = Infinity;
  let closestPair = null;
  const violations = [];

  for (let firstIndex = 0; firstIndex < livestock.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < livestock.length; secondIndex += 1) {
      const first = livestock[firstIndex];
      const second = livestock[secondIndex];
      const distance = distanceDegrees([first.longitude, first.latitude], [second.longitude, second.latitude]);
      if (distance < minimumDistance) {
        minimumDistance = distance;
        closestPair = [first.id, second.id];
      }
      if (distance < MIN_DISTANCE_DEGREES) {
        violations.push({ firstId: first.id, secondId: second.id, distanceDegrees: distance });
      }
    }
  }

  console.table(livestock.map((animal) => ({
    id: animal.id,
    status: animal.status,
    color: STATUS[animal.status].cssColor,
    longitude: animal.longitude.toFixed(6),
    latitude: animal.latitude.toFixed(6)
  })));
  console.info('[livestock-sprites] 位置自检:', {
    total: livestock.length,
    randomSeed: RANDOM_SEED,
    thresholdDegrees: MIN_DISTANCE_DEGREES,
    minimumDistanceDegrees: minimumDistance,
    closestPair,
    violations
  });
  const statusCounts = Object.fromEntries([...VALID_STATUSES].map((status) => [
    status,
    livestock.filter((animal) => animal.status === status).length
  ]));
  const offlineCandidateIds = livestock.filter((animal) => animal.dayOfflineCandidate).map((animal) => animal.id);
  console.info('[livestock-sprites] 出生状态数量自检:', statusCounts);
  console.info('[livestock-sprites] 第 1 天掉线名单（固定种子）:', offlineCandidateIds);
  if (violations.length > 0) throw new Error(`[livestock-sprites] 发现 ${violations.length} 对间距违规光点`);
  return { minimumDistance, closestPair, violations };
}

function createMarkerTexture({ outerGlowOpacity = 0.34, name = 'livestock-marker-alpha' } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');

  // A soft outer halo is baked into the same texture so every animal still
  // owns exactly one Sprite. The material tint applies the status color to
  // both the solid core and its glow.
  const outerGlow = context.createRadialGradient(64, 64, 34, 64, 64, 64);
  outerGlow.addColorStop(0, `rgba(255,255,255,${outerGlowOpacity})`);
  outerGlow.addColorStop(0.45, `rgba(255,255,255,${outerGlowOpacity * 0.65})`);
  outerGlow.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = outerGlow;
  context.fillRect(0, 0, 128, 128);

  const core = context.createRadialGradient(64, 64, 0, 64, 64, 48);
  core.addColorStop(0, 'rgba(255,255,255,1)');
  core.addColorStop(0.55, 'rgba(255,255,255,1)');
  core.addColorStop(0.8, 'rgba(255,255,255,0.62)');
  core.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = core;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.name = name;
  return texture;
}

function createStatusMaterials(markerTextures) {
  return Object.fromEntries(Object.entries(STATUS).map(([status, definition]) => {
    if (!VALID_STATUSES.has(status)) throw new Error(`[livestock-sprites] 非法状态配置：${status}`);
    const material = new THREE.SpriteMaterial({
      map: status === 'offline' ? markerTextures.offline : markerTextures.default,
      color: definition.color,
      transparent: true,
      opacity: 1,
      alphaTest: 0.008,
      depthTest: true,
      depthWrite: false,
      sizeAttenuation: true,
      toneMapped: false
    });
    material.name = `livestock-${status}`;
    material.userData = { status, cssColor: definition.cssColor };
    return [status, material];
  }));
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function run() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

export function createLivestockSpriteSystem({ scene, sampleGround, groundOffset = 2 }) {
  const livestock = createLivestockData();
  const positionValidation = validatePositions(livestock);
  const markerTextures = {
    default: createMarkerTexture(),
    offline: createMarkerTexture({
      outerGlowOpacity: 0.44,
      name: 'livestock-marker-offline-alpha'
    })
  };
  const materials = createStatusMaterials(markerTextures);
  const sprites = [];
  const spriteWorldPosition = new THREE.Vector3();
  let lastScaleUpdateTime = 0;
  const spriteGroup = new THREE.Group();
  spriteGroup.name = 'livestock-sprite-group';
  spriteGroup.position.y = 40;
  spriteGroup.userData = { kind: 'livestock-sprite-group' };
  scene.add(spriteGroup);

  function getAnimalScale(animal, selected = false) {
    if (selected) return SELECTED_SPRITE_SIZE;
    return animal.status === 'abnormal' ? ABNORMAL_SPRITE_SIZE : BASE_SPRITE_SIZE;
  }

  function getDistanceScaleFactor(sprite, camera) {
    sprite.getWorldPosition(spriteWorldPosition);
    const distance = camera.position.distanceTo(spriteWorldPosition);
    return THREE.MathUtils.clamp(
      distance / REFERENCE_CAMERA_DISTANCE,
      MIN_DISTANCE_SCALE,
      MAX_DISTANCE_SCALE
    );
  }

  function getDisplayScale(sprite) {
    const animal = sprite.userData.animal;
    return getAnimalScale(animal, sprite.userData.selected) * (sprite.userData.distanceScaleFactor ?? 1);
  }

  function removeSprites() {
    for (const sprite of sprites) spriteGroup.remove(sprite);
    for (const animal of livestock) delete animal.sprite;
    sprites.length = 0;
    for (const child of [...scene.children]) {
      if (child.userData?.kind === 'animal') scene.remove(child);
    }
  }

  function validateSprites() {
    const spriteUuids = sprites.map((sprite) => sprite.uuid);
    const duplicateSpriteUuids = spriteUuids.filter((uuid, index) => spriteUuids.indexOf(uuid) !== index);
    const materialMismatches = livestock
      .filter((animal) => animal.sprite?.material !== materials[animal.status])
      .map((animal) => animal.id);
    const missingSprites = livestock.filter((animal) => !animal.sprite).map((animal) => animal.id);
    const invalidStatuses = livestock.filter((animal) => !VALID_STATUSES.has(animal.status)).map((animal) => animal.id);
    const validation = {
      spriteCount: sprites.length,
      expectedSpriteCount: LIVESTOCK_COUNT,
      duplicateSpriteUuids,
      missingSprites,
      invalidStatuses,
      materialMismatches,
      oneSpritePerLivestock: sprites.length === LIVESTOCK_COUNT
        && duplicateSpriteUuids.length === 0
        && missingSprites.length === 0
    };
    console.info('[livestock-sprites] Sprite 自检:', validation);
    if (!validation.oneSpritePerLivestock || invalidStatuses.length || materialMismatches.length) {
      throw new Error('[livestock-sprites] Sprite 自检失败，请查看控制台');
    }
    return validation;
  }

  async function createSprites() {
    removeSprites();
    const groundPoints = await mapWithConcurrency(livestock, 8, (animal) => sampleGround(animal.longitude, animal.latitude));
    const failedAnimals = livestock.filter((_, index) => !groundPoints[index]).map((animal) => animal.id);
    if (failedAnimals.length) throw new Error(`[livestock-sprites] ${failedAnimals.length} 个光点地形采样失败：${failedAnimals.join(', ')}`);

    livestock.forEach((animal, index) => {
      if (animal.sprite) throw new Error(`[livestock-sprites] ${animal.id} 已经绑定 Sprite，禁止重复创建`);
      const material = materials[animal.status];
      if (!material) throw new Error(`[livestock-sprites] ${animal.id} 状态无对应材质：${animal.status}`);
      const sprite = new THREE.Sprite(material);
      const groundPoint = groundPoints[index];
      sprite.position.set(
        groundPoint.x,
        groundPoint.y + groundOffset,
        groundPoint.z
      );
      sprite.scale.setScalar(getAnimalScale(animal));
      sprite.renderOrder = 5;
      sprite.userData = {
        kind: 'animal',
        animal,
        selected: false,
        distanceScaleFactor: 1
      };
      animal.sprite = sprite;
      sprites.push(sprite);
      spriteGroup.add(sprite);
    });
    return validateSprites();
  }

  function setStatus(animal, status) {
    if (!VALID_STATUSES.has(status)) throw new Error(`[livestock-sprites] 不允许的状态：${status}`);
    animal.status = status;
    animal.telemetry.healthStatus = status;
    if (animal.sprite) {
      animal.sprite.material = materials[status];
      animal.sprite.scale.setScalar(getDisplayScale(animal.sprite));
    }
  }

  function setSelected(sprite, selected) {
    if (!sprite?.userData?.animal) return;
    sprite.userData.selected = selected;
    sprite.scale.setScalar(getDisplayScale(sprite));
  }

  function update(time, camera) {
    const breathing = (Math.sin((time / 1400) * Math.PI * 2 - Math.PI / 2) + 1) / 2;
    materials.abnormal.opacity = THREE.MathUtils.lerp(0.4, 1, breathing);

    if (!camera || sprites.length === 0) return;
    const deltaSeconds = lastScaleUpdateTime
      ? Math.min((time - lastScaleUpdateTime) / 1000, 0.1)
      : 0;
    lastScaleUpdateTime = time;
    const smoothing = deltaSeconds === 0 ? 1 : 1 - Math.exp(-SCALE_DAMPING * deltaSeconds);

    for (const sprite of sprites) {
      const targetFactor = getDistanceScaleFactor(sprite, camera);
      sprite.userData.distanceScaleFactor = THREE.MathUtils.lerp(
        sprite.userData.distanceScaleFactor ?? targetFactor,
        targetFactor,
        smoothing
      );
      const targetScale = getDisplayScale(sprite);
      const currentScale = sprite.scale.x || targetScale;
      sprite.scale.setScalar(THREE.MathUtils.lerp(currentScale, targetScale, smoothing));
    }
  }

  function dispose() {
    removeSprites();
    scene.remove(spriteGroup);
    Object.values(materials).forEach((material) => material.dispose());
    Object.values(markerTextures).forEach((texture) => texture.dispose());
  }

  return {
    livestock,
    sprites,
    spriteGroup,
    materials,
    positionValidation,
    createSprites,
    removeSprites,
    validateSprites,
    getAnimalScale,
    setSelected,
    setStatus,
    update,
    dispose
  };
}

export function getAreaMetrics(area, livestock) {
  const currentLoad = livestock.filter((animal) => animal.areaId === area.id).length;
  const pressure = area.capacity === 0 ? (currentLoad > 0 ? Infinity : 0) : currentLoad / area.capacity;
  return { currentLoad, pressure, overloaded: pressure > 1 };
}

export { MIN_DISTANCE_DEGREES, RANDOM_SEED };
