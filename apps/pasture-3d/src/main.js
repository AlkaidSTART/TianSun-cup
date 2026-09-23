import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { TileMap } from 'three-tile';
import { AREAS, HERDER_ACTIVITY_RANGES, HERDER_SITES, MAP_BOUNDS, MAP_CENTER, STATUS } from './config.js';
import { createLivestockSpriteSystem, getAreaMetrics } from './livestock-sprites.js';
import {
  DAY_ONE,
  DAY_ONE_PHASE_HOURS,
  normalizeHour,
  phaseLabelAtHour,
  planDayOneMotions,
  smoothStep,
  validateDayOneMotion
} from './livestock-day1-motion.js';
import {
  REJOIN_HOURS,
  createDayOneOfflineSchedule,
  hoursSinceOfflineStart,
  hoursSinceRecovery,
  isOfflineAtHour,
  validateDayOneOfflineSchedule
} from './livestock-offline.js';
import {
  SIMULATION_TOTAL_HOURS,
  attachOverflowPaths,
  createDayTwoOverflowSchedule,
  dayIndexAtHour,
  formatSimulationStamp,
  isProhibitedPoint,
  overflowActualExitHour,
  overflowGeoPositionAtHour,
  overflowReentryHour,
  overflowWorldPositionAtHour,
  validateDayTwoOverflowMotion,
  validateDayTwoOverflowSchedule
} from './livestock-day2-overflow.js';
import {
  createDayThreeOverflowSchedule,
  validateDayThreeOverflowMotion,
  validateDayThreeOverflowSchedule
} from './livestock-day3-overflow.js';
import { createOverflowMarkerLayer } from './overflow-marker.js';
import { createMapSources } from './map-sources.js';
import './style.css';

const token = import.meta.env.VITE_TIANDITU_TOKEN?.trim();
const root = document.querySelector('#scene-container');
const loadingPanel = document.querySelector('#loading-panel');
const loadingTitle = document.querySelector('#loading-title');
const loadingMessage = document.querySelector('#loading-message');
const serviceStatus = document.querySelector('#service-status');
const serviceDot = document.querySelector('#service-dot');
const detailPanel = document.querySelector('#detail-panel');
const detailKicker = document.querySelector('#detail-kicker');
const detailTitle = document.querySelector('#detail-title');
const detailContent = document.querySelector('#detail-content');
const modelPreview = document.querySelector('#model-preview');
const statusFilter = document.querySelector('#status-filter');
const ownerFilter = document.querySelector('#owner-filter');
const visibleCount = document.querySelector('#visible-count');
const normalCount = document.querySelector('#normal-count');
const attentionCount = document.querySelector('#attention-count');
const abnormalCount = document.querySelector('#abnormal-count');
const offlineCount = document.querySelector('#offline-count');
const offlineAlert = document.querySelector('#offline-alert');
const sceneTooltip = document.querySelector('#scene-tooltip');
const simulationTime = document.querySelector('#simulation-time');
const simulationTimeLabel = document.querySelector('#simulation-time-label');
const simulationDayLabel = document.querySelector('#simulation-day-label');
const simulationSpeed = document.querySelector('#simulation-speed');
const simulationToggle = document.querySelector('#simulation-toggle');
const messageList = document.querySelector('#message-list');
const messageCount = document.querySelector('#message-count');
const messageClear = document.querySelector('#message-clear');
const prohibitedModal = document.querySelector('#prohibited-modal');
const prohibitedModalBody = document.querySelector('#prohibited-modal-body');
const prohibitedModalDismiss = document.querySelector('#prohibited-modal-dismiss');
const prohibitedModalDetail = document.querySelector('#prohibited-modal-detail');

const MESSAGE_KINDS = {
  overflow: { icon: '！' },
  prohibited: { icon: '🚫' },
  offline: { icon: '📴' },
  recover: { icon: '✅' },
};

function formatMessageTime(date = new Date()) {
  return date.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function createMessageFeed() {
  const items = [];
  let nextId = 0;

  function isPinnedToLatest() {
    if (!messageList) return true;
    return messageList.scrollHeight - messageList.scrollTop - messageList.clientHeight < 24;
  }

  function scrollToLatest() {
    if (!messageList) return;
    // 直接对齐到最新消息：平滑滚动在部分环境下会中途停止，导致最新消息没进入可视区
    messageList.scrollTop = messageList.scrollHeight;
  }

  function renderEmptyState() {
    if (!messageList || items.length) return;
    const empty = document.createElement('li');
    empty.className = 'message-empty';
    empty.textContent = '暂无消息';
    messageList.append(empty);
  }

  function updateCount() {
    if (messageCount) messageCount.textContent = String(items.length);
  }

  function createRow(item, animate) {
    const row = document.createElement('li');
    row.className = animate ? 'message-item new' : 'message-item';
    row.dataset.kind = item.kind;
    row.dataset.id = item.id;
    const icon = document.createElement('span');
    icon.className = 'message-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = item.icon;
    const body = document.createElement('span');
    body.className = 'message-text';
    body.textContent = item.text;
    const stamp = document.createElement('span');
    stamp.className = 'message-time';
    stamp.textContent = item.time;
    row.append(icon, body, stamp);
    return row;
  }

  function push({ kind = 'overflow', text = '', time = formatMessageTime(), animate = true } = {}) {
    if (!messageList) return null;
    const meta = MESSAGE_KINDS[kind] ?? MESSAGE_KINDS.overflow;
    const item = { id: `msg-${++nextId}`, kind, text, time, icon: meta.icon };
    const pinned = isPinnedToLatest();
    const wasEmpty = items.length === 0;

    if (wasEmpty) messageList.replaceChildren();
    messageList.append(createRow(item, animate));

    items.push(item);
    updateCount();
    if (pinned) {
      scrollToLatest();
      // 列表首次出现滚动条会触发重新换行，补一次对齐，确保最新消息进入可视区
      requestAnimationFrame(() => {
        if (pinned) scrollToLatest();
      });
    }
    return item;
  }

  // 按时间轴整体重绘：只显示「模拟时间 ≤ 当前进度」的消息，因此拖动进度条能正反过滤。
  function setItems(entries) {
    if (!messageList) return;
    items.length = 0;
    messageList.replaceChildren();
    if (!entries.length) {
      renderEmptyState();
      updateCount();
      return;
    }
    entries.forEach((entry) => {
      const meta = MESSAGE_KINDS[entry.kind] ?? MESSAGE_KINDS.overflow;
      const item = {
        id: `msg-${++nextId}`,
        kind: entry.kind,
        text: entry.text,
        time: entry.time,
        icon: meta.icon
      };
      items.push(item);
      messageList.append(createRow(item, false));
    });
    updateCount();
    scrollToLatest();
  }

  function clear() {
    items.length = 0;
    if (messageList) messageList.replaceChildren();
    renderEmptyState();
    updateCount();
  }

  return { push, setItems, clear, scrollToLatest, items };
}

const messageFeed = createMessageFeed();
window.__messageFeed = messageFeed;

// 消息卡片固定左下角：高度取屏幕 33%（上限 360px）并与图例面板避让，再整体收 10%。
function layoutMessageFeed() {
  const feed = document.querySelector('#message-feed');
  const legend = document.querySelector('.legend-panel');
  const bar = document.querySelector('.statusbar');
  if (!feed || !legend) return;
  const gap = 12;
  const heightScale = 0.9;
  const preferredHeight = Math.min(innerHeight * 0.33, 360);
  const bottomOffset = bar ? innerHeight - bar.getBoundingClientRect().top : 46;
  const available = innerHeight - legend.getBoundingClientRect().bottom - gap - bottomOffset;
  feed.style.height = `${Math.max(158, Math.min(preferredHeight, available) * heightScale)}px`;
}

messageClear?.addEventListener('click', () => messageFeed.clear());

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8ba3b1);
scene.fog = new THREE.FogExp2(0x8ba3b1, 0.0000032);

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 100, 1500000);
camera.up.set(0, 1, 0);
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
root.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 1.8));
const sun = new THREE.DirectionalLight(0xfff2d2, 2.8);
sun.position.set(-60000, 120000, 80000);
scene.add(sun);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.screenSpacePanning = false;
controls.maxPolarAngle = Math.PI * 0.48;

const TERRAIN_OVERLAY_OFFSET = 2;
const TERRAIN_LINE_OFFSET = 4;
const SETTLEMENT_GROUND_OFFSET = 2;
const LIVESTOCK_MOTION_GROUND_OFFSET = 10;
const areaMeshes = [];
const areaLineMaterials = [];
const siteObjects = [];
const restZoneMeshes = [];
const restZoneLineMaterials = [];
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const pointerDown = new THREE.Vector2();
let selectedObject = null;
let hoveredArea = null;
let hoveredFeature = null;
let map;
let terrainAvailable = true;
let demLabel = 'DEM';
let simulationHour = 10;
let simulationHoursPerSecond = 1;
let simulationRunning = true;
let lastAnimationTime = 0;

function setServiceState(message, state = 'loading') {
  serviceStatus.textContent = message;
  serviceDot.dataset.state = state;
}

function showFatal(title, message) {
  loadingPanel.classList.remove('hidden');
  loadingTitle.textContent = title;
  loadingMessage.textContent = message;
  loadingPanel.classList.add('error');
  setServiceState(title, 'error');
}

function hideLoading() {
  loadingPanel.classList.add('hidden');
  setServiceState(terrainAvailable ? `天地图影像 · ${demLabel} 在线` : `卫星影像在线 · ${demLabel} 暂无数据`, terrainAvailable ? 'ready' : 'error');
}

function makeStripedTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  context.fillStyle = 'rgba(150, 20, 20, .42)';
  context.fillRect(0, 0, 64, 64);
  context.strokeStyle = 'rgba(255, 70, 60, .95)';
  context.lineWidth = 9;
  for (let offset = -64; offset < 128; offset += 24) {
    context.beginPath();
    context.moveTo(offset, 64);
    context.lineTo(offset + 64, 0);
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(6, 6);
  return texture;
}

function positionCamera(tileMap) {
  tileMap.updateMatrixWorld(true);
  const center = tileMap.geo2world(new THREE.Vector3(MAP_CENTER.longitude, MAP_CENTER.latitude, 0));
  const northWest = tileMap.geo2world(new THREE.Vector3(MAP_BOUNDS[0], MAP_BOUNDS[3], 0));
  const southEast = tileMap.geo2world(new THREE.Vector3(MAP_BOUNDS[2], MAP_BOUNDS[1], 0));
  const span = northWest.distanceTo(southEast);
  const distance = Math.max(span * 0.9, 12000);
  controls.target.copy(center);
  camera.position.copy(center).add(new THREE.Vector3(distance * 0.52, distance * 0.72, distance * 0.66));
  camera.lookAt(center);
  camera.near = Math.max(100, distance / 1500);
  camera.far = distance * 12;
  camera.updateProjectionMatrix();
  controls.minDistance = 150;
  controls.maxDistance = distance * 3;
  controls.update();
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

async function sampleGround(longitude, latitude, level = 12) {
  if (!terrainAvailable) return map.geo2world(new THREE.Vector3(longitude, latitude, 0));
  const detailed = await map.getLocalInfoFromGeoDetailed(new THREE.Vector3(longitude, latitude, 0), level);
  return detailed?.point?.clone() ?? null;
}

const livestockSpriteSystem = createLivestockSpriteSystem({
  scene,
  sampleGround,
  groundOffset: LIVESTOCK_MOTION_GROUND_OFFSET
});
const { livestock, sprites: animalSprites } = livestockSpriteSystem;

// —— 第 1 天设备掉线 ——
// 掉线名单来自 livestock-sprites.js 的固定种子标记，掉线时刻/时长见 livestock-offline.js。
const offlineSchedule = createDayOneOfflineSchedule(livestock);
const offlineEntriesByAnimal = new Map(offlineSchedule.map((entry) => [entry.animal, entry]));
offlineSchedule.forEach((entry) => {
  entry.isOffline = false;
  entry.frozenPosition = null;
  entry.rejoinComplete = true;
});
const offlineValidation = validateDayOneOfflineSchedule(offlineSchedule);
window.__dayOneOffline = { schedule: offlineSchedule, validation: offlineValidation, applyOfflineState };

// —— 第 2 天越界 ——
// 名单 / 时刻 / 锚点全部来自 livestock-day2-overflow.js（固定种子），这里只负责上屏。
const overflowSchedule = createDayTwoOverflowSchedule({ livestock, ranges: HERDER_ACTIVITY_RANGES });
const overflowEntriesByAnimal = new Map(overflowSchedule.map((entry) => [entry.animal, entry]));
const overflowValidation = validateDayTwoOverflowSchedule(overflowSchedule);
let overflowMarkerLayer = null;

// —— 第 3 天越界 ——
// 多吉家 2 头：SC-2026-00376（常规越界）+ SC-2026-00380（进入禁牧区）。
const dayThreeOverflowSchedule = createDayThreeOverflowSchedule({ livestock, ranges: HERDER_ACTIVITY_RANGES });
const dayThreeEntriesByAnimal = new Map(dayThreeOverflowSchedule.map((entry) => [entry.animal, entry]));
const dayThreeValidation = validateDayThreeOverflowSchedule(dayThreeOverflowSchedule);
const prohibitedEntry = dayThreeOverflowSchedule.find((entry) => entry.overflowType === 'prohibited') ?? null;
// 预计算光点实际进入禁牧区的时刻：沿越界路径逐步采样，找到第一个落在禁牧多边形内的时刻。
// 消息卡片和弹窗都用这个时刻触发，而不是越界时段起点。
const prohibitedActualEntryHour = (() => {
  if (!prohibitedEntry) return null;
  const step = 0.05;
  for (let hour = prohibitedEntry.startHour; hour <= prohibitedEntry.endHour + 1e-9; hour += step) {
    const position = overflowGeoPositionAtHour(prohibitedEntry, hour);
    if (position && isProhibitedPoint(position)) return hour;
  }
  return prohibitedEntry.startHour;
})();
let prohibitedModalShownForEntry = null;
let modalPausedSimulation = false;

// 提醒消息的时间线：第 1 天掉线（0-24 时）+ 第 2 天越界（24-48 时）+ 第 3 天越界（48-72 时）
// 合并成一条按绝对时刻排序的列表。每条消息都带模拟时间，渲染时按当前进度过滤，
// 所以拖动进度条能正反重放。
function buildMessageTimeline(offlineEntries, overflowEntries, dayThreeEntries = [], prohibitedEntryHour = null) {
  const events = [];

  const groupedOffline = new Map();
  offlineEntries.forEach((entry) => {
    const offlineAt = groupedOffline.get(entry.startHour) ?? { offline: 0, recover: 0 };
    offlineAt.offline += 1;
    groupedOffline.set(entry.startHour, offlineAt);

    const recoverAt = groupedOffline.get(entry.endHour) ?? { offline: 0, recover: 0 };
    recoverAt.recover += 1;
    groupedOffline.set(entry.endHour, recoverAt);
  });
  groupedOffline.forEach((counts, hour) => {
    if (counts.offline) events.push({ hour, kind: 'offline', text: `${counts.offline} 头牲畜设备掉线` });
    if (counts.recover) events.push({ hour, kind: 'recover', text: `${counts.recover} 头牲畜已恢复在线` });
  });

  overflowEntries.forEach((entry) => {
    const actualExit = overflowActualExitHour(entry);
    events.push({
      hour: actualExit,
      kind: 'overflow',
      text: `${entry.ownerName} ${entry.animalId} 越界，已自动提醒牧民`
    });
    events.push({
      hour: overflowReentryHour(entry),
      kind: 'recover',
      text: `${entry.ownerName} ${entry.animalId} 已回到活动范围`
    });
  });

  dayThreeEntries.forEach((entry) => {
    const isProhibited = entry.overflowType === 'prohibited';
    const entryHour = isProhibited && prohibitedEntryHour != null ? prohibitedEntryHour : overflowActualExitHour(entry);
    events.push({
      hour: entryHour,
      kind: isProhibited ? 'prohibited' : 'overflow',
      text: isProhibited
        ? `${entry.ownerName} ${entry.animalId} 进入禁牧区，已触发告警`
        : `${entry.ownerName} ${entry.animalId} 越界，已自动提醒牧民`
    });
    events.push({
      hour: overflowReentryHour(entry),
      kind: 'recover',
      text: `${entry.ownerName} ${entry.animalId} 已回到活动范围`
    });
  });

  return events.sort((left, right) => left.hour - right.hour);
}

const messageTimeline = buildMessageTimeline(offlineSchedule, overflowSchedule, dayThreeOverflowSchedule, prohibitedActualEntryHour);
window.__messageTimeline = messageTimeline;
let renderedMessageKey = '';

function syncMessageTimeline(hour) {
  // 三个白天共用一条 0-72 的绝对时间轴，这里不用再折回 24 小时制。
  const visible = messageTimeline.filter((event) => event.hour <= hour + 1e-6);
  const key = visible.map((event) => `${event.hour}:${event.kind}`).join('|');
  if (key === renderedMessageKey) return;
  renderedMessageKey = key;
  messageFeed.setItems(visible.map((event) => ({
    kind: event.kind,
    text: event.text,
    time: formatSimulationStamp(event.hour)
  })));
}

// 模拟时钟 → 真实时间戳（第 1 天以 2026-09-17 为基准日）。
function simulationTimestamp(hour) {
  const totalMinutes = Math.round(normalizeHour(hour) * 60) % 1440;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return new Date(
    `2026-09-17T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00+08:00`
  ).toISOString();
}

function densifyRing(coordinates, subdivisions = 4) {
  return coordinates.flatMap(([longitude, latitude], index) => {
    const [nextLongitude, nextLatitude] = coordinates[(index + 1) % coordinates.length];
    return Array.from({ length: subdivisions }, (_, step) => {
      const ratio = step / subdivisions;
      return [
        THREE.MathUtils.lerp(longitude, nextLongitude, ratio),
        THREE.MathUtils.lerp(latitude, nextLatitude, ratio)
      ];
    });
  });
}

async function createAreaMesh(area) {
  const coordinates = area.polygon;
  const center = coordinates.reduce((sum, [longitude, latitude]) => [sum[0] + longitude, sum[1] + latitude], [0, 0]);
  center[0] /= coordinates.length;
  center[1] /= coordinates.length;
  const sampled = await mapWithConcurrency([center, ...coordinates], 8, ([longitude, latitude]) => sampleGround(longitude, latitude));
  if (sampled.some((point) => !point)) throw new Error(`${area.name}地形采样失败`);
  const offset = TERRAIN_OVERLAY_OFFSET;
  const centerPoint = sampled[0].clone().add(new THREE.Vector3(0, offset, 0));
  const boundaryPoints = sampled.slice(1).map((point) => point.clone().add(new THREE.Vector3(0, offset, 0)));
  const positions = [centerPoint.x, centerPoint.y, centerPoint.z, ...boundaryPoints.flatMap((point) => [point.x, point.y, point.z])];
  const indices = [];
  for (let index = 0; index < boundaryPoints.length; index += 1) {
    const next = (index + 1) % boundaryPoints.length;
    indices.push(0, index + 1, next + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  const material = new THREE.MeshBasicMaterial({
    color: area.color,
    transparent: true,
    opacity: 0.035,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 2;

  const denseCoordinates = densifyRing(coordinates);
  const denseSampled = await mapWithConcurrency(denseCoordinates, 8, ([longitude, latitude]) => sampleGround(longitude, latitude));
  if (denseSampled.some((point) => !point)) throw new Error(`${area.name}边界地形采样失败`);
  const displayInset = 0.75;
  const denseBoundary = denseSampled.map((point) => {
    const displayed = point.clone().add(new THREE.Vector3(0, TERRAIN_LINE_OFFSET, 0));
    const towardCenter = new THREE.Vector3(centerPoint.x - displayed.x, 0, centerPoint.z - displayed.z);
    if (towardCenter.lengthSq() > 0) displayed.add(towardCenter.setLength(displayInset));
    return displayed;
  });
  const lineGeometry = new LineGeometry();
  lineGeometry.setPositions([...denseBoundary, denseBoundary[0]].flatMap((point) => [point.x, point.y, point.z]));
  const lineMaterial = new LineMaterial({
    color: area.color,
    linewidth: 3,
    transparent: true,
    opacity: 0.94,
    depthTest: false,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  lineMaterial.resolution.set(innerWidth, innerHeight);
  areaLineMaterials.push(lineMaterial);
  const outline = new Line2(lineGeometry, lineMaterial);
  outline.computeLineDistances();
  outline.renderOrder = 3;
  outline.userData = { areaId: area.id };
  mesh.userData = { kind: 'area', area, outline };
  areaMeshes.push(mesh);
  scene.add(mesh);
  scene.add(outline);
}

async function addAreaMeshes() {
  for (const area of AREAS) await createAreaMesh(area);
}

function approximatePolygonAreaSqMeters(polygon) {
  const latitude = polygon.reduce((sum, [, value]) => sum + value, 0) / polygon.length;
  const metersPerLongitude = 111320 * Math.cos(THREE.MathUtils.degToRad(latitude));
  const metersPerLatitude = 110540;
  let area = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const next = (index + 1) % polygon.length;
    const x1 = polygon[index][0] * metersPerLongitude;
    const y1 = polygon[index][1] * metersPerLatitude;
    const x2 = polygon[next][0] * metersPerLongitude;
    const y2 = polygon[next][1] * metersPerLatitude;
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

function createSettlementModel(site, groundPoint) {
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xb27a50, roughness: 0.9, metalness: 0.05 });
  const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x4c5b68, roughness: 0.82, metalness: 0.05 });
  const trimMaterial = new THREE.MeshStandardMaterial({ color: 0xd6b27d, roughness: 0.85 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(260, 150, 220), bodyMaterial);
  body.position.y = 75;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(185, 145, 4), roofMaterial);
  roof.position.y = 222;
  roof.rotation.y = Math.PI / 4;
  const door = new THREE.Mesh(new THREE.BoxGeometry(42, 78, 4), trimMaterial);
  door.position.set(0, 39, 112);
  const chimney = new THREE.Mesh(new THREE.CylinderGeometry(13, 13, 65, 8), trimMaterial);
  chimney.position.set(70, 260, -25);

  group.add(body, roof, door, chimney);
  group.position.copy(groundPoint).add(new THREE.Vector3(0, SETTLEMENT_GROUND_OFFSET, 0));
  group.renderOrder = 6;
  group.userData = { kind: 'settlement', site };
  group.traverse((child) => {
    if (child.isMesh) child.userData = group.userData;
  });
  siteObjects.push(group);
  scene.add(group);
}

async function createRestZone(site) {
  const coordinates = site.restZone.polygon;
  const center = coordinates.reduce((sum, [longitude, latitude]) => [sum[0] + longitude, sum[1] + latitude], [0, 0]);
  center[0] /= coordinates.length;
  center[1] /= coordinates.length;
  const sampled = await mapWithConcurrency([center, ...coordinates], 8, ([longitude, latitude]) => sampleGround(longitude, latitude));
  if (sampled.some((point) => !point)) throw new Error(`${site.ownerName}夜间休息区地形采样失败`);

  const offset = TERRAIN_OVERLAY_OFFSET;
  const centerPoint = sampled[0].clone().add(new THREE.Vector3(0, offset, 0));
  const boundaryPoints = sampled.slice(1).map((point) => point.clone().add(new THREE.Vector3(0, offset, 0)));
  const positions = [centerPoint.x, centerPoint.y, centerPoint.z, ...boundaryPoints.flatMap((point) => [point.x, point.y, point.z])];
  const indices = [];
  for (let index = 0; index < boundaryPoints.length; index += 1) {
    const next = (index + 1) % boundaryPoints.length;
    indices.push(0, index + 1, next + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  const material = new THREE.MeshBasicMaterial({
    color: 0x76b7d5,
    transparent: true,
    opacity: 0.16,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 4;
  mesh.userData = { kind: 'rest-zone', site, restZone: site.restZone };

  const denseCoordinates = densifyRing(coordinates, 3);
  const denseSampled = await mapWithConcurrency(denseCoordinates, 8, ([longitude, latitude]) => sampleGround(longitude, latitude));
  if (denseSampled.some((point) => !point)) throw new Error(`${site.ownerName}夜间休息区边界采样失败`);
  const denseBoundary = denseSampled.map((point) => point.clone().add(new THREE.Vector3(0, TERRAIN_LINE_OFFSET, 0)));
  const lineGeometry = new LineGeometry();
  lineGeometry.setPositions([...denseBoundary, denseBoundary[0]].flatMap((point) => [point.x, point.y, point.z]));
  const lineMaterial = new LineMaterial({
    color: 0x8ec8e4,
    linewidth: 2.4,
    transparent: true,
    opacity: 0.9,
    depthTest: false,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  lineMaterial.resolution.set(innerWidth, innerHeight);
  const outline = new Line2(lineGeometry, lineMaterial);
  outline.computeLineDistances();
  outline.renderOrder = 5;
  outline.userData = mesh.userData;
  restZoneLineMaterials.push(lineMaterial);
  site.restZone.areaSqM = approximatePolygonAreaSqMeters(coordinates);
  site.runtime = {
    restCenter: centerPoint.clone(),
    restPoints: boundaryPoints.map((point) => point.clone()),
    grazingPoints: []
  };
  mesh.userData.outline = outline;
  restZoneMeshes.push(mesh);
  scene.add(mesh, outline);
}

async function addSettlementSites() {
  await mapWithConcurrency(HERDER_SITES, 4, async (site) => {
    const groundPoint = await sampleGround(site.settlement.longitude, site.settlement.latitude);
    if (!groundPoint) throw new Error(`${site.ownerName}定居点地形采样失败`);
    createSettlementModel(site, groundPoint);
    await createRestZone(site);
  });
}

// —— 第 1 天早出晚归轨迹 ——
// 轨迹（夜间休息锚点 + 放牧航点）全部由 livestock-day1-motion.js 在经纬度空间生成，
// 并逐段校验落在该牧户 HERDER_ACTIVITY_RANGES 的活动范围内（见 validateDayOneMotion）。
const FIRST_LEG_SUBDIVISIONS = 6;
const GRAZING_LEG_SUBDIVISIONS = 2;
let motionPlans = [];

// 在相邻航点之间加密采样，让长达 1-3 公里的出牧/归牧位移也贴着地形起伏走。
function subdivideGeoPath(points, subdivisions) {
  const dense = [];
  for (let index = 0; index + 1 < points.length; index += 1) {
    const [startLongitude, startLatitude] = points[index];
    const [endLongitude, endLatitude] = points[index + 1];
    for (let step = 0; step < subdivisions; step += 1) {
      const ratio = step / subdivisions;
      dense.push([
        THREE.MathUtils.lerp(startLongitude, endLongitude, ratio),
        THREE.MathUtils.lerp(startLatitude, endLatitude, ratio)
      ]);
    }
  }
  dense.push([...points[points.length - 1]]);
  return dense;
}

function buildDayOneGeoPath({ restAnchor, waypoints }) {
  const outbound = subdivideGeoPath([restAnchor, waypoints[0]], FIRST_LEG_SUBDIVISIONS);
  const grazing = subdivideGeoPath(waypoints, GRAZING_LEG_SUBDIVISIONS);
  const coordinates = [...outbound.slice(0, -1), ...grazing];
  return {
    coordinates,
    // 第一个放牧航点在整条路径上的位置：出牧段结束、放牧段开始的分界点。
    grazingStartProgress: (outbound.length - 1) / (coordinates.length - 1)
  };
}

async function prepareMotionTargets() {
  motionPlans = planDayOneMotions({ livestock, sites: HERDER_SITES, ranges: HERDER_ACTIVITY_RANGES });

  const requests = [];
  motionPlans.forEach((plan, planIndex) => {
    if (!plan.moving) {
      // 掉线个体保留最后已知位置，不参与运动。
      delete plan.animal.motion;
      return;
    }
    const { coordinates, grazingStartProgress } = buildDayOneGeoPath(plan);
    plan.grazingStartProgress = grazingStartProgress;
    plan.worldPath = new Array(coordinates.length);
    coordinates.forEach((coordinate, pointIndex) => requests.push({ planIndex, pointIndex, coordinate }));
  });

  const samples = await mapWithConcurrency(requests, 8, ({ coordinate }) => sampleGround(coordinate[0], coordinate[1]));
  requests.forEach((request, requestIndex) => {
    const groundPoint = samples[requestIndex];
    motionPlans[request.planIndex].worldPath[request.pointIndex] = groundPoint
      ? groundPoint.clone().add(new THREE.Vector3(0, LIVESTOCK_MOTION_GROUND_OFFSET, 0))
      : null;
  });

  motionPlans.forEach((plan) => {
    if (!plan.moving) return;
    const { animal, worldPath, grazingStartProgress } = plan;
    if (worldPath.some((point) => !point)) throw new Error(`${animal.id} 早出晚归轨迹地形采样失败`);
    animal.motion = {
      restPosition: worldPath[0].clone(),
      route: worldPath,
      grazingStartProgress
    };
  });

  // 第 2 天越界路径（越界起点 → 锚点 → 锚点附近绕圈 → 回到当天轨迹）同样要贴地采样，
  // 避免越界时光点悬空或被山体吃掉。路径上的点与经纬度路径一一对应。
  attachOverflowPaths(overflowSchedule, motionPlans);
  const overflowRequests = [];
  overflowSchedule.forEach((entry) => {
    entry.overflowWorldPath = new Array(entry.overflowGeoPath.length);
    entry.overflowGeoPath.forEach((coordinate, pointIndex) => {
      overflowRequests.push({ entry, pointIndex, coordinate });
    });
  });
  const overflowSamples = await mapWithConcurrency(
    overflowRequests,
    8,
    ({ coordinate }) => sampleGround(coordinate[0], coordinate[1])
  );
  overflowRequests.forEach((request, requestIndex) => {
    const groundPoint = overflowSamples[requestIndex];
    if (!groundPoint) throw new Error(`${request.entry.animalId} 第 2 天越界路径地形采样失败`);
    request.entry.overflowWorldPath[request.pointIndex] = groundPoint
      .clone()
      .add(new THREE.Vector3(0, LIVESTOCK_MOTION_GROUND_OFFSET, 0));
  });

  // 第 3 天越界路径的地理坐标已在 createDayThreeOverflowSchedule 里生成（含禁牧区专用路径），
  // 这里只做贴地采样，把经纬度路径转成世界坐标。
  const dayThreeRequests = [];
  dayThreeOverflowSchedule.forEach((entry) => {
    entry.overflowWorldPath = new Array(entry.overflowGeoPath.length);
    entry.overflowGeoPath.forEach((coordinate, pointIndex) => {
      dayThreeRequests.push({ entry, pointIndex, coordinate });
    });
  });
  const dayThreeSamples = await mapWithConcurrency(
    dayThreeRequests,
    8,
    ({ coordinate }) => sampleGround(coordinate[0], coordinate[1])
  );
  dayThreeRequests.forEach((request, requestIndex) => {
    const groundPoint = dayThreeSamples[requestIndex];
    if (!groundPoint) throw new Error(`${request.entry.animalId} 第 3 天越界路径地形采样失败`);
    request.entry.overflowWorldPath[request.pointIndex] = groundPoint
      .clone()
      .add(new THREE.Vector3(0, LIVESTOCK_MOTION_GROUND_OFFSET, 0));
  });

  applySimulationHour(simulationHour, { announce: false, initial: true });
  validateDayOneMotion(motionPlans);
  validateDayTwoOverflowMotion(overflowSchedule);
  validateDayThreeOverflowMotion(dayThreeOverflowSchedule);
}

function routePositionAt(route, progress) {
  if (route.length === 1) return route[0].clone();
  const scaled = THREE.MathUtils.clamp(progress, 0, 1) * (route.length - 1);
  const index = Math.min(Math.floor(scaled), route.length - 2);
  return route[index].clone().lerp(route[index + 1], smoothStep(scaled - index));
}

// 按模拟时钟推进第 1 天掉线状态：进入掉线时段 → 变灰、原地不动；时段结束 → 恢复原健康状态并平滑归位。
// 另外把状态推进到「允许任意跳转」：拖回早先时刻，掉线状态会重新按时间轴判定。
function applyOfflineState(hour) {
  if (!offlineSchedule.length) return;
  // 掉线只发生在第 1 天：判定用绝对时刻，第 2 天（24-48 时）一律不重复掉线。
  const offlineDay = dayIndexAtHour(hour) === DAY_ONE;
  let stateChanged = false;

  offlineSchedule.forEach((entry) => {
    const { animal } = entry;
    const offlineNow = offlineDay && isOfflineAtHour(entry, hour);

    if (offlineNow && !entry.isOffline) {
      entry.isOffline = true;
      stateChanged = true;
      entry.rejoinComplete = false;
      entry.frozenPosition = animal.sprite ? animal.sprite.position.clone() : null;
      animal.lastOnlineTime = simulationTimestamp(entry.startHour);
      animal.offlineDuration = 0;
      livestockSpriteSystem.setStatus(animal, 'offline');
    } else if (!offlineNow && entry.isOffline) {
      entry.isOffline = false;
      stateChanged = true;
      animal.offlineDuration = Math.round(entry.durationHours * 3600);
      livestockSpriteSystem.setStatus(animal, animal.telemetry.lastHealthStatus);
    }

    if (entry.isOffline) {
      animal.offlineDuration = Math.round(hoursSinceOfflineStart(entry, hour) * 3600);
    }
  });

  // 统计/图例/顶部预警栏跟着「实际状态变化」刷新，而不是跟着「是否推送过提醒」，
  // 否则把时间轴拖回去再走一遍时，掉线头数会停留在上一次的旧值。
  if (stateChanged) updateFilters();
}

function applySimulationHour(hour) {
  applyOfflineState(hour);
  updateLivestockMotion(hour);
  syncMessageTimeline(hour);
  checkProhibitedModal(hour);
}

// 06:00-07:00 出牧 · 07:00-17:00 放牧 · 17:00-18:00 归牧 · 18:00-06:00 休息区休息
function updateLivestockMotion(hour) {
  const normalizedHour = normalizeHour(hour);
  const { outbound, grazing, returning, resting } = DAY_ONE_PHASE_HOURS;
  livestock.forEach((animal) => {
    if (!animal.sprite || !animal.motion) return;
    const offlineEntry = offlineEntriesByAnimal.get(animal);
    // 掉线期间：保留最后已知位置，原地不动。
    if (offlineEntry?.isOffline) {
      if (offlineEntry.frozenPosition) animal.sprite.position.copy(offlineEntry.frozenPosition);
      return;
    }
    const { restPosition, route, grazingStartProgress } = animal.motion;
    let nextPosition;
    if (normalizedHour >= outbound && normalizedHour < grazing) {
      nextPosition = restPosition.clone().lerp(
        routePositionAt(route, grazingStartProgress),
        smoothStep(normalizedHour - outbound)
      );
    } else if (normalizedHour >= grazing && normalizedHour < returning) {
      const progress = THREE.MathUtils.lerp(
        grazingStartProgress,
        1,
        (normalizedHour - grazing) / (returning - grazing)
      );
      nextPosition = routePositionAt(route, progress);
    } else if (normalizedHour >= returning && normalizedHour < resting) {
      nextPosition = routePositionAt(route, 1).lerp(restPosition, smoothStep(normalizedHour - returning));
    } else {
      nextPosition = restPosition.clone();
    }
    // 第 2 天越界：整段越界是一条第 1 天轨迹 → 越界锚点 → 绕圈 → 回到轨迹的匀速路径，
    // 位置直接取自这条路径，不再和当天轨迹做插值（插值会让两个速度叠加成「抽搐」）。
    const overflowEntry = overflowEntriesByAnimal.get(animal);
    if (overflowEntry) {
      const overflowPosition = overflowWorldPositionAtHour(overflowEntry, hour, new THREE.Vector3());
      if (overflowPosition) nextPosition = overflowPosition;
    }
    // 第 3 天越界：与第 2 天同逻辑，只是路径可能进入禁牧区。
    const dayThreeEntry = dayThreeEntriesByAnimal.get(animal);
    if (dayThreeEntry) {
      const dayThreePosition = overflowWorldPositionAtHour(dayThreeEntry, hour, new THREE.Vector3());
      if (dayThreePosition) nextPosition = dayThreePosition;
    }
    // 恢复在线后的 0.25 小时内，从冻结位置平滑回到当天轨迹，避免瞬移。
    if (offlineEntry?.frozenPosition && !offlineEntry.rejoinComplete) {
      const sinceRecovery = hoursSinceRecovery(offlineEntry, normalizedHour);
      if (sinceRecovery < REJOIN_HOURS) {
        nextPosition = offlineEntry.frozenPosition.clone().lerp(nextPosition, smoothStep(sinceRecovery / REJOIN_HOURS));
      } else {
        offlineEntry.rejoinComplete = true;
      }
    }
    animal.sprite.position.copy(nextPosition);
  });
}

function formatSimulationHour(hour) {
  const minutes = Math.round((hour % 24) * 60) % 1440;
  const hours = Math.floor(minutes / 60);
  const minutePart = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutePart).padStart(2, '0')}`;
}

function updateSimulationUi() {
  if (simulationTime) simulationTime.value = String(simulationHour);
  const hour = normalizeHour(simulationHour);
  if (simulationDayLabel) simulationDayLabel.textContent = `第 ${dayIndexAtHour(simulationHour)} 天`;
  if (simulationTimeLabel) {
    simulationTimeLabel.textContent = `${formatSimulationHour(hour)} · ${phaseLabelAtHour(hour)}`;
  }
  if (simulationToggle) simulationToggle.textContent = simulationRunning ? '暂停' : '继续';
}

function setSimulationHour(value) {
  simulationHour = ((Number(value) % SIMULATION_TOTAL_HOURS) + SIMULATION_TOTAL_HOURS) % SIMULATION_TOTAL_HOURS;
  applySimulationHour(simulationHour);
  updateSimulationUi();
}

async function addLivestock() {
  await livestockSpriteSystem.createSprites();
  updateFilters();
}

function updateFilters() {
  const selectedStatus = statusFilter.value;
  const selectedOwner = ownerFilter.value;
  let visible = 0;
  const statusCounts = { normal: 0, attention: 0, abnormal: 0, offline: 0 };
  livestock.forEach((animal) => {
    statusCounts[animal.status] = (statusCounts[animal.status] ?? 0) + 1;
    const matches = (selectedStatus === 'all' || animal.status === selectedStatus)
      && (selectedOwner === 'all' || animal.ownerId === selectedOwner);
    if (animal.sprite) animal.sprite.visible = matches;
    if (animal.sprite && matches) visible += 1;
  });
  visibleCount.textContent = `${visible} / ${livestock.length}`;
  if (normalCount) normalCount.textContent = String(statusCounts.normal ?? 0);
  if (attentionCount) attentionCount.textContent = String(statusCounts.attention ?? 0);
  if (abnormalCount) abnormalCount.textContent = String(statusCounts.abnormal ?? 0);
  if (offlineCount) offlineCount.textContent = String(statusCounts.offline ?? 0);
  if (offlineAlert) offlineAlert.textContent = `${statusCounts.offline ?? 0} 头牲畜设备掉线`;
  if (selectedObject?.userData.kind === 'animal' && !selectedObject.visible) closeDetails();
}

function formatPressure(pressure) {
  return Number.isFinite(pressure) ? `${pressure.toFixed(2)}（${Math.round(pressure * 100)}%）` : '∞';
}

function rows(items) {
  return items.map(([label, value, className = '', hint = '']) => `<div><dt>${label}</dt><dd class="${className}"><span>${value}</span>${hint ? `<small>${hint}</small>` : ''}</dd></div>`).join('');
}

function detailSection(title, items, { collapsible = false, open = true } = {}) {
  if (!collapsible) return `<h3 class="detail-section-title">${title}</h3>${rows(items)}`;
  return `<details class="detail-group"${open ? ' open' : ''}><summary>${title}<span class="detail-group-chevron" aria-hidden="true">⌄</span></summary><div class="detail-group-content">${rows(items)}</div></details>`;
}

function metricRow(label, metric, digits = 0) {
  const [minimum, maximum] = metric.normalRange;
  const outsideRange = metric.value < minimum || metric.value > maximum;
  return [
    label,
    `${Number(metric.value).toFixed(digits)} ${metric.unit}`,
    outsideRange ? 'abnormal' : 'normal',
    `正常 ${minimum}-${maximum} ${metric.unit}`
  ];
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).format(new Date(value));
}

function formatOfflineDuration(seconds) {
  const totalMinutes = Math.max(0, Math.round(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours} 小时 ${minutes} 分钟` : `${minutes} 分钟`;
}

function openDetails(object) {
  if (object.userData.kind === 'animal' && hoveredArea) setHoveredArea(null);
  if (selectedObject?.userData.kind === 'animal') livestockSpriteSystem.setSelected(selectedObject, false);
  selectedObject = object;
  modelPreview.hidden = object.userData.kind !== 'animal';
  detailPanel.dataset.kind = object.userData.kind;
  if (object.userData.kind === 'animal') {
    const animal = object.userData.animal;
    const area = AREAS.find((candidate) => candidate.id === animal.areaId);
    const metrics = animal.telemetry.metrics;
    livestockSpriteSystem.setSelected(object, true);
    detailKicker.textContent = '牲畜实时档案';
    detailTitle.textContent = animal.profile.livestockId;
    const statusSections = animal.status === 'offline'
      ? [
        detailSection('设备状态', [
          ['状态', STATUS.offline.label, 'offline'],
          ['最后在线时间', formatDateTime(animal.lastOnlineTime)],
          ['掉线时长', formatOfflineDuration(animal.offlineDuration), 'offline']
        ]),
        detailSection('最后一次健康数据', [
          metricRow('体温', metrics.bodyTemperature, 1),
          metricRow('心率', metrics.heartRate),
          metricRow('反刍次数', metrics.rumination)
        ], { collapsible: true, open: false })
      ]
      : [detailSection('健康监测', [
        ['健康状态', STATUS[animal.telemetry.healthStatus].label, animal.telemetry.healthStatus],
        metricRow('体温', metrics.bodyTemperature, 1),
        metricRow('心率', metrics.heartRate),
        metricRow('反刍次数', metrics.rumination)
      ], { collapsible: true, open: false })];
    detailContent.innerHTML = [
      detailSection('基础信息', [
        ['编号', animal.profile.livestockId],
        ['类型', animal.profile.type],
        ['品种', animal.profile.breed],
        ['所属牧户', animal.ownerName],
        ['所在草场区域', area?.name ?? animal.areaId]
      ]),
      ...statusSections,
      detailSection('位置信息', [
        ['经纬度坐标', `${animal.telemetry.location.longitude.toFixed(5)}° E<br>${animal.telemetry.location.latitude.toFixed(5)}° N`],
        ['数据更新时间', formatDateTime(animal.telemetry.recordedAt)]
      ])
    ].join('');
  } else if (object.userData.kind === 'area') {
    const area = object.userData.area;
    const metrics = getAreaMetrics(area, livestock);
    detailKicker.textContent = '草场承载力';
    detailTitle.textContent = area.name;
    detailContent.innerHTML = rows([
      ['质量等级', area.quality], ['当前载畜量', `${metrics.currentLoad} 头`], ['理论载畜量', `${area.capacity} 头`],
      ['压力指数', formatPressure(metrics.pressure), metrics.overloaded ? 'abnormal' : 'normal'],
      ['预警状态', metrics.overloaded ? '超载预警' : '承载正常', metrics.overloaded ? 'abnormal' : 'normal']
    ]);
  } else {
    detailKicker.textContent = '地理标记';
    detailTitle.textContent = object.userData.name;
    detailContent.innerHTML = rows([['经度', `${object.userData.longitude.toFixed(3)}° E`], ['纬度', `${object.userData.latitude.toFixed(3)}° N`]]);
  }
  detailPanel.hidden = false;
}

function closeDetails() {
  if (selectedObject?.userData.kind === 'animal') livestockSpriteSystem.setSelected(selectedObject, false);
  selectedObject = null;
  modelPreview.hidden = true;
  delete detailPanel.dataset.kind;
  detailPanel.hidden = true;
  // 详情面板是从禁牧区弹窗的「查看详情」打开的 → 关闭后恢复时间轴。
  if (modalPausedSimulation) {
    simulationRunning = true;
    updateSimulationUi();
    modalPausedSimulation = false;
  }
}

function showSceneTooltip(text, event) {
  if (!sceneTooltip) return;
  sceneTooltip.textContent = text;
  sceneTooltip.style.left = `${event.clientX + 14}px`;
  sceneTooltip.style.top = `${event.clientY + 14}px`;
  sceneTooltip.hidden = false;
}

function hideSceneTooltip() {
  if (sceneTooltip) sceneTooltip.hidden = true;
}

function setHoveredFeature(feature, event) {
  hoveredFeature = feature;
  if (!feature) {
    hideSceneTooltip();
    renderer.domElement.style.cursor = 'grab';
    return;
  }
  if (hoveredArea) setHoveredArea(null);
  const { kind, site } = feature.userData;
  showSceneTooltip(kind === 'settlement' ? `${site.ownerName}定居点` : `${site.ownerName}夜间休息区`, event);
  renderer.domElement.style.cursor = 'pointer';
}

function setHoveredArea(areaMesh) {
  if (selectedObject?.userData.kind === 'animal' && areaMesh) return;
  if (hoveredArea === areaMesh) return;
  hoveredArea = areaMesh;
  areaMeshes.forEach((mesh) => {
    const active = mesh === hoveredArea;
    mesh.userData.outline.material.linewidth = active ? 6 : 3;
    mesh.userData.outline.material.opacity = hoveredArea ? (active ? 1 : 0.2) : 0.94;
    mesh.material.opacity = active ? 0.065 : 0.035;
  });
  if (hoveredArea) {
    openDetails(hoveredArea);
    renderer.domElement.style.cursor = 'pointer';
  } else {
    renderer.domElement.style.cursor = 'grab';
    if (selectedObject?.userData.kind === 'area') closeDetails();
  }
}

function updateHover(event) {
  if (selectedObject?.userData.kind === 'animal') {
    if (hoveredArea) setHoveredArea(null);
    if (hoveredFeature) setHoveredFeature(null);
    return;
  }
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const featureHit = raycaster.intersectObjects([...siteObjects, ...restZoneMeshes], true)[0]?.object ?? null;
  if (featureHit) {
    const feature = featureHit.userData?.kind ? featureHit : featureHit.parent?.userData?.kind ? featureHit.parent : null;
    if (feature) {
      setHoveredFeature(feature, event);
      return;
    }
  }
  if (hoveredFeature) setHoveredFeature(null);
  const hit = raycaster.intersectObjects(areaMeshes, false)[0]?.object ?? null;
  setHoveredArea(hit);
}

function pick(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const animalDetailsOpen = selectedObject?.userData.kind === 'animal';
  const clickable = animalDetailsOpen
    ? animalSprites.filter((sprite) => sprite.visible)
    : [...animalSprites.filter((sprite) => sprite.visible), ...areaMeshes];
  const intersections = raycaster.intersectObjects(clickable, false);
  if (intersections.length) openDetails(intersections[0].object);
  else if (!animalDetailsOpen) closeDetails();
}

renderer.domElement.addEventListener('pointerdown', (event) => pointerDown.set(event.clientX, event.clientY));
renderer.domElement.addEventListener('pointermove', updateHover);
renderer.domElement.addEventListener('pointerleave', () => {
  setHoveredArea(null);
  setHoveredFeature(null);
});
renderer.domElement.addEventListener('pointerup', (event) => {
  if (pointerDown.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) < 5) pick(event);
});
statusFilter.addEventListener('change', updateFilters);
ownerFilter.addEventListener('change', updateFilters);
document.querySelector('#close-detail').addEventListener('click', closeDetails);
simulationTime?.addEventListener('input', (event) => setSimulationHour(event.target.value));
simulationSpeed?.addEventListener('change', (event) => {
  simulationHoursPerSecond = Number(event.target.value);
});
simulationToggle?.addEventListener('click', () => {
  simulationRunning = !simulationRunning;
  updateSimulationUi();
});
['pointerdown', 'pointerup', 'pointermove', 'wheel'].forEach((eventName) => {
  detailPanel.addEventListener(eventName, (event) => event.stopPropagation());
});

function connectMapEvents(tileMap) {
  let loadedTiles = 0;
  tileMap.addEventListener('loading-progress', (event) => {
    loadingMessage.textContent = `正在加载地图瓦片 ${event.itemsLoaded}/${event.itemsTotal}`;
  });
  tileMap.addEventListener('tile-loaded', () => {
    loadedTiles += 1;
    if (loadedTiles >= 4) hideLoading();
  });
  tileMap.addEventListener('loading-error', () => {
    setServiceState('部分地图瓦片加载失败', 'error');
    loadingMessage.textContent = '瓦片请求失败，请检查 Key、域名白名单或网络连接';
  });
}

// —— 禁牧区弹窗 ——
// 当光点实际进入禁牧区时弹出一次，自动暂停模拟；
// 点「知道了」直接关闭并恢复时间轴，点「查看详情」关闭弹窗但保持暂停，
// 等用户关闭详情面板后再恢复（除非用户之前手动暂停）。
function setupProhibitedModal() {
  if (!prohibitedModal) return;
  prohibitedModalDismiss?.addEventListener('click', hideProhibitedModal);
  prohibitedModalDetail?.addEventListener('click', () => {
    // 只隐藏弹窗，不恢复时间轴——等详情面板关闭后再恢复。
    if (prohibitedModal) prohibitedModal.hidden = true;
    if (prohibitedEntry?.animal) {
      const sprite = prohibitedEntry.animal.sprite;
      if (sprite) {
        openDetails(sprite);
        controls.target.copy(sprite.position);
        camera.lookAt(sprite.position);
      }
    }
  });
}

function showProhibitedModal(entry) {
  if (!prohibitedModal || prohibitedModalShownForEntry === entry) return;
  prohibitedModalShownForEntry = entry;
  if (prohibitedModalBody) {
    prohibitedModalBody.textContent = `${entry.ownerName} ${entry.animalId} 于${formatSimulationStamp(prohibitedActualEntryHour ?? entry.startHour)}进入东南禁牧区，已自动提醒牧民。`;
  }
  prohibitedModal.hidden = false;
  // 自动暂停模拟时钟，关闭弹窗时再恢复。
  modalPausedSimulation = simulationRunning;
  if (simulationRunning) {
    simulationRunning = false;
    updateSimulationUi();
  }
}

function hideProhibitedModal() {
  if (!prohibitedModal) return;
  prohibitedModal.hidden = true;
  if (modalPausedSimulation) {
    simulationRunning = true;
    updateSimulationUi();
  }
  modalPausedSimulation = false;
}

// 每帧实时检测：光点经纬度是否落在禁牧区多边形内。
// 不依赖预设时间点——只有光点真正进入 area-d 才触发弹窗，离开后拖回时间轴可重新触发。
function checkProhibitedModal(hour) {
  if (!prohibitedEntry) return;
  const position = overflowGeoPositionAtHour(prohibitedEntry, hour);
  const insideProhibited = Boolean(position && isProhibitedPoint(position));
  if (insideProhibited && prohibitedModalShownForEntry !== prohibitedEntry) {
    showProhibitedModal(prohibitedEntry);
  }
  // 把时间轴拖回光点进入禁牧区之前 → 重置弹窗状态，下次再进入可以重新弹出。
  if (!insideProhibited && prohibitedModalShownForEntry === prohibitedEntry && hour < (prohibitedActualEntryHour ?? prohibitedEntry.startHour)) {
    prohibitedModalShownForEntry = null;
    if (!prohibitedModal.hidden) hideProhibitedModal();
  }
}

async function bootstrap() {
  if (!token || token === 'your_token_here') {
    showFatal('缺少天地图 Key', '请在 .env.local 中配置 VITE_TIANDITU_TOKEN');
    return;
  }
  const sources = createMapSources(token);
  demLabel = sources.demLabel;
  map = TileMap.create({ imgSource: sources.imageSource, demSource: sources.demSource, bounds: MAP_BOUNDS, minLevel: 7 });
  map.rotateX(-Math.PI / 2);
  map.updateMatrixWorld(true);
  scene.add(map);
  connectMapEvents(map);
  positionCamera(map);
  try {
    loadingMessage.textContent = '正在检测真实地形高程...';
    const centerGround = await sampleGround(MAP_CENTER.longitude, MAP_CENTER.latitude);
    if (!centerGround) {
      terrainAvailable = false;
      map.demSource = undefined;
      loadingMessage.textContent = '高程服务暂无数据，已切换为卫星影像平面模式';
      setServiceState(`卫星影像在线 · ${demLabel} 暂无数据`, 'error');
    } else {
      const elevationOffset = centerGround.y - controls.target.y;
      controls.target.y += elevationOffset;
      camera.position.y += elevationOffset;
      controls.update();
    }
    loadingMessage.textContent = '正在采样地形并放置草场分区...';
    await addAreaMeshes();
    loadingMessage.textContent = '正在划定牧民定居点与夜间休息区...';
    await addSettlementSites();
    loadingMessage.textContent = '正在定位牲畜光点...';
    await addLivestock();
    loadingMessage.textContent = '正在初始化早出晚归运动轨迹...';
    await prepareMotionTargets();
    loadingMessage.textContent = '正在布置第 2 天越界提醒...';
    const combinedOverflowSchedule = [...overflowSchedule, ...dayThreeOverflowSchedule];
    overflowMarkerLayer = createOverflowMarkerLayer({
      parent: livestockSpriteSystem.spriteGroup,
      schedule: combinedOverflowSchedule
    });
    overflowMarkerLayer.update(simulationHour);
    setupProhibitedModal();
    setSimulationHour(10);
    if (animalSprites.length !== livestock.length) setServiceState(`${livestock.length - animalSprites.length} 个光点贴地失败`, 'error');
    hideLoading();
  } catch (error) {
    console.error(error);
    showFatal('地形数据加载失败', error.message);
  }
}

function resize() {
  layoutMessageFeed();
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  areaLineMaterials.forEach((material) => material.resolution.set(innerWidth, innerHeight));
  restZoneLineMaterials.forEach((material) => material.resolution.set(innerWidth, innerHeight));
}
addEventListener('resize', resize);

function animate(time) {
  requestAnimationFrame(animate);
  const deltaSeconds = lastAnimationTime ? Math.min((time - lastAnimationTime) / 1000, 0.1) : 0;
  lastAnimationTime = time;
  if (simulationRunning && livestock.some((animal) => animal.motion)) {
    simulationHour = (simulationHour + deltaSeconds * simulationHoursPerSecond) % SIMULATION_TOTAL_HOURS;
    applySimulationHour(simulationHour);
    updateSimulationUi();
  }
  controls.update();
  if (map) map.update(camera);
  overflowMarkerLayer?.update(simulationHour);
  livestockSpriteSystem.update(time, camera);
  renderer.render(scene, camera);
}

bootstrap();
animate(0);

// 消息卡片启动时为空：只显示运行时真实产生的消息。
// 目前接入的是第 1 天掉线 / 恢复提醒与第 2 天越界 / 归位提醒，
// 全部由时间轴推导，不预置演示消息。
messageFeed.clear();
layoutMessageFeed();

window.__dayTwoOverflow = {
  schedule: overflowSchedule,
  validation: overflowValidation,
  markerLayer: () => overflowMarkerLayer,
  get simulationHour() {
    return simulationHour;
  },
  setSimulationHour
};

window.__dayThreeOverflow = {
  schedule: dayThreeOverflowSchedule,
  validation: dayThreeValidation,
  markerLayer: () => overflowMarkerLayer,
  get simulationHour() {
    return simulationHour;
  },
  setSimulationHour
};

// 调试/自动化用的场景句柄（只读引用，不参与渲染逻辑）。
window.__sceneView = { scene, camera, controls, renderer };

export { livestock, getAreaMetrics };
