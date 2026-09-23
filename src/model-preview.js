import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const MODEL_PATHS = {
  '牛': '/models/cow.glb'
};

const container = document.querySelector('#model-preview');
let scene, camera, renderer, controls, loader;
let currentModel = null;
let animationId = null;
let isVisible = false;
let resizeObserver = null;

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
  renderer.toneMappingExposure = 1.2;

  const canvas = renderer.domElement;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  canvas.style.position = 'absolute';
  canvas.style.top = '0';
  canvas.style.left = '0';
  container.style.position = 'relative';
  container.appendChild(canvas);

  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.enableZoom = true;
  controls.enablePan = false;
  controls.minDistance = 1.5;
  controls.maxDistance = 10;
  controls.maxPolarAngle = Math.PI * 0.85;
  controls.target.set(0, 0.5, 0);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.8);
  dirLight.position.set(3, 5, 4);
  scene.add(dirLight);

  const fillLight = new THREE.DirectionalLight(0x88ccaa, 0.5);
  fillLight.position.set(-3, 2, -2);
  scene.add(fillLight);

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

function animate() {
  if (!isVisible) {
    animationId = null;
    return;
  }
  animationId = requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

function clearModel() {
  if (currentModel) {
    scene.remove(currentModel);
    currentModel.traverse((child) => {
      if (child.isMesh) {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material?.dispose();
        }
      }
    });
    currentModel = null;
  }
}

function fitModelToView(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = maxDim > 0 ? 2.5 / maxDim : 1;
  object.scale.setScalar(scale);

  box.setFromObject(object);
  box.getCenter(center);
  object.position.sub(center);
  object.position.y += (size.y * scale) / 2;

  camera.position.set(0, size.y * scale * 0.6, Math.max(size.x, size.z) * scale * 2.2);
  controls.target.set(0, size.y * scale * 0.4, 0);
  controls.update();
}

function loadModel(type) {
  const path = MODEL_PATHS[type];
  if (!path) {
    showPlaceholder(`暂无${type}模型`);
    return;
  }

  clearModel();
  showLoading();

  loader.load(
    path,
    (gltf) => {
      currentModel = gltf.scene;
      scene.add(currentModel);
      fitModelToView(currentModel);
      hidePlaceholder();
    },
    undefined,
    (error) => {
      console.error('[model-preview] 模型加载失败:', error);
      showPlaceholder('模型加载失败');
    }
  );
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
  isVisible = true;
  container.hidden = false;
  requestAnimationFrame(() => {
    handleResize();
    loadModel(animalType);
    if (!animationId) animate();
  });
}

export function hideModelPreview() {
  isVisible = false;
  if (animationId) {
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
  controls = null;
}
