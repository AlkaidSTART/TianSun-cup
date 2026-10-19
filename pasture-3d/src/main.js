import { createPastureScene } from './runtime/scene.js';
import { showModelPreview, hideModelPreview, disposeModelPreview } from './model-preview.js';
import { AREAS, STATUS } from './config.js';
import { getAreaMetrics } from './livestock-sprites.js';
import { normalizeHour, phaseLabelAtHour } from './livestock-day1-motion.js';
import { dayIndexAtHour, SIMULATION_TOTAL_HOURS } from './livestock-day2-overflow.js';
import './style.css';
const token = import.meta.env.TIANDITU_TOKEN?.trim();
const root = document.querySelector('#scene-container');
const loadingPanel = document.querySelector('#loading-panel');
const loadingTitle = document.querySelector('#loading-title');
const loadingMessage = document.querySelector('#loading-message');
const loadingPercent = document.querySelector('#loading-percent');
const loadingBarFill = document.querySelector('#loading-bar-fill');
const loadingStepTag = document.querySelector('#loading-step-tag');
const serviceStatus = document.querySelector('#service-status');
const serviceDot = document.querySelector('#service-dot');

let currentProgress = 6;
let targetProgress = 16;
let progressAnimId = null;
let isReadyTransitioning = false;

function setStepActive(stepIndex) {
  const stepNodes = loadingPanel?.querySelectorAll('.lp-step-node');
  stepNodes?.forEach((node, idx) => {
    node.classList.toggle('active', idx <= stepIndex);
  });
}

function tickLoading() {
  if (currentProgress < targetProgress) {
    const diff = targetProgress - currentProgress;
    const step = Math.max(0.35, diff * 0.12);
    currentProgress = Math.min(targetProgress, currentProgress + step);
    if (loadingPercent) loadingPercent.textContent = `${Math.round(currentProgress)}%`;
    if (loadingBarFill) {
      loadingBarFill.style.width = `${currentProgress}%`;
      const tip = loadingBarFill.querySelector('.lp-bar-tip');
      if (tip) tip.style.opacity = currentProgress > 1 ? '1' : '0';
    }
  }
  if (!isReadyTransitioning || currentProgress < 100) {
    progressAnimId = requestAnimationFrame(tickLoading);
  }
}
progressAnimId = requestAnimationFrame(tickLoading);

function updateLoadingState(msg) {
  if (isReadyTransitioning) return;
  let target = targetProgress;
  let step = '数据载入';
  let title = '正在连接天地图';
  let stepIdx = 0;

  if (msg.includes('真实地形高程') || msg.includes('高程')) {
    target = Math.max(target, 40);
    step = '高程解算';
    title = '采样地形高程';
    stepIdx = 1;
  } else if (msg.includes('草场分区')) {
    target = Math.max(target, 58);
    step = '草场建模';
    title = '构建空间分区';
    stepIdx = 2;
  } else if (msg.includes('牧民定居点') || msg.includes('夜间休息区')) {
    target = Math.max(target, 72);
    step = '设施划定';
    title = '划定定居点与围栏';
    stepIdx = 2;
  } else if (msg.includes('牲畜光点')) {
    target = Math.max(target, 84);
    step = '物联感知';
    title = '定位北斗信标';
    stepIdx = 3;
  } else if (msg.includes('早出晚归') || msg.includes('运动轨迹')) {
    target = Math.max(target, 92);
    step = '轨迹推演';
    title = '计算全天运动轨迹';
    stepIdx = 4;
  } else if (msg.includes('越界提醒')) {
    target = Math.max(target, 96);
    step = '态势就绪';
    title = '配置电子围栏';
    stepIdx = 4;
  } else if (msg.includes('地图瓦片')) {
    const match = msg.match(/(\d+)\/(\d+)/);
    if (match) {
      const loaded = Number(match[1]);
      const total = Number(match[2]) || 1;
      target = Math.max(target, Math.min(35, 12 + Math.round((loaded / total) * 22)));
    } else {
      target = Math.max(target, 25);
    }
    step = '瓦片加载';
    title = '接收卫星瓦片';
    stepIdx = 0;
  } else {
    target = Math.min(95, target + 4);
  }

  targetProgress = target;
  setStepActive(stepIdx);
  if (loadingStepTag) loadingStepTag.textContent = step;
  if (loadingTitle) loadingTitle.textContent = title;
  if (loadingMessage) loadingMessage.textContent = msg;
}

function finishLoading() {
  if (isReadyTransitioning) return;
  isReadyTransitioning = true;
  targetProgress = 100;
  currentProgress = 100;
  if (loadingPercent) loadingPercent.textContent = '100%';
  if (loadingBarFill) {
    loadingBarFill.style.width = '100%';
    const tip = loadingBarFill.querySelector('.lp-bar-tip');
    if (tip) tip.style.opacity = '1';
  }
  if (loadingStepTag) loadingStepTag.textContent = '就绪';
  if (loadingTitle) loadingTitle.textContent = '初始化完成';
  if (loadingMessage) loadingMessage.textContent = '正在进入数牧空间三维视界...';

  const stepNodes = loadingPanel?.querySelectorAll('.lp-step-node');
  stepNodes?.forEach(node => node.classList.add('active'));

  loadingPanel.classList.add('lp-complete');
  setTimeout(() => {
    loadingPanel.classList.add('hidden');
    if (progressAnimId) {
      cancelAnimationFrame(progressAnimId);
      progressAnimId = null;
    }
  }, 480);
}

function failLoading(title, message) {
  isReadyTransitioning = true;
  if (progressAnimId) {
    cancelAnimationFrame(progressAnimId);
    progressAnimId = null;
  }
  loadingPanel.classList.remove('hidden', 'lp-complete');
  loadingPanel.classList.add('error');
  if (loadingTitle) loadingTitle.textContent = title;
  if (loadingMessage) loadingMessage.textContent = message;
  serviceStatus.textContent = title;
  serviceDot.dataset.state = 'error';
}
const detailPanel = document.querySelector('#detail-panel');
const detailKicker = document.querySelector('#detail-kicker');
const detailTitle = document.querySelector('#detail-title');
const detailContent = document.querySelector('#detail-content');
const modelPreviewSection = document.querySelector('#model-preview');
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
const headerSim = document.querySelector('#header-sim');
const headerSimDay = document.querySelector('#header-sim-day');
const headerSimTime = document.querySelector('#header-sim-time');
const headerSimPhase = document.querySelector('#header-sim-phase');
const headerSimProgress = document.querySelector('#header-sim-progress');
const topbar = document.querySelector('.topbar');
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
  const renderedKeys = new Set();
  let nextId = 0;

  function entryKey(entry) {
    return `${entry.kind}|${entry.time}|${entry.text}`;
  }

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
    renderedKeys.add(entryKey(item));
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
  // 与上一帧对比，只有新出现的消息才播放「滚动入镜」，多条同时出现时依次错开。
  function setItems(entries) {
    if (!messageList) return;
    const previousKeys = new Set(renderedKeys);
    items.length = 0;
    renderedKeys.clear();
    messageList.replaceChildren();
    if (!entries.length) {
      renderEmptyState();
      updateCount();
      return;
    }
    let stagger = 0;
    entries.forEach((entry) => {
      const meta = MESSAGE_KINDS[entry.kind] ?? MESSAGE_KINDS.overflow;
      const key = entryKey(entry);
      const isNew = !previousKeys.has(key);
      const item = {
        id: `msg-${++nextId}`,
        kind: entry.kind,
        text: entry.text,
        time: entry.time,
        icon: meta.icon
      };
      items.push(item);
      renderedKeys.add(key);
      const row = createRow(item, isNew);
      if (isNew) {
        // 同时入镜的消息按出现顺序错开，形成一条条滚动滑入的效果
        row.style.animationDelay = `${Math.min(stagger, 8) * 80}ms`;
        stagger += 1;
      }
      messageList.append(row);
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

// 实时态势抽屉栏：可收纳/展开，并在宽度动画过程中同步下方消息面板高度。
const legendPanel = document.querySelector('#legend-panel');
const legendToggle = document.querySelector('#legend-toggle');
const LEGEND_COLLAPSED_KEY = 'pasture3d:legend-collapsed';

function setLegendCollapsed(collapsed, { persist = true } = {}) {
  if (!legendPanel || !legendToggle) return;
  legendPanel.classList.toggle('collapsed', collapsed);
  legendToggle.setAttribute('aria-expanded', String(!collapsed));
  legendToggle.setAttribute('aria-label', collapsed ? '展开实时态势面板' : '收起实时态势面板');
  legendToggle.title = collapsed ? '展开' : '收起';
  if (persist) {
    try {
      localStorage.setItem(LEGEND_COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch (error) {
      // 隐私模式等场景下 localStorage 不可用，忽略即可。
    }
  }
}

function initLegendDrawer() {
  if (!legendPanel || !legendToggle) return;
  let collapsed = false;
  try {
    collapsed = localStorage.getItem(LEGEND_COLLAPSED_KEY) === '1';
  } catch (error) {
    collapsed = false;
  }
  setLegendCollapsed(collapsed, { persist: false });

  legendPanel.querySelector('.legend-head')?.addEventListener('click', () => {
    setLegendCollapsed(!legendPanel.classList.contains('collapsed'));
  });

  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(() => layoutMessageFeed());
    observer.observe(legendPanel);
  } else {
    legendPanel.addEventListener('transitionend', (event) => {
      if (event.propertyName === 'width') layoutMessageFeed();
    });
  }
}
initLegendDrawer();

messageClear?.addEventListener('click', () => messageFeed.clear());

function formatSimulationHour(hour) {
  const minutes = Math.round((hour % 24) * 60) % 1440;
  const hours = Math.floor(minutes / 60);
  const minutePart = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutePart).padStart(2, '0')}`;
}

function updateSimulationUi(state) {
  const simulationHour = state.hour, simulationRunning = state.running;
  if (simulationTime) simulationTime.value = String(simulationHour);
  const hour = normalizeHour(simulationHour);
  if (simulationDayLabel) simulationDayLabel.textContent = `第 ${dayIndexAtHour(simulationHour)} 天`;
  if (simulationTimeLabel) {
    simulationTimeLabel.textContent = `${formatSimulationHour(hour)} · ${phaseLabelAtHour(hour)}`;
  }
  if (headerSimDay) headerSimDay.textContent = `第 ${dayIndexAtHour(simulationHour)} 天`;
  if (headerSimTime) headerSimTime.textContent = formatSimulationHour(hour);
  if (headerSimPhase) {
    const phase = phaseLabelAtHour(hour);
    if (headerSim.dataset.phase !== phase) headerSim.dataset.phase = phase;
    if (headerSimPhase.textContent !== phase) headerSimPhase.textContent = phase;
  }
  if (headerSimProgress) headerSimProgress.style.width = `${(simulationHour / SIMULATION_TOTAL_HOURS) * 100}%`;
  if (topbar) {
    const theme = state.night ? 'night' : 'day';
    if (topbar.dataset.timeTheme !== theme) topbar.dataset.timeTheme = theme;
  }
  if (simulationToggle) simulationToggle.textContent = simulationRunning ? '暂停' : '继续';
  if (simulationTime) simulationTime.disabled = !simulationRunning;
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

function renderDetails(selection) {
  if (!selection) {
    hideModelPreview(); detailPanel.hidden = true; delete detailPanel.dataset.kind; return;
  }
  const object = { userData: { kind: selection.kind, animal: {
    ...selection, profile: { livestockId: selection.id, type: selection.type, breed: selection.breed },
    telemetry: { metrics: selection.metrics, healthStatus: selection.healthStatus, recordedAt: selection.recordedAt }
  }, area: selection, name: selection.name } };
  hideModelPreview();
  modelPreviewSection.hidden = object.userData.kind !== 'animal';
  detailPanel.dataset.kind = object.userData.kind;
  if (object.userData.kind === 'animal') {
    const animal = object.userData.animal;
    const area = AREAS.find((candidate) => candidate.id === animal.areaId);
    const metrics = animal.telemetry.metrics;
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
    const previewLocation = selection;
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
        ['经纬度坐标', `${previewLocation.longitude.toFixed(5)}° E<br>${previewLocation.latitude.toFixed(5)}° N`],
        ['数据更新时间', formatDateTime(animal.telemetry.recordedAt)]
      ])
    ].join('');
    showModelPreview(animal.profile.type);
  } else if (object.userData.kind === 'area') {
    const area = object.userData.area;
    const metrics = { ...selection, pressure: selection.pressure ?? Infinity };
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
    detailContent.innerHTML = rows([['经度', '—'], ['纬度', '—']]);
  }
  detailPanel.hidden = false;
}


let viewer;
let manualPaused = false;
let prohibitedAnimalId = '';
function onEvent(event) {
  if (event.type === 'loading') updateLoadingState(event.message);
  if (event.type === 'ready') finishLoading();
  if (event.type === 'error') failLoading(event.title, event.message);
  if (event.type === 'service') { serviceStatus.textContent = event.message; serviceDot.dataset.state = event.state; }
  if (event.type === 'state') {
    manualPaused = event.manualPaused;
    updateSimulationUi(event);
    visibleCount.textContent = `${event.visible} / ${event.total}`;
    normalCount.textContent = String(event.counts.normal);
    attentionCount.textContent = String(event.counts.attention);
    abnormalCount.textContent = String(event.counts.abnormal);
    offlineCount.textContent = String(event.counts.offline);
    offlineAlert.textContent = `${event.counts.offline} 头牲畜设备掉线`;
  }
  if (event.type === 'selection') renderDetails(event.selection);
  if (event.type === 'messages') messageFeed.setItems(event.items);
  if (event.type === 'tooltip' && sceneTooltip) {
    sceneTooltip.hidden = !event.text;
    sceneTooltip.textContent = event.text;
    sceneTooltip.style.left = `${event.x + 16}px`; sceneTooltip.style.top = `${event.y + 16}px`;
  }
  if (event.type === 'prohibited') {
    prohibitedAnimalId = event.animalId || '';
    prohibitedModal.hidden = !event.message;
    prohibitedModalBody.textContent = event.message;
  }
}
messageFeed.clear();
layoutMessageFeed();
try { viewer = createPastureScene({ container: root, token, onEvent }); }
catch (error) { onEvent({ type: 'error', title: '3D 场景无法启动', message: error.message }); }
statusFilter.addEventListener('change', () => viewer?.setFilters({ status: statusFilter.value }));
ownerFilter.addEventListener('change', () => viewer?.setFilters({ ownerId: ownerFilter.value }));
document.querySelector('#close-detail').addEventListener('click', () => viewer?.clearSelection());
simulationTime?.addEventListener('input', event => viewer?.setSimulationHour(Number(event.target.value)));
simulationSpeed?.addEventListener('change', event => viewer?.setSpeed(Number(event.target.value)));
simulationToggle?.addEventListener('click', () => viewer?.setPaused(!manualPaused));
detailPanel.addEventListener('click', event => { if (event.target === detailPanel) viewer?.clearSelection(); });
for (const eventName of ['pointerdown', 'pointermove', 'pointerup', 'wheel']) {
  detailPanel.addEventListener(eventName, event => event.stopPropagation());
}
prohibitedModalDismiss?.addEventListener('click', () => viewer?.dismissProhibited());
prohibitedModal?.querySelector('.prohibited-modal-backdrop')?.addEventListener('click', () => viewer?.dismissProhibited());
prohibitedModalDetail?.addEventListener('click', () => {
  const id = prohibitedAnimalId;
  viewer?.selectAnimal(id); viewer?.focusAnimal(id); viewer?.dismissProhibited();
});
window.addEventListener('resize', layoutMessageFeed);
document.addEventListener('visibilitychange', () => viewer?.setActive(!document.hidden));
// 顶栏时钟：展示本机实时时间与日期。
const clockTimeEl = document.querySelector('#clock-time');
const clockDateEl = document.querySelector('#clock-date');
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
function updateHeaderClock() {
  if (!clockTimeEl) return;
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  clockTimeEl.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  if (clockDateEl) {
    clockDateEl.textContent = `${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())} ${WEEKDAYS[now.getDay()]}`;
  }
}
updateHeaderClock();
const clockInterval = setInterval(updateHeaderClock, 1000);


window.addEventListener('pagehide', event => {
  if (event.persisted) { viewer?.setActive(false); return; }
  viewer?.dispose(); disposeModelPreview(); clearInterval(clockInterval);
});
window.addEventListener('pageshow', () => viewer?.setActive(!document.hidden));
const debug = viewer?.debug;
if (debug) {
  window.__sceneView = debug;
  window.__dayOneOffline = { schedule: debug.offlineSchedule, validation: debug.offlineValidation, applyOfflineState: debug.applyOfflineState };
  window.__dayTwoOverflow = { schedule: debug.overflowSchedule, validation: debug.overflowValidation,
    markerLayer: debug.markerLayer, get simulationHour() { return debug.simulationHour; }, setSimulationHour: viewer.setSimulationHour };
  window.__dayThreeOverflow = { schedule: debug.dayThreeOverflowSchedule, validation: debug.dayThreeValidation,
    markerLayer: debug.markerLayer, get simulationHour() { return debug.simulationHour; }, setSimulationHour: viewer.setSimulationHour };
  window.__messageTimeline = debug.messageTimeline;
}
const livestock = debug?.livestock ?? [];
export { livestock, getAreaMetrics };
