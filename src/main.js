import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { TileMap } from 'three-tile';
import { AREAS, HERDER_SITES, MAP_BOUNDS, MAP_CENTER, STATUS } from './config.js';
import { createLivestock, getAreaMetrics, pointInPolygon } from './livestock.js';
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
const sceneTooltip = document.querySelector('#scene-tooltip');
const simulationTime = document.querySelector('#simulation-time');
const simulationTimeLabel = document.querySelector('#simulation-time-label');
const simulationSpeed = document.querySelector('#simulation-speed');
const simulationToggle = document.querySelector('#simulation-toggle');

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

const livestock = createLivestock();
const ANIMAL_SCALE = 210;
const ABNORMAL_ANIMAL_SCALE = 300;
const SELECTED_ANIMAL_SCALE = 285;
const SELECTED_ABNORMAL_SCALE = 405;
// Keep the existing sprite visual baseline and add a small 2 m clearance so
// the marker does not get swallowed by the sampled terrain surface.
const LIVESTOCK_GROUND_OFFSET = 92;
const TERRAIN_OVERLAY_OFFSET = 2;
const TERRAIN_LINE_OFFSET = 4;
const SETTLEMENT_GROUND_OFFSET = 2;
const animalSprites = [];
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
let simulationHour = 6;
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

function makeMarkerTexture(color) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  const cssColor = `#${color.toString(16).padStart(6, '0')}`;
  const gradient = context.createRadialGradient(64, 64, 5, 64, 64, 56);
  gradient.addColorStop(0.0, `${cssColor}ff`);
  gradient.addColorStop(0.5, `${cssColor}ff`);
  gradient.addColorStop(0.75, `${cssColor}80`);
  gradient.addColorStop(1.0, `${cssColor}00`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
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

const spriteMaterials = Object.fromEntries(Object.entries(STATUS).map(([key, value]) => [key, new THREE.SpriteMaterial({
  map: makeMarkerTexture(value.color),
  color: 0xffffff,
  transparent: true,
  opacity: 1,
  alphaTest: 0.035,
  depthTest: true,
  depthWrite: false,
  sizeAttenuation: true,
  toneMapped: false
})]));
function getAnimalScale(animal, selected = false) {
  if (animal.status === 'abnormal') return selected ? SELECTED_ABNORMAL_SCALE : ABNORMAL_ANIMAL_SCALE;
  return selected ? SELECTED_ANIMAL_SCALE : ANIMAL_SCALE;
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
    depthTest: true,
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
    depthTest: true,
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

function areaCenter(area) {
  const center = area.polygon.reduce((sum, [longitude, latitude]) => [sum[0] + longitude, sum[1] + latitude], [0, 0]);
  return [center[0] / area.polygon.length, center[1] / area.polygon.length];
}

function randomGeoPointInArea(area, random) {
  const longitudes = area.polygon.map(([longitude]) => longitude);
  const latitudes = area.polygon.map(([, latitude]) => latitude);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const point = [
      THREE.MathUtils.lerp(minLongitude, maxLongitude, random()),
      THREE.MathUtils.lerp(minLatitude, maxLatitude, random())
    ];
    if (pointInPolygon(point, area.polygon)) return point;
  }
  return areaCenter(area);
}

async function prepareMotionTargets() {
  await mapWithConcurrency(HERDER_SITES, 4, async (site, siteIndex) => {
    const area = AREAS.find((candidate) => candidate.id === site.grazingAreaId);
    if (!area || area.id === 'area-d') throw new Error(`${site.ownerName}没有合法的可放牧区域`);
    const random = createSeededRandom(8721 + siteIndex * 991);
    const coordinates = [areaCenter(area), ...Array.from({ length: 10 }, () => randomGeoPointInArea(area, random))];
    const sampled = await mapWithConcurrency(coordinates, 8, ([longitude, latitude]) => sampleGround(longitude, latitude));
    site.runtime.grazingPoints = sampled.filter(Boolean).map((point) => point.clone().add(new THREE.Vector3(0, LIVESTOCK_GROUND_OFFSET, 0)));
    if (!site.runtime.grazingPoints.length) throw new Error(`${site.ownerName}放牧区地形采样失败`);
  });

  const ownerIndexes = new Map();
  livestock.forEach((animal) => {
    const site = HERDER_SITES.find((candidate) => candidate.ownerId === animal.ownerId);
    if (!site?.runtime) return;
    const ownerIndex = ownerIndexes.get(animal.ownerId) ?? 0;
    ownerIndexes.set(animal.ownerId, ownerIndex + 1);
    const restPoints = site.runtime.restPoints.length ? site.runtime.restPoints : [site.runtime.restCenter];
    const restBase = restPoints[ownerIndex % restPoints.length];
    const restPosition = site.runtime.restCenter.clone().lerp(restBase, 0.58).add(new THREE.Vector3(0, LIVESTOCK_GROUND_OFFSET, 0));
    const pasturePoints = site.runtime.grazingPoints;
    const path = Array.from({ length: 4 }, (_, index) => pasturePoints[(ownerIndex * 2 + index * 3) % pasturePoints.length].clone());
    animal.motion = { site, restPosition, path };
    if (animal.sprite) animal.sprite.position.copy(restPosition);
  });
}

function smoothStep(value) {
  const clamped = THREE.MathUtils.clamp(value, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

function pasturePositionAt(path, progress) {
  if (path.length === 1) return path[0].clone();
  const scaled = THREE.MathUtils.clamp(progress, 0, 1) * (path.length - 1);
  const index = Math.min(Math.floor(scaled), path.length - 2);
  const nextIndex = index + 1;
  return path[index].clone().lerp(path[nextIndex], smoothStep(scaled - index));
}

function updateLivestockMotion(hour) {
  const normalizedHour = ((hour % 24) + 24) % 24;
  livestock.forEach((animal) => {
    if (!animal.sprite || !animal.motion) return;
    const { restPosition, path } = animal.motion;
    let nextPosition;
    if (normalizedHour >= 6 && normalizedHour < 7) {
      nextPosition = restPosition.clone().lerp(pasturePositionAt(path, 0), smoothStep(normalizedHour - 6));
    } else if (normalizedHour >= 7 && normalizedHour < 17) {
      nextPosition = pasturePositionAt(path, (normalizedHour - 7) / 10);
    } else if (normalizedHour >= 17 && normalizedHour < 18) {
      nextPosition = pasturePositionAt(path, 1).lerp(restPosition, smoothStep(normalizedHour - 17));
    } else {
      nextPosition = restPosition.clone();
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
  if (simulationTimeLabel) {
    const hour = ((simulationHour % 24) + 24) % 24;
    const phase = hour >= 6 && hour < 7 ? '出牧' : hour >= 7 && hour < 17 ? '放牧' : hour >= 17 && hour < 18 ? '归牧' : '休息';
    simulationTimeLabel.textContent = `${formatSimulationHour(hour)} · ${phase}`;
  }
  if (simulationToggle) simulationToggle.textContent = simulationRunning ? '暂停' : '继续';
}

function setSimulationHour(value) {
  simulationHour = Number(value) % 24;
  updateLivestockMotion(simulationHour);
  updateSimulationUi();
}

async function addLivestock() {
  await mapWithConcurrency(livestock, 8, async (animal) => {
    const point = await sampleGround(animal.longitude, animal.latitude);
    if (!point) return;
    const sprite = new THREE.Sprite(spriteMaterials[animal.status]);
    sprite.position.copy(point).add(new THREE.Vector3(0, LIVESTOCK_GROUND_OFFSET, 0));
    sprite.scale.setScalar(getAnimalScale(animal));
    sprite.renderOrder = 5;
    sprite.userData = { kind: 'animal', animal };
    animal.sprite = sprite;
    animalSprites.push(sprite);
    scene.add(sprite);
  });
  updateFilters();
}

function updateFilters() {
  const selectedStatus = statusFilter.value;
  const selectedOwner = ownerFilter.value;
  let visible = 0;
  livestock.forEach((animal) => {
    const matches = (selectedStatus === 'all' || animal.status === selectedStatus)
      && (selectedOwner === 'all' || animal.ownerId === selectedOwner);
    if (animal.sprite) animal.sprite.visible = matches;
    if (animal.sprite && matches) visible += 1;
  });
  visibleCount.textContent = `${visible} / ${livestock.length}`;
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

function openDetails(object) {
  if (object.userData.kind === 'animal' && hoveredArea) setHoveredArea(null);
  if (selectedObject?.userData.kind === 'animal') selectedObject.scale.setScalar(getAnimalScale(selectedObject.userData.animal));
  selectedObject = object;
  modelPreview.hidden = object.userData.kind !== 'animal';
  detailPanel.dataset.kind = object.userData.kind;
  if (object.userData.kind === 'animal') {
    const animal = object.userData.animal;
    const area = AREAS.find((candidate) => candidate.id === animal.areaId);
    const metrics = animal.telemetry.metrics;
    object.scale.setScalar(getAnimalScale(animal, true));
    detailKicker.textContent = '牲畜实时档案';
    detailTitle.textContent = animal.profile.livestockId;
    detailContent.innerHTML = [
      detailSection('基础信息', [
        ['编号', animal.profile.livestockId],
        ['类型', animal.profile.type],
        ['品种', animal.profile.breed],
        ['所属牧户', animal.ownerName],
        ['所在草场区域', area?.name ?? animal.areaId]
      ]),
      detailSection('健康监测', [
        ['健康状态', STATUS[animal.telemetry.healthStatus].label, animal.telemetry.healthStatus],
        metricRow('体温', metrics.bodyTemperature, 1),
        metricRow('心率', metrics.heartRate),
        metricRow('反刍次数', metrics.rumination)
      ], { collapsible: true, open: false }),
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
  if (selectedObject?.userData.kind === 'animal') selectedObject.scale.setScalar(getAnimalScale(selectedObject.userData.animal));
  selectedObject = null;
  modelPreview.hidden = true;
  delete detailPanel.dataset.kind;
  detailPanel.hidden = true;
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
    setSimulationHour(6);
    if (animalSprites.length !== livestock.length) setServiceState(`${livestock.length - animalSprites.length} 个光点贴地失败`, 'error');
    hideLoading();
  } catch (error) {
    console.error(error);
    showFatal('地形数据加载失败', error.message);
  }
}

function resize() {
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
    simulationHour = (simulationHour + deltaSeconds * simulationHoursPerSecond) % 24;
    updateLivestockMotion(simulationHour);
    updateSimulationUi();
  }
  controls.update();
  if (map) map.update(camera);
  const breathing = (Math.sin((time / 1400) * Math.PI * 2 - Math.PI / 2) + 1) / 2;
  spriteMaterials.abnormal.opacity = THREE.MathUtils.lerp(0.4, 1, breathing);
  renderer.render(scene, camera);
}

bootstrap();
animate(0);

export { livestock, getAreaMetrics };
