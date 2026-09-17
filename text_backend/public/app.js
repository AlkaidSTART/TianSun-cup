const state = {
  records: [],
  stats: null,
  loading: false,
}

const elements = {
  statsGrid: document.querySelector('#statsGrid'),
  recordsBody: document.querySelector('#recordsBody'),
  emptyState: document.querySelector('#emptyState'),
  recordSummary: document.querySelector('#recordSummary'),
  searchInput: document.querySelector('#searchInput'),
  sourceFilter: document.querySelector('#sourceFilter'),
  statusFilter: document.querySelector('#statusFilter'),
  refreshButton: document.querySelector('#refreshButton'),
  syncTime: document.querySelector('#syncTime'),
  connectionPill: document.querySelector('#connectionPill'),
  sidebarSyncText: document.querySelector('#sidebarSyncText'),
  sourceChart: document.querySelector('#sourceChart'),
  healthList: document.querySelector('#healthList'),
  detailModal: document.querySelector('#detailModal'),
  detailTitle: document.querySelector('#detailTitle'),
  detailSubtitle: document.querySelector('#detailSubtitle'),
  detailBody: document.querySelector('#detailBody'),
  toast: document.querySelector('#toast'),
}

const sourceMeta = {
  purchased: { label: '购入', color: '#b87a2c' },
  born: { label: '生产', color: '#2f7c57' },
}

const statusMeta = {
  normal: { label: '正常', color: '#4f9a6d' },
  attention: { label: '需关注', color: '#c48a35' },
  abnormal: { label: '异常', color: '#c95545' },
  offline: { label: '离线', color: '#7b8781' },
}

let toastTimer

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function formatNumber(value) {
  return new Intl.NumberFormat('zh-CN').format(Number(value || 0))
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

function formatDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function showToast(message) {
  elements.toast.textContent = message
  elements.toast.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => elements.toast.classList.remove('show'), 2200)
}

function setConnection(ok, message) {
  elements.connectionPill.classList.toggle('error', !ok)
  elements.connectionPill.querySelector('span').textContent = ok ? '后台已连接' : '后台连接失败'
  elements.sidebarSyncText.textContent = ok ? message : '接口不可用，请启动后端服务'
}

async function requestApi(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })
  let payload
  try {
    payload = await response.json()
  } catch {
    throw new Error(`接口返回异常（HTTP ${response.status}）`)
  }
  if (!response.ok || payload.code !== 0) {
    const details = payload.details ? `：${Object.values(payload.details).join('，')}` : ''
    throw new Error(`${payload.message || '请求失败'}${details}`)
  }
  return payload.data
}

function renderStats() {
  const stats = state.stats || {}
  const cards = [
    { label: '在册牲畜', value: stats.total || 0, unit: '头', foot: `母 ${stats.female || 0} / 公 ${stats.male || 0}`, tag: '总档案', color: '#1f6a4c', icon: '全' },
    { label: '生产来源', value: stats.born || 0, unit: '头', foot: '可追溯母畜关系', tag: '繁育', color: '#2f6f9e', icon: '产' },
    { label: '购入来源', value: stats.purchased || 0, unit: '头', foot: '已登记供应商信息', tag: '购入', color: '#b87a2c', icon: '购' },
    { label: '待关注', value: (stats.attention || 0) + (stats.abnormal || 0) + (stats.offline || 0), unit: '头', foot: `需关注 ${stats.attention || 0} · 异常 ${stats.abnormal || 0} · 离线 ${stats.offline || 0}`, tag: '健康', color: '#c95545', icon: '警' },
  ]

  elements.statsGrid.innerHTML = cards.map((card) => `
    <article class="stat-card" style="--card-accent:${card.color}">
      <div class="stat-top">
        <span class="stat-label">${escapeHtml(card.label)}</span>
        <span class="stat-icon">${escapeHtml(card.icon)}</span>
      </div>
      <div class="stat-value">${formatNumber(card.value)}<small>${escapeHtml(card.unit)}</small></div>
      <div class="stat-foot"><span>${escapeHtml(card.foot)}</span><span class="stat-tag">${escapeHtml(card.tag)}</span></div>
    </article>
  `).join('')
}

function getFilteredRecords() {
  const query = elements.searchInput.value.trim().toLowerCase()
  const sourceType = elements.sourceFilter.value
  const status = elements.statusFilter.value
  return state.records.filter((record) => {
    const searchable = [record.id, record.breed, record.species, record.owner, record.pastureName, record.motherId]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return (!query || searchable.includes(query))
      && (!sourceType || record.sourceType === sourceType)
      && (!status || record.status === status)
  })
}

function renderRecords() {
  const records = getFilteredRecords()
  elements.recordSummary.textContent = `显示 ${records.length} 条 / 共 ${state.records.length} 条档案`
  elements.emptyState.hidden = records.length > 0

  elements.recordsBody.innerHTML = records.map((record) => {
    const source = sourceMeta[record.sourceType] || { label: record.sourceType }
    const status = statusMeta[record.status] || { label: record.status }
    const mother = record.motherId
      ? state.records.find((item) => item.id === record.motherId)?.id || record.motherId
      : null
    const relation = record.sourceType === 'born'
      ? `母畜 ${mother || '未记录'}`
      : record.supplier || '供应商未填写'

    return `
      <tr data-record-id="${escapeHtml(record.id)}" tabindex="0">
        <td><span class="animal-id">${escapeHtml(record.id)}</span></td>
        <td><span class="source-badge ${escapeHtml(record.sourceType)}">${escapeHtml(source.label)}</span></td>
        <td><div class="cell-main"><strong>${escapeHtml(record.breed)}</strong><small>${escapeHtml(record.sex === 'female' ? '母' : '公')} · ${escapeHtml(record.species)}</small></div></td>
        <td><div class="cell-main"><strong>${escapeHtml(relation)}</strong><small>${record.sourceType === 'born' ? `出生 ${formatDate(record.birthDate)}` : `购入 ${formatDate(record.purchaseDate)}`}</small></div></td>
        <td><div class="cell-main"><strong>${escapeHtml(record.pastureName)}</strong><small>${escapeHtml(record.owner)}</small></div></td>
        <td><span class="status-badge ${escapeHtml(record.status)}">${escapeHtml(status.label)}</span></td>
        <td>${escapeHtml(formatDateTime(record.lastReportAt))}</td>
      </tr>
    `
  }).join('')
}

function renderInsights() {
  const stats = state.stats || {}
  const total = stats.total || 0
  const sourceRows = [
    { key: 'born', value: stats.born || 0 },
    { key: 'purchased', value: stats.purchased || 0 },
  ]
  elements.sourceChart.innerHTML = sourceRows.map((row) => {
    const meta = sourceMeta[row.key]
    const percent = total ? Math.round((row.value / total) * 100) : 0
    return `
      <div class="source-row">
        <div class="source-row-top"><span>${meta.label}</span><strong>${row.value} <small>头 · ${percent}%</small></strong></div>
        <div class="source-track"><i style="--bar-color:${meta.color};width:${percent}%"></i></div>
      </div>
    `
  }).join('')

  const healthRows = [
    { label: '正常', value: stats.normal || 0, tone: statusMeta.normal.color },
    { label: '需关注', value: stats.attention || 0, tone: statusMeta.attention.color },
    { label: '异常', value: stats.abnormal || 0, tone: statusMeta.abnormal.color },
    { label: '离线', value: stats.offline || 0, tone: statusMeta.offline.color },
  ]
  elements.healthList.innerHTML = healthRows.map((row) => `
    <div class="health-row">
      <span class="health-label"><i style="--tone:${row.tone}"></i>${row.label}</span>
      <strong>${row.value}</strong>
    </div>
  `).join('')
}

async function loadData(options = {}) {
  if (state.loading) return
  state.loading = true
  elements.refreshButton.disabled = true
  elements.refreshButton.textContent = '同步中…'
  try {
    const [records, stats] = await Promise.all([
      requestApi('/api/livestock'),
      requestApi('/api/livestock/stats'),
    ])
    state.records = records
    state.stats = stats
    renderStats()
    renderRecords()
    renderInsights()
    const now = new Date()
    elements.syncTime.textContent = now.toLocaleTimeString('zh-CN', { hour12: false })
    setConnection(true, `最近同步 ${now.toLocaleTimeString('zh-CN', { hour12: false })}`)
    if (!options.silent) showToast('牲畜档案已同步')
  } catch (error) {
    setConnection(false, '')
    elements.recordSummary.textContent = '数据加载失败'
    elements.recordsBody.innerHTML = ''
    elements.emptyState.hidden = false
    elements.emptyState.innerHTML = '<div class="empty-icon">!</div><strong>无法连接后端服务</strong><span>请在 text_backend 目录运行 npm start 后重试。</span>'
    if (!options.silent) showToast(error.message)
  } finally {
    state.loading = false
    elements.refreshButton.disabled = false
    elements.refreshButton.textContent = '刷新数据'
  }
}

function openDetail(recordId) {
  const record = state.records.find((item) => item.id === recordId)
  if (!record) return
  const source = sourceMeta[record.sourceType] || { label: record.sourceType }
  const status = statusMeta[record.status] || { label: record.status }
  const mother = record.motherId ? state.records.find((item) => item.id === record.motherId) : null

  elements.detailTitle.textContent = record.id
  elements.detailSubtitle.textContent = `${record.breed} · ${record.sex === 'female' ? '母畜' : '公畜'} · ${record.pastureName}`
  const sourceDetail = record.sourceType === 'born'
    ? `<div class="detail-item"><label>母亲</label><strong>${escapeHtml(mother ? `${mother.id} · ${mother.breed}` : record.motherId || '未记录')}</strong></div>
       <div class="detail-item"><label>出生日期</label><strong>${escapeHtml(formatDate(record.birthDate))}</strong></div>`
    : `<div class="detail-item"><label>购入日期</label><strong>${escapeHtml(formatDate(record.purchaseDate))}</strong></div>
       <div class="detail-item"><label>供应商</label><strong>${escapeHtml(record.supplier || '未填写')}</strong></div>
       <div class="detail-item"><label>购入价格</label><strong>${record.purchasePrice ? `${formatNumber(record.purchasePrice)} 元` : '未填写'}</strong></div>`

  elements.detailBody.innerHTML = `
    <div class="detail-summary">
      <div><strong>${escapeHtml(record.breed)} · ${escapeHtml(record.id)}</strong><small>档案创建 ${escapeHtml(formatDateTime(record.createdAt))} · 最近更新 ${escapeHtml(formatDateTime(record.updatedAt))}</small></div>
      <span class="status-badge ${escapeHtml(record.status)}">${escapeHtml(status.label)}</span>
    </div>
    <div class="detail-grid">
      <div class="detail-item"><label>来源类型</label><strong>${escapeHtml(source.label)}</strong></div>
      <div class="detail-item"><label>所属牧户</label><strong>${escapeHtml(record.owner)}</strong></div>
      ${sourceDetail}
      <div class="detail-item"><label>所属草场</label><strong>${escapeHtml(record.pastureName)} (${escapeHtml(record.pastureId)})</strong></div>
      <div class="detail-item"><label>体温</label><strong>${record.temperature == null ? '待接入' : `${escapeHtml(record.temperature)} ℃`}</strong></div>
      <div class="detail-item"><label>心率</label><strong>${record.heartRate == null ? '待接入' : `${escapeHtml(record.heartRate)} 次/分`}</strong></div>
      <div class="detail-item"><label>今日步数</label><strong>${record.steps == null ? '待接入' : `${formatNumber(record.steps)} 步`}</strong></div>
      <div class="detail-item"><label>反刍次数</label><strong>${record.rumination == null ? '待接入' : `${escapeHtml(record.rumination)} 次/天`}</strong></div>
    </div>
    <div class="detail-note">${escapeHtml(record.notes || '暂无备注。')}</div>
  `
  elements.detailModal.classList.add('open')
  elements.detailModal.setAttribute('aria-hidden', 'false')
  document.body.style.overflow = 'hidden'
}

function closeDetail() {
  elements.detailModal.classList.remove('open')
  elements.detailModal.setAttribute('aria-hidden', 'true')
  document.body.style.overflow = ''
}

elements.recordsBody.addEventListener('click', (event) => {
  const row = event.target.closest('[data-record-id]')
  if (row) openDetail(row.dataset.recordId)
})
elements.recordsBody.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return
  const row = event.target.closest('[data-record-id]')
  if (row) openDetail(row.dataset.recordId)
})
elements.searchInput.addEventListener('input', renderRecords)
elements.sourceFilter.addEventListener('change', renderRecords)
elements.statusFilter.addEventListener('change', renderRecords)
elements.refreshButton.addEventListener('click', () => loadData())
document.querySelectorAll('[data-close-modal]').forEach((element) => element.addEventListener('click', closeDetail))
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeDetail()
})

loadData({ silent: true })