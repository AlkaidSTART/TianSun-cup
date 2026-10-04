<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppIcon from '../components/AppIcon.vue'
import PageChrome from '../components/PageChrome.vue'
import { navigateToView } from '../utils/navigation'
import { alertApi, type AlertRecord, type AlertRules, type AlertSeverity, type AlertSummary } from '../services/alertApi'

type SeverityFilter = 'all' | AlertSeverity

const alerts = ref<AlertRecord[]>([])
const summary = ref<AlertSummary | null>(null)
const rules = ref<AlertRules | null>(null)
const loading = ref(false)
const loadError = ref('')
const activeFilter = ref<SeverityFilter>('all')
const selected = ref<AlertRecord | null>(null)
const handlingId = ref('')
const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout> | undefined

const filterCounts = computed(() => ({
  all: alerts.value.length,
  bad: alerts.value.filter((item) => item.severity === 'bad').length,
  warn: alerts.value.filter((item) => item.severity === 'warn').length,
  off: alerts.value.filter((item) => item.severity === 'off').length,
}))

const filteredAlerts = computed(() => activeFilter.value === 'all'
  ? alerts.value
  : alerts.value.filter((item) => item.severity === activeFilter.value))

const pendingCount = computed(() => alerts.value.filter((item) => item.status !== 'resolved').length)
const resolvedPercent = computed(() => Math.round((summary.value?.resolvedRate ?? 0) * 100))

function showMessage(message: string) {
  toast.value = message
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = '' }, 1600)
}

function iconName(severity: AlertSeverity) {
  if (severity === 'bad') return 'alert'
  return severity === 'warn' ? 'circleAlert' : 'wifiOff'
}

function shortTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

async function load() {
  if (loading.value) return
  loading.value = true
  loadError.value = ''
  try {
    const [records, progress, thresholds] = await Promise.all([
      alertApi.list({ pageSize: 100 }),
      alertApi.summary(),
      alertApi.rules(),
    ])
    alerts.value = records
    summary.value = progress
    rules.value = thresholds
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '告警数据加载失败'
  } finally {
    loading.value = false
  }
}

async function handle(record: AlertRecord, status: 'handling' | 'resolved') {
  if (handlingId.value) return
  handlingId.value = record.id
  try {
    const updated = await alertApi.handle(record.id, status)
    alerts.value = alerts.value.map((item) => (item.id === updated.id ? updated : item))
    summary.value = await alertApi.summary()
    showMessage(status === 'resolved' ? '已标记为已处理' : '已标记为处理中')
  } catch (error) {
    showMessage(error instanceof Error ? error.message : '告警状态更新失败')
  } finally {
    handlingId.value = ''
  }
}

function markHandled() {
  if (!selected.value) return
  const record = selected.value
  selected.value = null
  void handle(record, 'handling')
}

function focusTarget() {
  if (!selected.value) return
  const target = selected.value.targetId
  selected.value = null
  showMessage(`已定位 ${target}`)
}

async function locateFromRow(record: AlertRecord) {
  showMessage(`已定位 ${record.targetId}`)
}

onMounted(load)
</script>

<template>
  <PageChrome active="alerts" @refresh="load">
    <main class="content">
      <div class="page-head">
        <div>
          <div class="eyebrow">ALERT CENTER</div>
          <h1 class="page-title">告警</h1>
          <p class="page-description">需要优先处理的异常与设备状态</p>
        </div>
        <span class="date-chip mono">{{ pendingCount }} 条待处理</span>
      </div>

      <section class="panel">
        <div v-if="loading" class="list-state">
          <span>正在加载告警...</span>
        </div>
        <div v-else-if="loadError" class="list-state error">
          <span>{{ loadError }}</span>
          <button class="btn btn-secondary" type="button" @click="load">重新连接</button>
        </div>
        <template v-else>
          <div class="filter-row">
            <button class="filter" :class="{ active: activeFilter === 'all' }" @click="activeFilter = 'all'">全部 {{ String(filterCounts.all).padStart(2, '0') }}</button>
            <button class="filter" :class="{ active: activeFilter === 'bad' }" @click="activeFilter = 'bad'">异常 {{ String(filterCounts.bad).padStart(2, '0') }}</button>
            <button class="filter" :class="{ active: activeFilter === 'warn' }" @click="activeFilter = 'warn'">需关注 {{ String(filterCounts.warn).padStart(2, '0') }}</button>
            <button class="filter" :class="{ active: activeFilter === 'off' }" @click="activeFilter = 'off'">离线 {{ String(filterCounts.off).padStart(2, '0') }}</button>
          </div>
          <div v-if="filteredAlerts.length === 0" class="list-state">
            <span>暂无该类型的告警</span>
          </div>
          <div v-else class="list">
            <button v-for="item in filteredAlerts" :key="item.id" class="list-row" @click="selected = item">
              <span class="icon-disc" :class="item.severity"><AppIcon :name="iconName(item.severity)" :size="13" /></span>
              <span class="list-main">
                <strong>{{ item.title }}</strong>
                <small>{{ item.detail }}</small>
              </span>
              <span class="list-time">{{ shortTime(item.triggeredAt) }}</span>
            </button>
          </div>
        </template>
      </section>

      <div class="grid-2 section">
        <section class="panel">
          <div class="panel-head">
            <div>
              <div class="panel-title">处理进度</div>
              <div class="panel-meta">今日告警闭环</div>
            </div>
            <span class="mono">{{ resolvedPercent }}%</span>
          </div>
          <div style="padding:18px">
            <div class="stat-value">{{ summary?.resolved ?? 0 }}<span style="font-size:14px;color:var(--muted);font-family:var(--font-body)"> / {{ summary?.total ?? 0 }} 已响应</span></div>
            <div class="meter" style="margin-top:14px"><i :style="{ width: `${resolvedPercent}%` }"></i></div>
            <p style="margin:12px 0 0;color:var(--muted);font-size:12px">
              异常体温需要现场复核，其余已通知值班人员。
            </p>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <div class="panel-title">告警规则</div>
            <span class="panel-meta">当前生效</span>
          </div>
          <table class="table rules-table">
            <tbody>
              <tr><td>体温</td><td class="mono">&gt; {{ rules?.temperatureAbove ?? '—' }}{{ rules?.units.temperature ?? '' }}</td><td><span class="status bad">高优先级</span></td></tr>
              <tr><td>压力指数</td><td class="mono">&gt; {{ rules?.pressureAbove ?? '—' }}</td><td><span class="status warn">需关注</span></td></tr>
              <tr><td>设备上报</td><td class="mono">&gt; {{ rules?.reportTimeoutMinutes ?? '—' }} {{ rules?.units.reportTimeoutMinutes ?? '' }}</td><td><span class="status off">离线</span></td></tr>
            </tbody>
          </table>
        </section>
      </div>
    </main>

    <div class="toast" :class="{ show: toast }">{{ toast }}</div>

    <div class="drawer" :class="{ open: selected }" @click.self="selected = null">
      <div class="drawer-card">
        <div class="drawer-head">
          <h2>告警详情 · {{ selected?.targetId }}</h2>
          <button class="close" aria-label="关闭" @click="selected = null"><AppIcon name="close" :size="18" /></button>
        </div>
        <div v-if="selected" class="detail-grid">
          <div class="detail"><label>触发对象</label><strong>{{ selected.targetId }}</strong></div>
          <div class="detail"><label>触发时间</label><strong>{{ shortTime(selected.triggeredAt) }}</strong></div>
          <div class="detail"><label>当前状态</label><strong>{{ selected.statusLabel }}</strong></div>
          <div class="detail"><label>建议动作</label><strong style="font-size:14px">{{ selected.status === 'resolved' ? '已闭环' : '现场复核' }}</strong></div>
        </div>
        <div class="drawer-actions">
          <button class="btn btn-primary" @click="focusTarget">定位到地图</button>
          <button class="btn btn-secondary" :disabled="selected?.status === 'resolved' || handlingId !== ''" @click="markHandled">标记已处理</button>
        </div>
      </div>
    </div>
  </PageChrome>
</template>

<style scoped>
.list-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 130px;
  padding: 28px 20px;
  color: var(--muted);
  text-align: center;
  font-size: 12px;
}

.list-state.error {
  color: var(--danger);
}

.drawer-actions button:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>
