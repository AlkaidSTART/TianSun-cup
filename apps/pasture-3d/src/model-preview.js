import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const MODEL_PATHS = {
  '牛': '/models/cow.glb'
};

const ROTATION_SPEED = (2 * Math.PI) / (25 * 60);

const container = document.querySelector('#model-preview');
let scene, camera, renderer, loader;
let currentModel = null;
let isVisible = false;
let resizeObserver = null;
let animationId = null;

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

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
  dirLight.position.set(3, 5, 4);
  scene.add(dirLight);

  const fillLight = new THREE.DirectionalLight(0xaaccaa, 0.4);
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
  if (currentModel) {
    currentModel.rotation.y += ROTATION_SPEED;
  }
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
  const scale = maxDim > 0 ? 5.0 / maxDim : 1;
  object.scale.setScalar(scale);

  box.setFromObject(object);
  box.getCenter(center);
  object.position.sub(center);
  object.position.y += (size.y * scale) / 2;

  const scaledSize = new THREE.Vector3(size.x * scale, size.y * scale, size.z * scale);
  const scaledMaxDim = Math.max(scaledSize.x, scaledSize.y, scaledSize.z);
  
  camera.position.set(0, scaledSize.y * 0.5, scaledMaxDim * 2.5);
  camera.lookAt(0, scaledSize.y * 0.4, 0);

  console.log('[model-preview] 模型缩放:', {
    原始尺寸: { x: size.x.toFixed(2), y: size.y.toFixed(2), z: size.z.toFixed(2) },
    缩放系数: scale.toFixed(3),
    缩放后尺寸: { x: scaledSize.x.toFixed(2), y: scaledSize.y.toFixed(2), z: scaledSize.z.toFixed(2) },
    相机位置: { x: camera.position.x.toFixed(2), y: camera.position.y.toFixed(2), z: camera.position.z.toFixed(2) },
    相机距离: camera.position.distanceTo(new THREE.Vector3(0, scaledSize.y * 0.4, 0)).toFixed(2)
  });
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
      fixMaterials(currentModel);
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
}
