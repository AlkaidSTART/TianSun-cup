import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { WORLD_SPEC } from './world-spec.js';
import './style.css';

// Production tier: all texture inputs are generated locally and remain editable.
const spec = WORLD_SPEC;
const root = document.querySelector('#scene-container');
const loading = document.querySelector('#loading');
const seed = spec.seed;
const size = spec.world.size;
const half = size / 2;
const resolution = spec.world.resolution;
const textureSize = 256;
const isInitialPreview = decodeURIComponent(location.pathname).endsWith('terrain_初版_backup.html');
const textureLoader = new THREE.TextureLoader();
const TEXTURE_URLS = {
  meadowMap: new URL('../../grass.jpg', import.meta.url).href,
  soilMap: new URL('../../soil.jpg', import.meta.url).href
};

function mulberry32(value) {
  return function random() { let t = value += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const random = mulberry32(seed);

function smooth(t) { return t * t * (3 - 2 * t); }
function hash(x, z) { const n = Math.sin(x * 127.1 + z * 311.7 + seed * 0.17) * 43758.5453; return n - Math.floor(n); }
function valueNoise(x, z) {
  const x0 = Math.floor(x), z0 = Math.floor(z), fx = smooth(x - x0), fz = smooth(z - z0);
  const a = hash(x0, z0), b = hash(x0 + 1, z0), c = hash(x0, z0 + 1), d = hash(x0 + 1, z0 + 1);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, fx), THREE.MathUtils.lerp(c, d, fx), fz);
}
function fbm(x, z) { return valueNoise(x, z) * .56 + valueNoise(x * 2.1, z * 2.1) * .28 + valueNoise(x * 4.4, z * 4.4) * .16; }
function streamInfluence(x, z) {
  let influence = 0;
  for (const stream of spec.streams) for (let i = 0; i < stream.points.length - 1; i += 1) {
    const a = stream.points[i], b = stream.points[i + 1];
    const abx = b[0] - a[0], abz = b[2] - a[2], apx = x - a[0], apz = z - a[2];
    const t = THREE.MathUtils.clamp((apx * abx + apz * abz) / (abx * abx + abz * abz), 0, 1);
    const dx = x - (a[0] + abx * t), dz = z - (a[2] + abz * t);
    influence = Math.max(influence, Math.exp(-(dx * dx + dz * dz) / 150) * (1 - t * .25));
  }
  return influence;
}
function terrainHeight(x, z) {
  const broad = fbm(x * .014 + 12, z * .014 - 3);
  const rolling = fbm(x * .032 - 4, z * .032 + 7);
  const basin = Math.exp(-((x + 6) ** 2 / 13000 + (z - 4) ** 2 / 9000));
  return 11 + broad * 14 + rolling * 5 - basin * 4 - streamInfluence(x, z) * 3.8;
}
function terrainSlope(x, z) {
  const d = .9;
  return Math.atan(Math.hypot(terrainHeight(x + d, z) - terrainHeight(x - d, z), terrainHeight(x, z + d) - terrainHeight(x, z - d)) / (2 * d));
}

function makeNoiseTexture({ base, fibers, grain = 0.12, seedOffset = 0 }) {
  const canvas = document.createElement('canvas'); canvas.width = textureSize; canvas.height = textureSize;
  const context = canvas.getContext('2d'); const image = context.createImageData(textureSize, textureSize);
  for (let y = 0; y < textureSize; y += 1) for (let x = 0; x < textureSize; x += 1) {
    const n = fbm(x * .035 + seedOffset, y * .035 - seedOffset * .7);
    const fine = valueNoise(x * .16 + seedOffset, y * .16 + seedOffset);
    const blade = Math.max(0, Math.sin(x * .63 + n * 9 + seedOffset) * .5 + .5) * fibers;
    const variation = (n - .5) * grain * 255 + (fine - .5) * 13 + blade * 15;
    const index = (y * textureSize + x) * 4;
    image.data[index] = THREE.MathUtils.clamp(base[0] + variation, 0, 255);
    image.data[index + 1] = THREE.MathUtils.clamp(base[1] + variation, 0, 255);
    image.data[index + 2] = THREE.MathUtils.clamp(base[2] + variation, 0, 255);
    image.data[index + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(8, 8); texture.anisotropy = 8;
  return texture;
}

function makeRoughnessTexture(value, variation = .1, seedOffset = 0) {
  const canvas = document.createElement('canvas'); canvas.width = textureSize; canvas.height = textureSize; const context = canvas.getContext('2d'); const image = context.createImageData(textureSize, textureSize);
  for (let y = 0; y < textureSize; y += 1) for (let x = 0; x < textureSize; x += 1) { const noise = (valueNoise(x * .11 + seedOffset, y * .11 - seedOffset) - .5) * variation * 255; const channel = THREE.MathUtils.clamp(value * 255 + noise, 0, 255); const index = (y * textureSize + x) * 4; image.data[index] = channel; image.data[index + 1] = channel; image.data[index + 2] = channel; image.data[index + 3] = 255; }
  context.putImageData(image, 0, 0); const texture = new THREE.CanvasTexture(canvas); texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(8, 8); return texture;
}

function makeNormalTexture(strength = .5, seedOffset = 0) {
  const canvas = document.createElement('canvas'); canvas.width = textureSize; canvas.height = textureSize; const context = canvas.getContext('2d'); const image = context.createImageData(textureSize, textureSize);
  for (let y = 0; y < textureSize; y += 1) for (let x = 0; x < textureSize; x += 1) {
    const left = fbm((x - 1) * .045 + seedOffset, y * .045), right = fbm((x + 1) * .045 + seedOffset, y * .045); const down = fbm(x * .045 + seedOffset, (y - 1) * .045); const up = fbm(x * .045 + seedOffset, (y + 1) * .045);
    const index = (y * textureSize + x) * 4; image.data[index] = 128 + (left - right) * 255 * strength; image.data[index + 1] = 128 + (down - up) * 255 * strength; image.data[index + 2] = 255; image.data[index + 3] = 255;
  }
  context.putImageData(image, 0, 0); const texture = new THREE.CanvasTexture(canvas); texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(8, 8); return texture;
}

function loadLocalTexture(label, url, fallbackFactory) {
  return new Promise((resolve) => {
    textureLoader.load(url, (texture) => {
      texture.colorSpace = label.includes('map') && !label.includes('normal') && !label.includes('roughness') ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(8, 8); texture.anisotropy = 8;
      console.info(`[production texture] ${label}: loaded local image`, url); resolve(texture);
    }, undefined, (error) => {
      console.warn(`[production texture warning] ${label}: failed to load local image ${url}; using CanvasTexture fallback.`, error); resolve(fallbackFactory());
    });
  });
}

async function makePbrLayer(type) {
  const recipes = {
    meadow: { base: [124, 145, 70], fibers: .85, grain: .18, roughness: .88, normal: .25, offset: 4 },
    soil: { base: [137, 101, 66], fibers: .12, grain: .28, roughness: .98, normal: .62, offset: 17 },
    rock: { base: [116, 111, 91], fibers: .03, grain: .35, roughness: .82, normal: .85, offset: 29 }
  };
  const recipe = recipes[type];
  const proceduralMap = () => makeNoiseTexture({ base: recipe.base, fibers: recipe.fibers, grain: recipe.grain, seedOffset: recipe.offset });
  const proceduralNormal = () => makeNormalTexture(recipe.normal, recipe.offset);
  const proceduralRoughness = () => makeRoughnessTexture(recipe.roughness, .08, recipe.offset);
  const map = type === 'meadow' ? await loadLocalTexture('meadow albedo map (grass.jpg)', TEXTURE_URLS.meadowMap, proceduralMap) : type === 'soil' ? await loadLocalTexture('soil albedo map (soil.jpg)', TEXTURE_URLS.soilMap, proceduralMap) : proceduralMap();
  const normalMap = proceduralNormal();
  const roughnessMap = proceduralRoughness();
  console.info(`[production texture summary] ${type} layer ready`, { map: map.image?.src || 'CanvasTexture fallback', normalMap: normalMap.image?.src || 'CanvasTexture fallback', roughnessMap: roughnessMap.image?.src || 'CanvasTexture fallback' });
  return { map, roughnessMap, normalMap, roughness: recipe.roughness, metalness: .02 };
}

function makeEnvironmentTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 512; const context = canvas.getContext('2d'); const gradient = context.createLinearGradient(0, 0, 0, canvas.height); gradient.addColorStop(0, '#587f9b'); gradient.addColorStop(.38, '#aac8c4'); gradient.addColorStop(.65, '#e0d8b4'); gradient.addColorStop(1, '#87966d'); context.fillStyle = gradient; context.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas); texture.mapping = THREE.EquirectangularReflectionMapping; texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

const scene = new THREE.Scene(); scene.background = new THREE.Color('#a9c1b6'); scene.environment = makeEnvironmentTexture(); scene.environmentIntensity = .34; scene.fog = new THREE.FogExp2('#a9c1b6', .0038);
const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, .1, 700); camera.position.set(118, 88, 132);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08; root.appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement); controls.target.set(0, 14, 0); controls.enableDamping = true; controls.dampingFactor = .06; controls.minDistance = 28; controls.maxDistance = 280; controls.maxPolarAngle = Math.PI * .47;

scene.add(new THREE.HemisphereLight('#e9f2de', '#566354', 2.2));
const sun = new THREE.DirectionalLight('#ffe5b0', 3.7); sun.position.set(-80, 145, 65); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -145; sun.shadow.camera.right = 145; sun.shadow.camera.top = 145; sun.shadow.camera.bottom = -145; sun.shadow.bias = -.0004; scene.add(sun);
const fill = new THREE.DirectionalLight('#8faeb0', .7); fill.position.set(120, 50, -90); scene.add(fill);

function createTerrainGeometry() {
  const geometry = new THREE.PlaneGeometry(size, size, resolution, resolution); geometry.rotateX(-Math.PI / 2); const positions = geometry.attributes.position; const meadowAlpha = new Float32Array(positions.count * 4); const soilAlpha = new Float32Array(positions.count * 4); const rockAlpha = new Float32Array(positions.count * 4);
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i), z = positions.getZ(i), y = terrainHeight(x, z), slope = terrainSlope(x, z); positions.setY(i, y);
    const wet = streamInfluence(x, z); const soil = THREE.MathUtils.smoothstep(slope, THREE.MathUtils.degToRad(8), THREE.MathUtils.degToRad(18)) * .78 + THREE.MathUtils.smoothstep(y, 23, 35) * .2; const rock = THREE.MathUtils.smoothstep(slope, THREE.MathUtils.degToRad(15), THREE.MathUtils.degToRad(25)) * .9 + THREE.MathUtils.smoothstep(y, 30, 37) * .32; const wetFade = 1 - wet * .7;
    const meadow = THREE.MathUtils.clamp(1 - soil * .65 - rock * .62 + wet * .2, .05, 1);
    meadowAlpha.set([1, 1, 1, meadow], i * 4); soilAlpha.set([1, 1, 1, soil], i * 4); rockAlpha.set([1, 1, 1, rock * wetFade], i * 4);
  }
  geometry.setAttribute('meadowAlpha', new THREE.BufferAttribute(meadowAlpha, 4)); geometry.setAttribute('soilAlpha', new THREE.BufferAttribute(soilAlpha, 4)); geometry.setAttribute('rockAlpha', new THREE.BufferAttribute(rockAlpha, 4)); geometry.computeVertexNormals(); return geometry;
}

async function buildTerrain() {
  const geometry = createTerrainGeometry();
  if (isInitialPreview) {
    const positions = geometry.attributes.position; const colors = new Float32Array(positions.count * 3); const meadow = new THREE.Color('#a2ad5e'); const dry = new THREE.Color('#aa8d65'); const wet = new THREE.Color('#7f9c63');
    for (let i = 0; i < positions.count; i += 1) { const x = positions.getX(i), z = positions.getZ(i), y = positions.getY(i), slope = terrainSlope(x, z); const color = meadow.clone().lerp(dry, THREE.MathUtils.clamp((y - 19) / 9 + slope * 1.5, 0, 1)).lerp(wet, streamInfluence(x, z) * .72); colors[i * 3] = color.r; colors[i * 3 + 1] = color.g; colors[i * 3 + 2] = color.b; }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .96, metalness: 0 })); mesh.name = 'terrain-initial-vertex-color'; mesh.receiveShadow = true; scene.add(mesh); const skirt = new THREE.Mesh(new THREE.BoxGeometry(size, 14, size), new THREE.MeshStandardMaterial({ color: '#6d6b4f', roughness: 1 })); skirt.position.y = 2; skirt.receiveShadow = true; scene.add(skirt); return;
  }
  const [meadow, soil, rock] = await Promise.all([makePbrLayer('meadow'), makePbrLayer('soil'), makePbrLayer('rock')]);
  const base = new THREE.MeshStandardMaterial({ ...meadow, vertexColors: false, roughness: .9, metalness: .02 }); const soilMaterial = new THREE.MeshStandardMaterial({ ...soil, transparent: true, depthWrite: false, vertexColors: true, roughness: .98, metalness: .02 }); const rockMaterial = new THREE.MeshStandardMaterial({ ...rock, transparent: true, depthWrite: false, vertexColors: true, roughness: .84, metalness: .03 });
  geometry.setAttribute('color', geometry.getAttribute('meadowAlpha')); const baseMesh = new THREE.Mesh(geometry, base); baseMesh.name = 'terrain-meadow-pbr'; baseMesh.receiveShadow = true; scene.add(baseMesh);
  const soilGeometry = geometry.clone(); soilGeometry.setAttribute('color', soilGeometry.getAttribute('soilAlpha')); const soilMesh = new THREE.Mesh(soilGeometry, soilMaterial); soilMesh.name = 'terrain-soil-pbr'; soilMesh.receiveShadow = true; scene.add(soilMesh);
  const rockGeometry = geometry.clone(); rockGeometry.setAttribute('color', rockGeometry.getAttribute('rockAlpha')); const rockMesh = new THREE.Mesh(rockGeometry, rockMaterial); rockMesh.name = 'terrain-rock-pbr'; rockMesh.receiveShadow = true; scene.add(rockMesh);
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(size, 14, size), new THREE.MeshStandardMaterial({ map: soil.map, normalMap: soil.normalMap, roughnessMap: soil.roughnessMap, roughness: 1 })); skirt.position.y = 2; skirt.receiveShadow = true; scene.add(skirt);
}

function buildStreams() {
  if (isInitialPreview) {
    const waterMaterial = new THREE.MeshPhysicalMaterial({ color: '#6fb8bd', roughness: .17, metalness: .05, transmission: .12, transparent: true, opacity: .88, clearcoat: .7 });
    for (const stream of spec.streams) { const points = stream.points.map(([x, _, z]) => new THREE.Vector3(x, terrainHeight(x, z) + .13, z)); const curve = new THREE.CatmullRomCurve3(points); const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, stream.width, 8, false), waterMaterial); mesh.name = stream.id; mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh); }
    return;
  }
  const waterTexture = makeNoiseTexture({ base: [82, 155, 168], fibers: .4, grain: .12, seedOffset: 41 }); waterTexture.repeat.set(2, 12); const waterMaterial = new THREE.MeshPhysicalMaterial({ map: waterTexture, color: '#8fcbd0', roughness: .08, metalness: .08, transmission: .18, transparent: true, opacity: .72, clearcoat: 1, clearcoatRoughness: .1, side: THREE.DoubleSide, depthWrite: false });
  for (const stream of spec.streams) {
    const points = stream.points.map(([x, _, z]) => new THREE.Vector3(x, terrainHeight(x, z) + .17, z)); const curve = new THREE.CatmullRomCurve3(points); const samples = curve.getPoints(110); const vertices = [], uvs = [], indices = [];
    samples.forEach((point, index) => { const tangent = curve.getTangent(index / (samples.length - 1)).normalize(); const side = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize(); const width = stream.width * (1 + Math.sin(index * .33) * .08); const left = point.clone().addScaledVector(side, width); const right = point.clone().addScaledVector(side, -width); vertices.push(left.x, left.y, left.z, right.x, right.y, right.z); uvs.push(0, index / 14, 1, index / 14); if (index < samples.length - 1) { const n = index * 2; indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2); } });
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices); geometry.computeVertexNormals(); const mesh = new THREE.Mesh(geometry, waterMaterial); mesh.name = `${stream.id}-water-surface`; mesh.renderOrder = 2; scene.add(mesh);
  }
}

function buildVegetation() {
  const matrix = new THREE.Matrix4(); const q = new THREE.Quaternion(); const s = new THREE.Vector3(); const variants = [{ geometry: new THREE.ConeGeometry(.22, 1.2, 5), color: '#6e8741' }, { geometry: new THREE.ConeGeometry(.3, 1.55, 4), color: '#81964b' }, { geometry: new THREE.ConeGeometry(.16, .95, 6), color: '#58753f' }, { geometry: new THREE.ConeGeometry(.27, 1.05, 3), color: '#9aa251' }];
  variants.forEach((variant, variantIndex) => { const material = new THREE.MeshStandardMaterial({ color: variant.color, roughness: .96, metalness: 0 }); const grass = new THREE.InstancedMesh(variant.geometry, material, 380); grass.castShadow = true; let placed = 0; for (let attempt = 0; attempt < 5000 && placed < 380; attempt += 1) { const x = random() * size - half, z = random() * size - half, slope = terrainSlope(x, z), y = terrainHeight(x, z), water = streamInfluence(x, z); if (slope > THREE.MathUtils.degToRad(17) || water > .45 || y < 10 || random() < .73) continue; const scale = (.65 + random() * .7) * (variantIndex === 2 ? .7 : 1); s.set(scale * (0.7 + random() * .4), scale, scale * (0.7 + random() * .4)); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), random() * Math.PI); matrix.compose(new THREE.Vector3(x, y + .3 * scale, z), q, s); grass.setMatrixAt(placed++, matrix); } grass.count = placed; grass.instanceMatrix.needsUpdate = true; grass.name = `vegetation-grass-variant-${variantIndex + 1}`; scene.add(grass); });
  const shrubVariants = [{ geometry: new THREE.DodecahedronGeometry(1, 0), color: '#556e42' }, { geometry: new THREE.IcosahedronGeometry(1, 1), color: '#71844c' }]; shrubVariants.forEach((variant, variantIndex) => { const shrubs = new THREE.InstancedMesh(variant.geometry, new THREE.MeshStandardMaterial({ color: variant.color, roughness: 1 }), 120); shrubs.castShadow = true; let count = 0; for (let attempt = 0; attempt < 1800 && count < 120; attempt += 1) { const x = random() * size - half, z = random() * size - half, y = terrainHeight(x, z); if (terrainSlope(x, z) > .26 || streamInfluence(x, z) > .42 || random() < .7) continue; const sc = (.4 + random() * .65) * (variantIndex ? .8 : 1); matrix.compose(new THREE.Vector3(x, y + sc * .55, z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), random() * 6), new THREE.Vector3(sc * 1.25, sc, sc)); shrubs.setMatrixAt(count++, matrix); } shrubs.count = count; shrubs.instanceMatrix.needsUpdate = true; shrubs.name = `vegetation-shrub-variant-${variantIndex + 1}`; scene.add(shrubs); });
}

function buildTent(landmark) { const group = new THREE.Group(); group.name = landmark.id; const x = landmark.position[0], z = landmark.position[2], y = terrainHeight(x, z) + .08; group.position.set(x, y, z); group.scale.setScalar(landmark.scale); const canvas = new THREE.Mesh(new THREE.ConeGeometry(2.8, 4.2, 4, 1, false, Math.PI / 4), new THREE.MeshStandardMaterial({ color: '#eee5ca', roughness: .88, normalMap: makeNormalTexture(.13, 57) })); canvas.rotation.y = Math.PI / 4; canvas.position.y = 2.1; canvas.castShadow = true; const base = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.55, .35, 10), new THREE.MeshStandardMaterial({ color: '#80745a', roughness: 1 })); base.position.y = .18; base.castShadow = true; const pole = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, 1.2, 6), new THREE.MeshStandardMaterial({ color: '#5e4938', roughness: 1 })); pole.position.y = 3.85; group.add(base, canvas, pole); scene.add(group); }

async function buildWorld() {
  await Promise.all([buildTerrain(), buildStreams()]); buildVegetation(); spec.landmarks.forEach(buildTent);
  console.info(`[production world] quality tier: ${spec.qualityTier}; texture loading complete.`);
  loading.classList.add('hidden');
}

buildWorld().catch((error) => { console.error('[production world] build failed', error); loading.textContent = '地形加载失败，请查看控制台'; });
const groundGlow = new THREE.Mesh(new THREE.CircleGeometry(150, 64), new THREE.MeshBasicMaterial({ color: '#b8bf8b', transparent: true, opacity: .1, depthWrite: false })); groundGlow.rotation.x = -Math.PI / 2; groundGlow.position.y = -.1; scene.add(groundGlow);

function resize() { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); }
addEventListener('resize', resize);
function animate() { requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); }
animate();
