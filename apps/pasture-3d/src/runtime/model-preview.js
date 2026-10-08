import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { disposeTree, hasWebGL2, sceneQuality } from './support.js';

export function createModelPreview({ container, modelUrls = {}, mobile = false, interactive = false, onState = () => {} }) {
  if (!hasWebGL2()) throw new Error('当前设备不支持 WebGL2，无法展示牲畜模型');
  const quality = sceneQuality(mobile);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.pixelRatio));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.8;
  Object.assign(renderer.domElement.style, { width: '100%', height: '100%', display: 'block', touchAction: 'none' });
  container.appendChild(renderer.domElement);
  scene.add(new THREE.AmbientLight(0xffffff, 1));
  const light = new THREE.DirectionalLight(0xffffff, 0.8);
  light.position.set(3, 5, 4); scene.add(light);
  const controls = interactive ? new OrbitControls(camera, renderer.domElement) : null;
  if (controls) { controls.enableDamping = true; controls.enablePan = false; controls.minDistance = 2; controls.maxDistance = 18; }
  let interacting = false;
  controls?.addEventListener('start', () => { interacting = true; });
  controls?.addEventListener('end', () => { interacting = false; });
  const manager = new THREE.LoadingManager();
  const loader = new GLTFLoader(manager);
  let currentModel = null, visible = false, active = true, disposed = false;
  let animationId = 0, lastFrame = 0, requestId = 0, loadTimer = 0;
  const emit = (state, message = '') => { if (!disposed) onState({ state, message }); };
  const clearModel = () => {
    if (!currentModel) return;
    scene.remove(currentModel); disposeTree(currentModel); currentModel = null;
  };
  function resize() {
    if (disposed) return;
    const width = Math.max(1, container.clientWidth), height = Math.max(1, container.clientHeight);
    camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height, false);
    if (currentModel) fitModelToView(currentModel.children[0]);
    controls?.update();
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

  }

  function animate(time) {
    animationId = 0;
    if (!visible || !active || disposed) return;
    animationId = requestAnimationFrame(animate);
    if (lastFrame && time - lastFrame < 1000 / quality.fps - 0.5) return;
    const delta = lastFrame ? Math.min(time - lastFrame, 100) : 0;
    lastFrame = time;
    if (currentModel && !interacting) currentModel.rotation.y += delta * (2 * Math.PI / 25000);
    controls?.update(); renderer.render(scene, camera);
  }
  function start() { if (!animationId && visible && active && !disposed) animationId = requestAnimationFrame(animate); }
  function setActive(value) {
    active = Boolean(value); lastFrame = 0;
    if (!active) { cancelAnimationFrame(animationId); animationId = 0; } else start();
  }
  function hide() {
    visible = false; requestId += 1; clearTimeout(loadTimer); manager.abort?.();
    cancelAnimationFrame(animationId); animationId = 0; lastFrame = 0; clearModel();
  }
  function show(type) {
    if (disposed) return;
    hide(); visible = true; resize();
    const url = modelUrls[type];
    if (!url) { emit('empty', `暂无${type}模型`); return; }
    const id = ++requestId;
    emit('loading', '正在加载牲畜模型…');
    loadTimer = setTimeout(() => {
      if (id === requestId && visible && !disposed) { requestId += 1; emit('error', '模型加载超时，请重试'); }
    }, 20000);
    loader.load(url, gltf => {
      if (disposed || !visible || id !== requestId) { disposeTree(gltf.scene); return; }
      clearTimeout(loadTimer); fixMaterials(gltf.scene);
      currentModel = new THREE.Group(); currentModel.add(gltf.scene); scene.add(currentModel);
      fitModelToView(gltf.scene);
      if (controls) { controls.target.set(0, 0, 0); controls.update(); }
      emit('ready'); start();
    }, undefined, () => {
      if (disposed || !visible || id !== requestId) return;
      clearTimeout(loadTimer); emit('error', '模型加载失败，请重试');
    });
  }
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  observer?.observe(container);
  if (!observer) window.addEventListener('resize', resize);
  const contextLost = event => { event.preventDefault(); setActive(false); emit('error', '图形环境中断，请关闭后重试'); };
  renderer.domElement.addEventListener('webglcontextlost', contextLost);
  return { show, hide, setActive, resize, dispose() {
    if (disposed) return;
    hide(); disposed = true; observer?.disconnect(); window.removeEventListener('resize', resize);
    renderer.domElement.removeEventListener('webglcontextlost', contextLost);
    controls?.dispose(); disposeTree(scene); scene.clear();
    renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
  }};
}
