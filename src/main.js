import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TileMap } from 'three-tile';
import { AREAS, MAP_BOUNDS, MAP_CENTER, STATUS } from './config.js';
import { createLivestock, getAreaMetrics } from './livestock.js';
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
const statusFilter = document.querySelector('#status-filter');
const ownerFilter = document.querySelector('#owner-filter');
const visibleCount = document.querySelector('#visible-count');

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
const animalSprites = [];
const areaMeshes = [];
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const pointerDown = new THREE.Vector2();
let selectedObject = null;
let map;
let terrainAvailable = true;
let demLabel = 'DEM';

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

function makeGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(64, 64, 4, 64, 64, 62);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.2, 'rgba(255,255,255,.95)');
  gradient.addColorStop(0.45, 'rgba(255,255,255,.45)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
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

const glowTexture = makeGlowTexture();
const spriteMaterials = Object.fromEntries(Object.entries(STATUS).map(([key, value]) => [key, new THREE.SpriteMaterial({
  map: glowTexture,
  color: value.color,
  transparent: true,
  depthWrite: false,
  sizeAttenuation: true
})]));

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

async function addCenterMarker() {
  const point = await sampleGround(MAP_CENTER.longitude, MAP_CENTER.latitude);
  if (!point) throw new Error('阿坝放牧区中心地面高程采样失败');
  const radius = 90;
  const marker = new THREE.Mesh(new THREE.SphereGeometry(radius, 20, 16), new THREE.MeshBasicMaterial({ color: 0xff3434 }));
  marker.position.copy(point).add(new THREE.Vector3(0, radius, 0));
  marker.userData = { kind: 'landmark', name: '阿坝放牧区中心', longitude: MAP_CENTER.longitude, latitude: MAP_CENTER.latitude };
  scene.add(marker);
}

function bilinearPoint(polygon, u, v) {
  const topLon = THREE.MathUtils.lerp(polygon[0][0], polygon[1][0], u);
  const topLat = THREE.MathUtils.lerp(polygon[0][1], polygon[1][1], u);
  const bottomLon = THREE.MathUtils.lerp(polygon[3][0], polygon[2][0], u);
  const bottomLat = THREE.MathUtils.lerp(polygon[3][1], polygon[2][1], u);
  return [THREE.MathUtils.lerp(topLon, bottomLon, v), THREE.MathUtils.lerp(topLat, bottomLat, v)];
}

async function createAreaMesh(area) {
  const segments = 4;
  const coordinates = [];
  const uvs = [];
  for (let row = 0; row <= segments; row += 1) {
    for (let column = 0; column <= segments; column += 1) {
      const u = column / segments;
      const v = row / segments;
      coordinates.push(bilinearPoint(area.polygon, u, v));
      uvs.push(u, 1 - v);
    }
  }
  const sampled = await mapWithConcurrency(coordinates, 8, ([longitude, latitude]) => sampleGround(longitude, latitude));
  if (sampled.some((point) => !point)) throw new Error(`${area.name}地形采样失败`);
  const positions = [];
  sampled.forEach((point) => positions.push(point.x, point.y + 8, point.z));
  const indices = [];
  for (let row = 0; row < segments; row += 1) {
    for (let column = 0; column < segments; column += 1) {
      const a = row * (segments + 1) + column;
      const b = a + 1;
      const c = a + segments + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new THREE.MeshBasicMaterial({
    color: area.color,
    map: area.quality === '禁牧' ? makeStripedTexture() : null,
    transparent: true,
    opacity: area.quality === '禁牧' ? 0.68 : 0.36,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 2;
  mesh.userData = { kind: 'area', area };
  areaMeshes.push(mesh);
  scene.add(mesh);
}

async function addAreaMeshes() {
  for (const area of AREAS) await createAreaMesh(area);
}

async function addLivestock() {
  await mapWithConcurrency(livestock, 8, async (animal) => {
    const point = await sampleGround(animal.longitude, animal.latitude);
    if (!point) return;
    const sprite = new THREE.Sprite(spriteMaterials[animal.status]);
    sprite.position.copy(point).add(new THREE.Vector3(0, 90, 0));
    sprite.scale.setScalar(320);
    sprite.renderOrder = 3;
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
  return items.map(([label, value, className = '']) => `<div><dt>${label}</dt><dd class="${className}">${value}</dd></div>`).join('');
}

function openDetails(object) {
  if (selectedObject?.userData.kind === 'animal') selectedObject.scale.setScalar(320);
  selectedObject = object;
  if (object.userData.kind === 'animal') {
    const animal = object.userData.animal;
    const area = AREAS.find((candidate) => candidate.id === animal.areaId);
    object.scale.setScalar(470);
    detailKicker.textContent = '牲畜实时档案';
    detailTitle.textContent = animal.id;
    detailContent.innerHTML = rows([
      ['所属牧户', animal.ownerName], ['所属草场', area?.name ?? animal.areaId],
      ['健康状态', STATUS[animal.status].label, animal.status], ['体温', `${animal.temperature.toFixed(1)} °C`],
      ['心率', `${animal.heartRate} 次/分`]
    ]);
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
  if (selectedObject?.userData.kind === 'animal') selectedObject.scale.setScalar(320);
  selectedObject = null;
  detailPanel.hidden = true;
}

function pick(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const clickable = [...animalSprites.filter((sprite) => sprite.visible), ...areaMeshes];
  const intersections = raycaster.intersectObjects(clickable, false);
  if (intersections.length) openDetails(intersections[0].object);
  else closeDetails();
}

renderer.domElement.addEventListener('pointerdown', (event) => pointerDown.set(event.clientX, event.clientY));
renderer.domElement.addEventListener('pointerup', (event) => {
  if (pointerDown.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) < 5) pick(event);
});
statusFilter.addEventListener('change', updateFilters);
ownerFilter.addEventListener('change', updateFilters);
document.querySelector('#close-detail').addEventListener('click', closeDetails);

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
    loadingMessage.textContent = '正在定位牲畜光点...';
    await Promise.all([addCenterMarker(), addLivestock()]);
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
}
addEventListener('resize', resize);

function animate(time) {
  requestAnimationFrame(animate);
  controls.update();
  if (map) map.update(camera);
  spriteMaterials.abnormal.opacity = 0.38 + (Math.sin(time * 0.012) * 0.5 + 0.5) * 0.62;
  renderer.render(scene, camera);
}

bootstrap();
animate(0);

export { livestock, getAreaMetrics };
