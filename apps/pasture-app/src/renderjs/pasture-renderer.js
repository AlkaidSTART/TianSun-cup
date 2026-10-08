// Lightweight renderjs adapter. Heavy libraries only exist in the view layer.
let runtimePromise;
const records = new WeakMap();
function runtimeAt(base) {
  if (window.PastureRuntime) return Promise.resolve(window.PastureRuntime);
  if (runtimePromise) return runtimePromise;
  runtimePromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(() => fail(new Error('场景脚本加载超时，请重试')), 15000);
    function fail(error) { clearTimeout(timer); script.remove(); runtimePromise = null; reject(error); }
    script.src = new URL('runtime.js', base).href;
    script.onload = () => {
      clearTimeout(timer);
      if (!window.PastureRuntime) { fail(new Error('场景脚本不可用，请重新构建 App')); return; }
      resolve(window.PastureRuntime);
    };
    script.onerror = () => fail(new Error('场景资源加载失败，请重试或重新安装 App'));
    document.head.appendChild(script);
  });
  return runtimePromise;
}
function recordFor(instance, owner) {
  let record = records.get(instance);
  if (!record) { record = { owner, pending: null, session: null, mounted: false, destroyed: false, frame: 0, attempts: 0 }; records.set(instance, record); }
  if (owner) record.owner = owner;
  return record;
}
function attach(record) {
  if (record.destroyed || !record.mounted || !record.pending) return;
  if (record.session) { record.session.configure(record.pending); return; }
  // On APP-PLUS a renderjs module is mounted on a detached helper div, so its
  // this.$el is NOT the owning component. Resolve the explicitly bound host id.
  const host = document.getElementById(record.pending.hostId);
  if (!host?.querySelector('.pasture-canvas') || !host?.querySelector('.pasture-model-canvas')) {
    if (!record.frame && record.attempts++ < 120) {
      record.frame = requestAnimationFrame(() => { record.frame = 0; attach(record); });
    }
    return;
  }
  record.session = createSession(host, record);
  record.session.configure(record.pending);
}
function createSession(host, record) {
  const viewport = host.querySelector('.pasture-canvas');
  const modelHost = host.querySelector('.pasture-model-canvas');
  let api, preview, runtime, config, base;
  let disposed = false, generation = 0, revision = -1, lastCommand = -1;
  let intersecting = true, browserVisible = !document.hidden, previewKey = '', manualPaused = false;
  let bodyOverflow = null;
  const emit = event => { if (!disposed) record.owner?.callMethod('handleSceneEvent', event); };
  const modalOpen = () => !!config?.selection;
  function updateActive() {
    const active = !!config?.active && browserVisible;
    api?.setActive(active && intersecting && !modalOpen());
    preview?.setActive(active && modalOpen());
  }
  function lockScroll(locked) {
    if (locked && bodyOverflow === null) { bodyOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
    if (!locked && bodyOverflow !== null) { document.body.style.overflow = bodyOverflow; bodyOverflow = null; }
  }
  function updatePreview(force = false) {
    lockScroll(modalOpen());
    const selection = config?.selection;
    const key = selection?.kind === 'animal' ? `${selection.id}:${selection.type}` : '';
    if (key === previewKey && !force) { updateActive(); return; }
    previewKey = key;
    preview?.hide();
    if (!key || !runtime) { updateActive(); return; }
    if (selection.type !== '牛') { emit({ type: 'preview', state: 'empty', message: `暂无${selection.type}模型` }); updateActive(); return; }
    try {
      if (force) { preview?.dispose(); preview = null; }
      if (!preview) preview = runtime.createModelPreview({
        container: modelHost, mobile: true, interactive: true,
        modelUrls: { '牛': new URL('yak.glb', base).href },
        onState: event => emit({ type: 'preview', ...event }),
      });
      preview.show(selection.type);
    } catch (error) { emit({ type: 'preview', state: 'error', message: error.message }); }
    updateActive();
  }
  async function initialize() {
    const current = ++generation;
    api?.dispose(); api = null;
    preview?.dispose(); preview = null; previewKey = '';
    emit({ type: 'loading', message: '正在准备 3D 场景…' });
    try {
      base = new URL(config.assetRoot, document.baseURI).href;
      runtime = await runtimeAt(base);
      if (disposed || current !== generation) return;
      api = runtime.createPastureScene({ container: viewport, token: config.token, mobile: true,
        active: !!config.active && browserVisible && intersecting,
        onEvent: event => {
          if (disposed || current !== generation) return;
          if (event.type === 'state') manualPaused = event.manualPaused;
          if (['loading', 'ready', 'error', 'service', 'state', 'selection'].includes(event.type)) emit(event);
        },
      });
      api.setPaused(manualPaused);
      updatePreview(true); updateActive();
    } catch (error) {
      if (disposed || current !== generation) return;
      emit({ type: 'error', title: '3D 场景暂不可用', message: error.message });
    }
  }
  function configure(value) {
    if (disposed) return;
    config = value;
    if (revision !== value.revision) {
      revision = value.revision;
      void initialize();
    }
    updatePreview(); updateActive();
    const command = value.command;
    if (!command || command.id === lastCommand) return;
    lastCommand = command.id;
    if (command.type === 'zoom') api?.zoom(command.value);
    if (command.type === 'reset') api?.resetView();
    if (command.type === 'pause') { manualPaused = !!command.value; api?.setPaused(manualPaused); }
    if (command.type === 'clear') api?.clearSelection();
    if (command.type === 'focus') { api?.clearSelection(); api?.focusAnimal(command.value); }
    if (command.type === 'retry-preview') updatePreview(true);
  }
  const intersection = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
    intersecting = entries[entries.length - 1].isIntersecting; updateActive();
  }) : null;
  intersection?.observe(viewport);
  const visibility = () => { browserVisible = !document.hidden; updateActive(); };
  const pagehide = event => { if (!event.persisted) dispose(); else { browserVisible = false; updateActive(); } };
  const pageshow = () => { browserVisible = !document.hidden; updateActive(); };
  const keydown = event => { if (event.key === 'Escape' && modalOpen()) record.owner?.callMethod('closeSelection'); };
  document.addEventListener('visibilitychange', visibility);
  document.addEventListener('keydown', keydown);
  window.addEventListener('pagehide', pagehide);
  window.addEventListener('pageshow', pageshow);
  // renderjs has no supported beforeUnmount/unmounted hook. Observe removal instead.
  const removal = new MutationObserver(() => { if (!host.isConnected) dispose(); });
  removal.observe(document.documentElement, { childList: true, subtree: true });
  function dispose() {
    if (disposed) return;
    disposed = true; generation += 1;
    api?.dispose(); preview?.dispose(); api = preview = null;
    intersection?.disconnect(); removal.disconnect(); lockScroll(false);
    document.removeEventListener('visibilitychange', visibility);
    document.removeEventListener('keydown', keydown);
    window.removeEventListener('pagehide', pagehide); window.removeEventListener('pageshow', pageshow);
    record.destroyed = true; record.session = null;
  }
  return { configure, dispose };
}
export default {
  mounted() {
    const record = recordFor(this, this.$ownerInstance);
    record.mounted = true;
    attach(record);
  },
  methods: {
    onState(value, oldValue, ownerInstance) {
      const record = recordFor(this, ownerInstance);
      record.pending = value;
      attach(record);
    },
  },
};
