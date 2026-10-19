<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  Check,
  CircleAlert,
  TriangleAlert,
  WifiOff,
} from 'lucide-vue-next'
import { completeTodo, loadTodos, todoCurrentDate, todoError, todoItems, todoLoading, type TodoItem } from '../data/todoList'
import PageChrome from '../components/PageChrome.vue'
import PastureScene from '../components/PastureScene.vue'
import { alertApi, type AlertRecord } from '../services/alertApi'
import { pastureApi, type CarryingCapacity, type PasturePressureDay, type PastureZone } from '../services/pastureApi'
import { telemetryApi, type TelemetrySummary } from '../services/telemetryApi'

defineProps<{ active?: boolean }>()

const telemetry = ref<TelemetrySummary | null>(null)
const capacity = ref<CarryingCapacity | null>(null)
const zones = ref<PastureZone[]>([])
const pressureDays = ref<PasturePressureDay[]>([])
const alerts = ref<AlertRecord[]>([])
const dataError = ref('')

const toastText = ref('')
const completingTodoId = ref('')
let toastTimer: ReturnType<typeof setTimeout> | undefined

const todayTodos = computed(() => todoItems.value
  .filter((todo) => todo.date === todoCurrentDate.value)
  .sort((left, right) => left.time.localeCompare(right.time)))
const pendingTodayTodos = computed(() => todayTodos.value.filter((todo) => todo.status !== '已完成'))
const todayTodoMeta = computed(() => {
  if (todoLoading.value) return '加载中'
  if (todoError.value) return '数据库未连接'
  const total = todayTodos.value.length
  if (total === 0) return '今日暂无代办'
  const completedCount = total - pendingTodayTodos.value.length
  if (completedCount === total) return `${total}项 · 已完成`
  const next = pendingTodayTodos.value[0]
  return `${next.time} · ${next.status}${total > 1 ? ` · ${completedCount}/${total}已完成` : ''}`
})
const todayTodoTone = computed(() => pendingTodayTodos.value[0]?.tone || 'ok')

const peakZone = computed(() => zones.value.reduce<PastureZone | null>(
  (highest, zone) => (!highest || zone.pressure > highest.pressure ? zone : highest), null,
))
const pendingAlertCount = computed(() => alerts.value.filter((item) => item.status !== 'resolved').length)
const healthTotal = computed(() => telemetry.value?.total ?? 0)
const pressureBars = computed(() => {
  const days = pressureDays.value.slice(-7)
  const highest = Math.max(0.01, ...days.map((day) => day.averagePressure))
  return days.map((day) => ({
    date: day.date,
    label: day.date.slice(-2),
    heightPercent: Math.round((day.averagePressure / highest) * 100),
    average: day.averagePressure,
  }))
})
const pressureAverage = computed(() => {
  const days = pressureDays.value
  if (days.length === 0) return null
  return Math.round((days.reduce((sum, day) => sum + day.averagePressure, 0) / days.length) * 100) / 100
})

const emit = defineEmits<{ (event: 'navigate', view: string): void }>()

function showMessage(message: string) {
  toastText.value = message
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastText.value = '' }, 1600)
}

async function loadDashboard() {
  try {
    const [telemetrySummary, pastureZones, peak, pressure, openAlerts] = await Promise.all([
      telemetryApi.summary(),
      pastureApi.list(),
      pastureApi.carryingCapacity(),
      pastureApi.pressure(7),
      alertApi.list({ status: 'open', pageSize: 3 }),
    ])
    telemetry.value = telemetrySummary
    zones.value = pastureZones
    capacity.value = peak
    pressureDays.value = pressure
    alerts.value = openAlerts
    dataError.value = ''
  } catch (error) {
    dataError.value = error instanceof Error ? error.message : '总览数据加载失败'
    showMessage(dataError.value)
  }
}

onMounted(async () => {
  await Promise.all([
    loadTodos({ date: todoCurrentDate.value }).catch((error) => {
      showMessage(error instanceof Error ? error.message : '待办事项加载失败')
    }),
    loadDashboard(),
  ])
})

async function markTodoComplete(item: TodoItem) {
  if (item.status === '已完成' || completingTodoId.value) return
  completingTodoId.value = item.id
  try {
    await completeTodo(item.id)
    showMessage(`${item.title}已完成`)
  } catch (error) {
    showMessage(error instanceof Error ? error.message : '待办状态更新失败')
  } finally {
    completingTodoId.value = ''
  }
}

onBeforeUnmount(() => { if (toastTimer) clearTimeout(toastTimer) })
function openAlert(_targetId: string) { emit('navigate', 'alerts') }
</script>

<template>
  <PageChrome active="dashboard">

    <main class="content">
      <div class="welcome">
        <div>
          <div class="eyebrow">LIVE FIELD MONITOR</div>
          <h1 class="page-title">今天的牧场，一眼掌握。</h1>
          <p class="page-description">四川 · 阿坝县 · 智慧放牧示范区　<span>{{ dataError ? '后台未连接' : '刚刚更新' }}</span></p>
        </div>
        <div class="date-chip">{{ telemetry?.date ?? todoCurrentDate }}</div>
      </div>

      <section class="kpi-grid" aria-label="牧场关键指标">
        <article class="kpi">
          <div class="kpi-label">在线牲畜<span>●</span></div>
          <div class="kpi-value">{{ telemetry?.online ?? '—' }}<small> 头</small></div>
          <div class="kpi-foot good">共 {{ healthTotal }} 头在档</div>
        </article>
        <article class="kpi">
          <div class="kpi-label">健康状态<span>◉</span></div>
          <div class="kpi-value">{{ telemetry ? (telemetry.healthRate * 100).toFixed(1) : '—' }}<span>%</span></div>
          <div class="kpi-foot good">正常 {{ telemetry?.normal ?? '—' }} · 关注 {{ telemetry?.attention ?? '—' }} · 异常 {{ telemetry?.abnormal ?? '—' }}</div>
        </article>
        <article class="kpi">
          <div class="kpi-label">草场压力指数<span>⌁</span></div>
          <div class="kpi-value">{{ capacity ? capacity.averagePressure.toFixed(2) : '—' }}</div>
          <div class="kpi-foot" :class="capacity && capacity.overloadedCount > 0 ? 'bad' : 'warn'">
            {{ peakZone ? `${peakZone.name}压力 ${peakZone.pressure.toFixed(2)}` : '暂无分区数据' }}
          </div>
        </article>
        <article class="kpi">
          <div class="kpi-label">今日告警<span>!</span></div>
          <div class="kpi-value">{{ String(pendingAlertCount).padStart(2, '0') }}</div>
          <div class="kpi-foot bad">{{ telemetry?.offline ?? 0 }} 台离线 · 待处理 {{ pendingAlertCount }} 条</div>
        </article>
      </section>

      <div class="workspace">
        <section class="panel">
          <div class="panel-head">
            <div>
              <div class="panel-title">3D 牧场总览</div>
              <div class="panel-meta">卫星地形 · 牲畜模拟演示</div>
            </div>
          </div>
          <div class="map-wrap">
            <PastureScene :active="active !== false" />
          </div>
        </section>

        <aside class="side">
          <div class="side-stack">
            <section class="panel">
              <div class="panel-head">
                <div class="panel-title">需要立即关注</div>
                <button class="link-btn" @click="emit('navigate', 'alerts')">查看全部</button>
              </div>
              <div v-if="alerts.length === 0" class="suggestion">
                <div class="suggestion-title">当前没有待处理告警</div>
                <p class="suggestion-detail">设备与草场压力均在阈值内</p>
              </div>
              <button
                v-for="item in alerts"
                :key="item.id"
                class="alert-item"
                @click="openAlert(item.targetId)"
              >
                <div class="alert-icon" :class="item.severity === 'bad' ? 'red' : item.severity === 'warn' ? 'yellow' : 'gray'">
                  <TriangleAlert v-if="item.severity === 'bad'" :size="13" />
                  <CircleAlert v-else-if="item.severity === 'warn'" :size="13" />
                  <WifiOff v-else :size="13" />
                </div>
                <div class="alert-copy">
                  <strong>{{ item.title }}</strong>
                  <span>{{ item.detail }}</span>
                </div>
                <div class="alert-time">{{ item.statusLabel }}</div>
              </button>
            </section>

            <section class="panel">
              <div class="panel-head">
                <div class="panel-title">今日待办</div>
                <span class="status" :class="todayTodoTone">{{ todayTodoMeta }}</span>
              </div>
              <div v-if="todoLoading" class="suggestion">
                <div class="suggestion-title">加载中...</div>
                <p class="suggestion-detail">正在从数据库读取今日事项</p>
              </div>
              <div v-else-if="todoError" class="suggestion">
                <div class="suggestion-title">数据库未连接</div>
                <p class="suggestion-detail">{{ todoError }}</p>
              </div>
              <div v-else-if="todayTodos.length === 0" class="suggestion">
                <div class="suggestion-title">今日暂无代办</div>
                <p class="suggestion-detail">可在“我的”页面添加今日事项</p>
              </div>
              <div v-else class="today-todo-list">
                <div
                  v-for="(item, index) in todayTodos"
                  :key="item.id"
                  class="suggestion today-todo-item"
                  :class="{ completed: item.status === '已完成' }"
                  :style="index > 0 ? 'border-top:1px solid var(--line)' : ''"
                >
                  <div class="today-todo-copy">
                    <div class="suggestion-title">{{ item.time }} · {{ item.title }}</div>
                    <p class="suggestion-detail">{{ item.status }} · {{ item.detail }}</p>
                  </div>
                  <button
                    class="todo-complete-btn"
                    :class="{ done: item.status === '已完成' }"
                    type="button"
                    :disabled="item.status === '已完成' || completingTodoId === item.id"
                    @click="markTodoComplete(item)"
                  >
                    <Check :size="14" />
                    <span>{{ completingTodoId === item.id ? '保存中' : item.status === '已完成' ? '已完成' : '完成' }}</span>
                  </button>
                </div>
              </div>
            </section>
          </div>

          <section class="panel">
            <div class="panel-head">
              <div class="panel-title">今日健康分布</div>
              <span class="panel-meta">{{ healthTotal }} 头</span>
            </div>
            <div class="health">
              <div class="health-row"><span>正常</span><strong>{{ telemetry?.normal ?? '—' }} <small>{{ telemetry ? `${(telemetry.healthRate * 100).toFixed(1)}%` : '' }}</small></strong></div>
              <div class="bar"><i :style="{ width: `${(telemetry?.healthRate ?? 0) * 100}%` }"></i></div>
              <div class="health-row"><span>需关注</span><strong>{{ telemetry?.attention ?? '—' }} <small>{{ healthTotal ? `${((telemetry?.attention ?? 0) / healthTotal * 100).toFixed(1)}%` : '' }}</small></strong></div>
              <div class="bar"><i class="yellow" :style="{ width: `${healthTotal ? (telemetry?.attention ?? 0) / healthTotal * 100 : 0}%` }"></i></div>
              <div class="health-row"><span>异常</span><strong>{{ telemetry?.abnormal ?? '—' }} <small>{{ healthTotal ? `${((telemetry?.abnormal ?? 0) / healthTotal * 100).toFixed(1)}%` : '' }}</small></strong></div>
              <div class="bar"><i :style="{ width: `${healthTotal ? (telemetry?.abnormal ?? 0) / healthTotal * 100 : 0}%`, background: 'var(--danger)' }"></i></div>
            </div>
          </section>
        </aside>
      </div>

      <div class="section-grid section">
        <section class="panel">
          <div class="panel-head">
            <div>
              <div class="panel-title">草场分区</div>
              <div class="panel-meta">{{ zones.length }} 个管理单元 · 实时承载</div>
            </div>
            <button class="link-btn" @click="emit('navigate', 'pasture')">分区详情</button>
          </div>
          <div v-if="zones.length === 0" class="suggestion">
            <div class="suggestion-title">暂无草场分区数据</div>
          </div>
          <table v-else class="zone-table">
            <thead><tr><th>区域</th><th>质量</th><th>载畜 / 上限</th><th>压力</th></tr></thead>
            <tbody>
              <tr v-for="zone in zones" :key="zone.id">
                <td><div class="zone-name"><i class="zone-swatch" :class="{ warn: zone.tone === 'warn' }"></i>{{ zone.name }} <small>{{ zone.id }}</small></div></td>
                <td><span class="quality" :class="{ warn: zone.tone === 'warn' }">{{ zone.qualityLabel }}</span></td>
                <td>{{ zone.currentLoad }} / {{ zone.capacity }} 头</td>
                <td>{{ zone.pressure.toFixed(2) }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="panel">
          <div class="panel-head">
            <div>
              <div class="panel-title">近 7 日草场压力</div>
              <div class="panel-meta">指数越低越健康</div>
            </div>
            <span class="panel-meta">{{ pressureAverage === null ? '暂无历史' : `均值 ${pressureAverage}` }}</span>
          </div>
          <div v-if="pressureBars.length === 0" class="suggestion">
            <div class="suggestion-title">暂无压力历史</div>
            <p class="suggestion-detail">压力快照从功能上线当天开始记录</p>
          </div>
          <div v-else class="mini-chart">
            <div
              v-for="(bar, index) in pressureBars"
              :key="bar.date"
              class="bar-col"
              :style="{ height: `${Math.max(8, bar.heightPercent)}%`, ...(index === pressureBars.length - 1 ? { background: 'linear-gradient(to top,#f6c76e,#fef3c7)' } : {}) }"
            >
              <b>{{ bar.label }}</b>
            </div>
          </div>
        </section>
      </div>
    </main>

    <div class="toast" :class="{ show: toastText }">{{ toastText }}</div>
  </PageChrome>
</template>
