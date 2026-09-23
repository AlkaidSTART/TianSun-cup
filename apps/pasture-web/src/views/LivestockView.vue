<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { Baby, LoaderCircle, PawPrint, Plus, ShoppingBasket, X } from 'lucide-vue-next'
import AppDateTimePicker from '../components/AppDateTimePicker.vue'
import AppSelect from '../components/AppSelect.vue'
import PageChrome from '../components/PageChrome.vue'
import { navigateToView } from '../utils/navigation'
import {
  livestockApi,
  type LivestockRecord,
  type LivestockSex,
  type LivestockSourceType,
  type LivestockStatus,
  type MotherOption,
} from '../services/livestockApi'

type AnimalType = 'ok' | 'warn' | 'bad' | 'off'
type AnimalFilter = 'all' | AnimalType

interface AddForm {
  id: string
  sourceType: LivestockSourceType
  species: string
  breed: string
  sex: LivestockSex
  eventDate: string
  motherId: string
  pastureId: string
  owner: string
  supplier: string
  purchasePrice: string
  notes: string
}

const breedOptions = ['九龙牦牛', '麦洼牦牛', '藏绵羊', '高原山羊']
const pastureOptions = [
  { id: 'P-A-01', name: '东沟草场' },
  { id: 'P-A-02', name: '北坡草场' },
  { id: 'P-A-03', name: '河谷草场' },
]

const animals = ref<LivestockRecord[]>([])
const mothers = ref<MotherOption[]>([])
const activeFilter = ref<AnimalFilter>('all')
const selected = ref<LivestockRecord | null>(null)
const addOpen = ref(false)
const loading = ref(false)
const saving = ref(false)
const loadError = ref('')
const formError = ref('')
const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout> | undefined

function localDateValue(date = new Date()) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function generateEarTag() {
  const year = new Date().getFullYear()
  const serial = `${Math.floor(10000 + Math.random() * 89999)}`
  return `SC-${year}-${serial}`
}

function createEmptyForm(sourceType: LivestockSourceType = 'purchased'): AddForm {
  return {
    id: generateEarTag(),
    sourceType,
    species: '牦牛',
    breed: '九龙牦牛',
    sex: 'female',
    eventDate: localDateValue(),
    motherId: '',
    pastureId: 'P-A-01',
    owner: '扎西',
    supplier: '',
    purchasePrice: '',
    notes: '',
  }
}

const form = reactive<AddForm>(createEmptyForm())

const stats = computed(() => {
  const total = animals.value.length
  const online = animals.value.filter((item) => item.status !== 'offline').length
  const attention = animals.value.filter((item) => item.status === 'attention').length
  const alerts = animals.value.filter((item) => item.status === 'abnormal' || item.status === 'offline').length
  const normal = animals.value.filter((item) => item.status === 'normal').length
  return { total, online, attention, alerts, normal }
})

const filterCounts = computed(() => ({
  all: animals.value.length,
  ok: animals.value.filter((item) => item.status === 'normal').length,
  warn: animals.value.filter((item) => item.status === 'attention').length,
  bad: animals.value.filter((item) => item.status === 'abnormal').length,
  off: animals.value.filter((item) => item.status === 'offline').length,
}))

const filteredAnimals = computed(() => activeFilter.value === 'all'
  ? animals.value
  : animals.value.filter((item) => animalType(item.status) === activeFilter.value))

const selectedMother = computed(() => selected.value?.motherId
  ? mothers.value.find((item) => item.id === selected.value?.motherId)
  : undefined)
const motherSelectOptions = computed(() => [
  { label: '请选择母畜', value: '' },
  ...mothers.value.map((mother) => ({ label: motherLabel(mother), value: mother.id })),
])

function animalType(status: LivestockStatus): AnimalType {
  if (status === 'normal') return 'ok'
  if (status === 'attention') return 'warn'
  if (status === 'abnormal') return 'bad'
  return 'off'
}

function statusLabel(status: LivestockStatus) {
  if (status === 'normal') return '正常'
  if (status === 'attention') return '需关注'
  if (status === 'abnormal') return '异常'
  return '离线'
}

function sourceLabel(sourceType: LivestockSourceType) {
  return sourceType === 'born' ? '生产' : '购入'
}

function formatNumber(value: number | null) {
  return value == null ? '—' : new Intl.NumberFormat('zh-CN').format(value)
}

function formatDate(value: string | null) {
  if (!value) return '未记录'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

function recordDetail(record: LivestockRecord) {
  if (record.status === 'offline') return `${record.pastureName} · 最后上报 ${formatDate(record.lastReportAt)}`
  const metrics: string[] = []
  if (record.temperature != null) metrics.push(`体温 ${record.temperature}℃`)
  if (record.heartRate != null) metrics.push(`心率 ${record.heartRate} 次/分`)
  if (record.rumination != null) metrics.push(`反刍 ${record.rumination} 次/天`)
  return `${record.pastureName} · ${metrics.join(' · ') || '养殖档案已建立 · 传感器待接入'}`
}

function motherLabel(mother: MotherOption) {
  return `${mother.id} · ${mother.breed} · ${mother.pastureName}`
}

function showMessage(message: string) {
  toast.value = message
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = '' }, 1800)
}

function navigate(view: string) {
  navigateToView(view)
}

async function loadData(options: { silent?: boolean } = {}) {
  if (loading.value) return
  loading.value = true
  loadError.value = ''
  try {
    const [records, motherOptions] = await Promise.all([
      livestockApi.list(),
      livestockApi.mothers(),
    ])
    animals.value = records
    mothers.value = motherOptions
    if (!options.silent) showMessage('牲畜数据已从后台刷新')
  } catch (error) {
    animals.value = []
    mothers.value = []
    loadError.value = error instanceof Error ? error.message : '加载牲畜档案失败'
    if (!options.silent) showMessage(loadError.value)
  } finally {
    loading.value = false
  }
}

function refreshData() {
  void loadData()
}

function resetForm(sourceType: LivestockSourceType = 'purchased') {
  Object.assign(form, createEmptyForm(sourceType))
  formError.value = ''
}

function openAdd() {
  resetForm(form.sourceType)
  addOpen.value = true
}

function closeAdd() {
  if (!saving.value) addOpen.value = false
}

function syncSpecies() {
  if (form.breed.includes('羊')) form.species = form.breed.includes('山羊') ? '山羊' : '绵羊'
  else form.species = '牦牛'
}

function validateForm() {
  if (!form.id.trim()) return '请填写牲畜耳标号'
  if (!/^[A-Za-z0-9-]{4,32}$/.test(form.id.trim())) return '耳标号仅支持字母、数字和短横线'
  if (!form.breed) return '请选择品种'
  if (!form.eventDate) return form.sourceType === 'born' ? '请选择出生日期' : '请选择购入日期'
  if (form.sourceType === 'born' && !form.motherId) return '生产来源必须选择母亲'
  if (form.purchasePrice && Number(form.purchasePrice) < 0) return '购入价格不能小于 0'
  return ''
}

async function submitAnimal() {
  formError.value = validateForm()
  if (formError.value) return

  const pasture = pastureOptions.find((item) => item.id === form.pastureId)
  saving.value = true
  try {
    const created = await livestockApi.create({
      id: form.id.trim().toUpperCase(),
      species: form.species,
      breed: form.breed,
      sex: form.sex,
      sourceType: form.sourceType,
      motherId: form.sourceType === 'born' ? form.motherId : null,
      birthDate: form.sourceType === 'born' ? form.eventDate : null,
      purchaseDate: form.sourceType === 'purchased' ? form.eventDate : null,
      supplier: form.sourceType === 'purchased' ? form.supplier.trim() || null : null,
      purchasePrice: form.sourceType === 'purchased' && form.purchasePrice ? Number(form.purchasePrice) : null,
      pastureId: form.pastureId,
      pastureName: pasture?.name,
      owner: form.owner.trim() || '未分配',
      notes: form.notes.trim(),
    })
    animals.value = [created, ...animals.value]
    if (created.sourceType === 'born' && created.sex === 'female') {
      mothers.value = [{
        id: created.id,
        species: created.species,
        breed: created.breed,
        birthDate: created.birthDate,
        pastureId: created.pastureId,
        pastureName: created.pastureName,
        owner: created.owner,
        status: created.status,
      }, ...mothers.value.filter((item) => item.id !== created.id)]
    }
    addOpen.value = false
    showMessage(`已添加 ${created.id}，数据已同步到后台`)
  } catch (error) {
    formError.value = error instanceof Error ? error.message : '保存失败，请稍后重试'
  } finally {
    saving.value = false
  }
}

function exportList() {
  const rows = filteredAnimals.value
  const header = ['耳标号', '来源', '品种', '性别', '母亲/供应商', '草场', '牧户', '健康状态']
  const csvRows = rows.map((record) => {
    const relation = record.sourceType === 'born' ? record.motherId || '' : record.supplier || ''
    return [
      record.id,
      sourceLabel(record.sourceType),
      record.breed,
      record.sex === 'female' ? '母' : '公',
      relation,
      record.pastureName,
      record.owner,
      statusLabel(record.status),
    ]
  })
  const csv = [header, ...csvRows]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
    .join('\n')
  // #ifdef H5
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `牲畜档案-${localDateValue()}.csv`
  link.click()
  URL.revokeObjectURL(url)
  // #endif
  // #ifndef H5
  uni.setClipboardData({ data: csv })
  // #endif
  showMessage(`已导出 ${rows.length} 条档案`)
}

watch(() => form.sourceType, () => {
  formError.value = ''
  if (form.sourceType === 'purchased') form.motherId = ''
})

onMounted(() => {
  void loadData({ silent: true })
})
</script>

<template>
  <PageChrome active="livestock" @navigate="navigate" @refresh="refreshData">
    <main class="content">
      <div class="page-head">
        <div>
          <div class="eyebrow">LIVESTOCK REGISTRY</div>
          <h1 class="page-title">牲畜</h1>
          <p class="page-description">
            {{ stats.total }} 头在册 · {{ stats.online }} 头在线 ·
            <span :class="{ 'sync-error': loadError }">{{ loadError ? '后台未连接' : '数据已同步后台' }}</span>
          </p>
        </div>
        <div class="page-head-actions">
          <button class="btn btn-secondary export-list-button" type="button" @click="exportList">导出列表</button>
          <button class="btn btn-primary add-animal-button" type="button" @click="openAdd">
            <Plus :size="15" />添加牲畜
          </button>
        </div>
      </div>

      <section class="grid-3">
        <div class="stat-card">
          <div class="stat-label">在册牲畜</div>
          <div class="stat-value mono">{{ stats.total }}<span class="stat-unit"> 头</span></div>
          <span class="status ok">后台同步</span>
        </div>
        <div class="stat-card">
          <div class="stat-label">需要关注</div>
          <div class="stat-value mono">{{ stats.attention }}<span class="stat-unit"> 头</span></div>
          <span class="status warn">观察中</span>
        </div>
        <div class="stat-card">
          <div class="stat-label">异常 / 离线</div>
          <div class="stat-value mono">{{ stats.alerts }}<span class="stat-unit"> 头</span></div>
          <span class="status bad">优先处理</span>
        </div>
      </section>

      <section class="panel section">
        <div class="filter-row">
          <button class="filter" :class="{ active: activeFilter === 'all' }" @click="activeFilter = 'all'">全部 {{ filterCounts.all }}</button>
          <button class="filter" :class="{ active: activeFilter === 'ok' }" @click="activeFilter = 'ok'">正常 {{ filterCounts.ok }}</button>
          <button class="filter" :class="{ active: activeFilter === 'warn' }" @click="activeFilter = 'warn'">需关注 {{ filterCounts.warn }}</button>
          <button class="filter" :class="{ active: activeFilter === 'bad' }" @click="activeFilter = 'bad'">异常 {{ filterCounts.bad }}</button>
          <button class="filter" :class="{ active: activeFilter === 'off' }" @click="activeFilter = 'off'">离线 {{ filterCounts.off }}</button>
        </div>

        <div v-if="loading" class="list-state">
          <LoaderCircle class="spin" :size="20" />
          <span>正在从后台加载牲畜档案…</span>
        </div>
        <div v-else-if="loadError" class="list-state error">
          <strong>后台接口暂不可用</strong>
          <span>{{ loadError }}</span>
          <button class="btn btn-secondary" type="button" @click="refreshData">重新连接</button>
        </div>
        <div v-else-if="filteredAnimals.length === 0" class="list-state">
          <strong>暂无牲畜档案</strong>
          <span>点击“添加牲畜”建立第一份档案。</span>
        </div>
        <div v-else class="list">
          <button v-for="animal in filteredAnimals" :key="animal.id" class="list-row" type="button" @click="selected = animal">
            <span class="icon-disc" :class="animalType(animal.status)"><PawPrint :size="14" /></span>
            <span class="list-main">
              <strong>{{ animal.id }} · {{ animal.breed }}</strong>
              <small>{{ recordDetail(animal) }}</small>
            </span>
            <span class="status" :class="animalType(animal.status)">{{ statusLabel(animal.status) }}</span>
          </button>
        </div>
      </section>
    </main>

    <div class="toast" :class="{ show: toast }">{{ toast }}</div>

    <div class="drawer todo-dialog" :class="{ open: addOpen }" @click.self="closeAdd">
      <div class="drawer-card livestock-form-card">
        <div class="drawer-head">
          <div>
            <h2>添加牲畜</h2>
            <p class="drawer-subtitle">建立档案后自动同步至 Web 管理后台</p>
          </div>
          <button class="close" type="button" aria-label="关闭" @click="closeAdd"><X :size="18" /></button>
        </div>

        <div class="source-switch" role="group" aria-label="牲畜来源">
          <button class="source-option" :class="{ active: form.sourceType === 'purchased' }" type="button" @click="form.sourceType = 'purchased'">
            <ShoppingBasket :size="18" />
            <span><strong>购入</strong><small>登记采购与供应商信息</small></span>
          </button>
          <button class="source-option" :class="{ active: form.sourceType === 'born' }" type="button" @click="form.sourceType = 'born'">
            <Baby :size="18" />
            <span><strong>生产</strong><small>关联母亲建立繁育链条</small></span>
          </button>
        </div>

        <div class="form-section-title">基础档案</div>
        <div class="livestock-form-grid">
          <label class="todo-field todo-field-full">
            <span>耳标号</span>
            <div class="ear-tag-control">
              <input v-model="form.id" type="text" placeholder="例如 SC-2026-00521" maxlength="32" />
              <button type="button" @click="form.id = generateEarTag()">重新生成</button>
            </div>
          </label>
          <label class="todo-field">
            <span>品种</span>
            <AppSelect v-model="form.breed" :options="breedOptions" @change="syncSpecies" />
          </label>
          <label class="todo-field">
            <span>性别</span>
            <AppSelect
              v-model="form.sex"
              :options="[{ label: '母', value: 'female' }, { label: '公', value: 'male' }]"
            />
          </label>
          <label class="todo-field">
            <span>{{ form.sourceType === 'born' ? '出生日期' : '购入日期' }}</span>
            <AppDateTimePicker v-model="form.eventDate" mode="date" />
          </label>
          <label class="todo-field">
            <span>所属草场</span>
            <AppSelect
              v-model="form.pastureId"
              :options="pastureOptions.map((pasture) => ({ label: pasture.name, value: pasture.id }))"
            />
          </label>
          <label class="todo-field todo-field-full">
            <span>所属牧户</span>
            <input v-model="form.owner" type="text" placeholder="例如 扎西" maxlength="30" />
          </label>
        </div>

        <template v-if="form.sourceType === 'born'">
          <div class="form-section-title">繁育信息</div>
          <label class="todo-field mother-field">
            <span>母亲是谁 <em>必选</em></span>
            <AppSelect v-model="form.motherId" :options="motherSelectOptions" />
          </label>
          <p class="field-help">仅展示已建档的适繁母畜，选择后后台会校验母畜档案、性别和月龄。</p>
        </template>

        <template v-else>
          <div class="form-section-title">购入信息</div>
          <div class="livestock-form-grid">
            <label class="todo-field">
              <span>供应商</span>
              <input v-model="form.supplier" type="text" placeholder="选填" maxlength="60" />
            </label>
            <label class="todo-field">
              <span>购入价格</span>
              <div class="price-control"><input v-model="form.purchasePrice" type="number" min="0" placeholder="选填" /><span>元</span></div>
            </label>
          </div>
        </template>

        <label class="todo-field notes-field">
          <span>备注</span>
          <textarea v-model="form.notes" rows="3" placeholder="可填写健康情况、来源批次或其他说明"></textarea>
        </label>

        <p v-if="formError" class="form-error">{{ formError }}</p>

        <div class="drawer-actions livestock-form-actions">
          <button class="btn btn-secondary" type="button" :disabled="saving" @click="closeAdd">取消</button>
          <button class="btn btn-primary" type="button" :disabled="saving" @click="submitAnimal">
            <LoaderCircle v-if="saving" class="spin" :size="15" />
            {{ saving ? '正在同步…' : '保存并同步后台' }}
          </button>
        </div>
      </div>
    </div>

    <div class="drawer" :class="{ open: selected }" @click.self="selected = null">
      <div class="drawer-card">
        <div class="drawer-head">
          <h2>牲畜详情 · {{ selected?.id }}</h2>
          <button class="close" type="button" aria-label="关闭" @click="selected = null"><X :size="18" /></button>
        </div>
        <div v-if="selected" class="detail-grid">
          <div class="detail"><label>健康状态</label><strong>{{ statusLabel(selected.status) }}</strong></div>
          <div class="detail"><label>来源类型</label><strong>{{ sourceLabel(selected.sourceType) }}</strong></div>
          <div v-if="selected.sourceType === 'born'" class="detail"><label>母亲</label><strong class="detail-text">{{ selectedMother?.id || selected.motherId }}</strong></div>
          <div v-else class="detail"><label>供应商</label><strong class="detail-text">{{ selected.supplier || '未填写' }}</strong></div>
          <div class="detail"><label>{{ selected.sourceType === 'born' ? '出生日期' : '购入日期' }}</label><strong class="detail-text">{{ formatDate(selected.sourceType === 'born' ? selected.birthDate : selected.purchaseDate) }}</strong></div>
          <div class="detail"><label>品种 / 性别</label><strong class="detail-text">{{ selected.breed }} · {{ selected.sex === 'female' ? '母' : '公' }}</strong></div>
          <div class="detail"><label>所属草场</label><strong class="detail-text">{{ selected.pastureName }}</strong></div>
          <div class="detail"><label>所属牧户</label><strong class="detail-text">{{ selected.owner }}</strong></div>
          <div class="detail"><label>体温</label><strong>{{ selected.temperature == null ? '待接入' : `${selected.temperature}℃` }}</strong></div>
          <div class="detail"><label>今日步数</label><strong>{{ selected.steps == null ? '待接入' : formatNumber(selected.steps) }}</strong></div>
          <div class="detail"><label>反刍次数</label><strong>{{ selected.rumination == null ? '待接入' : `${selected.rumination} 次/天` }}</strong></div>
          <div v-if="selected.sourceType === 'purchased'" class="detail"><label>购入价格</label><strong class="detail-text">{{ selected.purchasePrice == null ? '未填写' : `${formatNumber(selected.purchasePrice)} 元` }}</strong></div>
        </div>
        <div v-if="selected?.notes" class="detail-note">{{ selected.notes }}</div>
        <div class="drawer-actions">
          <button class="btn btn-primary" type="button" @click="selected && (showMessage(`已在总览地图定位 ${selected.id}`), selected = null)">定位到地图</button>
          <button class="btn btn-secondary" type="button" @click="selected = null">关闭</button>
        </div>
      </div>
    </div>
  </PageChrome>
</template>

<style scoped>
.page-head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
}
.export-list-button {
  border: 1px solid #e2e5e3;
  color: #55635c;
  background: #eef0ef;
}
.export-list-button:hover {
  background: #e5e8e6;
}
.add-animal-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.sync-error {
  color: var(--danger);
}
.stat-unit {
  font: 14px var(--font-body);
  color: var(--muted);
}
.list {
  grid-template-columns: minmax(0, 1fr);
}
.list-row {
  min-width: 0;
}
.list-row > .status {
  margin-right: 6px;
}
.list-state {
  display: grid;
  place-items: center;
  gap: 10px;
  min-height: 230px;
  padding: 36px 20px;
  color: var(--muted);
  text-align: center;
  font-size: 12px;
}
.list-state strong {
  color: var(--fg);
  font-size: 14px;
}
.list-state .spin {
  color: var(--accent);
}
.list-state.error strong {
  color: var(--danger);
}
.livestock-form-card {
  max-height: calc(100svh - 28px);
  overflow-y: auto;
}
.drawer-subtitle {
  margin: 5px 0 0;
  color: var(--muted);
  font-size: 11px;
}
.source-switch {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 18px;
}
.source-option {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 13px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--muted);
  background: #fff;
  text-align: left;
}
.source-option > span {
  min-width: 0;
}
.source-option strong,
.source-option small {
  display: block;
}
.source-option strong {
  color: var(--fg);
  font-size: 13px;
}
.source-option small {
  margin-top: 4px;
  color: var(--muted);
  font-size: 10px;
  line-height: 1.35;
}
.source-option.active {
  border-color: var(--accent);
  color: var(--accent);
  background: color-mix(in oklab, var(--accent) 8%, #fff);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--accent) 10%, transparent);
}
.source-option.active strong {
  color: var(--accent);
}
.form-section-title {
  margin: 19px 0 11px;
  color: var(--fg-2);
  font-size: 12px;
  font-weight: 700;
}
.livestock-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 13px;
}
.ear-tag-control,
.price-control {
  position: relative;
  display: flex;
  min-width: 0;
}
.ear-tag-control input {
  padding-right: 86px;
}
.ear-tag-control button {
  position: absolute;
  top: 50%;
  right: 6px;
  padding: 6px 8px;
  border-radius: 8px;
  color: var(--accent);
  background: color-mix(in oklab, var(--accent) 8%, #fff);
  font-size: 10px;
  transform: translateY(-50%);
}
.price-control input {
  padding-right: 35px;
}
.price-control span {
  position: absolute;
  top: 50%;
  right: 12px;
  color: var(--muted);
  font-size: 11px;
  transform: translateY(-50%);
}
.mother-field span em {
  margin-left: 5px;
  color: var(--danger);
  font-size: 10px;
  font-style: normal;
}
.field-help {
  margin: 8px 2px 0;
  color: var(--muted);
  font-size: 10px;
  line-height: 1.55;
}
.notes-field {
  margin-top: 14px;
}
.notes-field textarea {
  width: 100%;
  resize: vertical;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 10px 11px;
  color: var(--fg);
  background: #fff;
  font: 13px/1.5 var(--font-body);
}
.notes-field textarea:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--accent) 18%, transparent);
}
.form-error {
  margin: 14px 0 0;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  color: var(--danger);
  background: color-mix(in oklab, var(--danger) 8%, #fff);
  font-size: 11px;
  line-height: 1.5;
}
.livestock-form-actions {
  justify-content: flex-end;
}
.livestock-form-actions .btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 112px;
}
.btn:disabled {
  opacity: 0.62;
  cursor: not-allowed;
}
.detail-text {
  font-size: 14px;
}
.detail-note {
  margin-top: 13px;
  padding: 11px 13px;
  border-radius: var(--radius-md);
  color: var(--fg-2);
  background: var(--surface);
  font-size: 11px;
  line-height: 1.6;
}
.spin {
  animation: spin 0.9s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 620px) {
  .page-head-actions {
    width: 100%;
  }
  .page-head-actions .btn {
    flex: 1;
  }
  .livestock-form-grid,
  .source-switch {
    grid-template-columns: 1fr;
  }
  .livestock-form-actions .btn {
    flex: 1;
    min-width: 0;
  }
}
</style>
