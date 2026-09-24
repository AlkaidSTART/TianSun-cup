import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const MODEL_PATHS = {
  '牛': `${import.meta.env.BASE_URL}models/yak.glb`
};

const ROTATION_SPEED = (2 * Math.PI) / 25_000;

const container = document.querySelector('#model-preview');
let scene, camera, renderer, loader;
let currentModel = null;
let isVisible = false;
let resizeObserver = null;
let animationId = null;
let lastFrameTime = null;
let loadRequestId = 0;
let openRequestId = 0;

function init() {
  if (scene) return;

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 1.5, 4);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.8;

  const canvas = renderer.domElement;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  canvas.style.position = 'absolute';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.pointerEvents = 'none';
  container.style.position = 'relative';
  container.appendChild(canvas);

  const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(3, 5, 4);
  scene.add(dirLight);

  loader = new GLTFLoader();

  resizeObserver = new ResizeObserver(() => {
    if (!isVisible) return;
    handleResize();
  });
  resizeObserver.observe(container);
}

function handleResize() {
  const width = container.clientWidth;
  const height = container.clientHeight;
  if (width === 0 || height === 0) return;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

function animate(time) {
  if (!isVisible) {
    animationId = null;
    lastFrameTime = null;
    return;
  }
  animationId = requestAnimationFrame(animate);
  const frameTime = Number.isFinite(time) ? time : performance.now();
  if (currentModel && Number.isFinite(lastFrameTime)) {
    const delta = Math.min(Math.max(frameTime - lastFrameTime, 0), 100);
    currentModel.rotation.y += ROTATION_SPEED * delta;
  }
  lastFrameTime = frameTime;
  renderer.render(scene, camera);
}

function startAnimation() {
  if (animationId !== null) return;
  lastFrameTime = null;
  animationId = requestAnimationFrame(animate);
}

function clearModel() {
  if (!currentModel) return;
  scene.remove(currentModel);
  disposeObject(currentModel);
  currentModel = null;
}

function fixMaterials(object) {
  object.traverse((child) => {
    if (child.isMesh && child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        if (material.emissive) {
          material.emissive.setHex(0x000000);
          material.emissiveIntensity = 0;
        }
        if (material.envMapIntensity !== undefined) {
          material.envMapIntensity = 0.5;
        }
        material.needsUpdate = true;
      });
    }
  });
}

function fitModelToView(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = maxDim > 0 ? 3 / maxDim : 1;
  object.scale.multiplyScalar(scale);
  object.position.sub(center.multiplyScalar(scale));

  const scaledBox = new THREE.Box3().setFromObject(object);
  const scaledSize = scaledBox.getSize(new THREE.Vector3());
  const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
  const scaledMaxDim = Math.max(scaledSize.x, scaledSize.y, scaledSize.z);
  const horizontalRadius = Math.hypot(scaledSize.x, scaledSize.z) / 2;
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
  const depthAllowance = horizontalRadius * 0.9;
  const distance = Math.max(
    scaledSize.y / (2 * Math.tan(verticalFov / 2) * 0.75),
    horizontalRadius / (Math.tan(horizontalFov / 2) * 0.75)
  ) + depthAllowance;

  camera.position.copy(scaledCenter).add(new THREE.Vector3(0, 0, distance));
  camera.lookAt(scaledCenter);
  camera.near = Math.max(0.01, distance - scaledMaxDim * 2);
  camera.far = distance + scaledMaxDim * 2;
  camera.updateProjectionMatrix();

  console.log('[model-preview] 模型加载成功:', {
    路径: MODEL_PATHS['牛'],
    scale: object.scale.toArray(),
    模型尺寸: scaledSize.toArray(),
    最大边长: scaledMaxDim,
    相机位置: camera.position.toArray(),
    相机距离: camera.position.distanceTo(scaledCenter),
    自转周期秒: 25
  });
}

function loadModel(type) {
  const path = MODEL_PATHS[type];
  const requestId = ++loadRequestId;
  if (!path) {
    showPlaceholder(`暂无${type}模型`);
    return;
  }

  clearModel();
  showLoading();

  loader.load(
    path,
    (gltf) => {
      if (!isVisible || requestId !== loadRequestId) {
        disposeObject(gltf.scene);
        return;
      }
      fixMaterials(gltf.scene);
      currentModel = new THREE.Group();
      currentModel.add(gltf.scene);
      scene.add(currentModel);
      fitModelToView(gltf.scene);
      hidePlaceholder();
    },
    undefined,
    (error) => {
      if (!isVisible || requestId !== loadRequestId) return;
      console.error('[model-preview] 模型加载失败:', error);
      showPlaceholder('模型加载失败');
    }
  );
}

function disposeObject(object) {
  object.traverse((child) => {
    if (!child.isMesh) return;
    child.geometry?.dispose();
    if (Array.isArray(child.material)) {
      child.material.forEach((material) => material.dispose());
    } else {
      child.material?.dispose();
    }
  });
}

function showLoading() {
  let el = container.querySelector('.model-loading');
  if (!el) {
    el = document.createElement('div');
    el.className = 'model-loading';
    el.textContent = '加载中…';
    container.appendChild(el);
  }
  el.style.display = 'flex';
}

function hidePlaceholder() {
  const placeholder = container.querySelector('.model-placeholder');
  if (placeholder) placeholder.style.display = 'none';
  const loading = container.querySelector('.model-loading');
  if (loading) loading.style.display = 'none';
}

function showPlaceholder(text) {
  let placeholder = container.querySelector('.model-placeholder');
  if (!placeholder) {
    placeholder = document.createElement('div');
    placeholder.className = 'model-placeholder';
    placeholder.innerHTML = `
      <span class="model-placeholder-icon">◇</span>
      <span class="model-placeholder-text">模型加载中</span>
      <small>后续接入牲畜 3D 模型</small>
    `;
    container.appendChild(placeholder);
  }
  const textEl = placeholder.querySelector('.model-placeholder-text');
  if (textEl && text) textEl.textContent = text;
  placeholder.style.display = 'flex';
  const loading = container.querySelector('.model-loading');
  if (loading) loading.style.display = 'none';
}

export function showModelPreview(animalType) {
  init();
  const requestId = ++openRequestId;
  isVisible = true;
  container.hidden = false;
  requestAnimationFrame(() => {
    if (!isVisible || requestId !== openRequestId) return;
    handleResize();
    loadModel(animalType);
    startAnimation();
  });
}

export function hideModelPreview() {
  isVisible = false;
  openRequestId += 1;
  loadRequestId += 1;
  lastFrameTime = null;
  if (animationId !== null) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  clearModel();
}

export function disposeModelPreview() {
  hideModelPreview();
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  if (renderer) {
    renderer.dispose();
    renderer = null;
  }
  scene = null;
  camera = null;
}
