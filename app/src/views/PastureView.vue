<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { X } from 'lucide-vue-next'
import PageChrome from '../components/PageChrome.vue'
import { rotationCurrentDate, rotationSchedules } from '../data/rotationSchedule'

interface Zone { id: string; name: string; area: string; quality: string; current: string; pressure: string; coverage: string; tone: 'ok' | 'warn' }
const zones: Zone[] = [
  { id: 'P-A-01', name: '东沟草场', area: '320 亩', quality: '优良', current: '45 / 60 头', pressure: '0.75', coverage: '75%', tone: 'ok' },
  { id: 'P-A-03', name: '河谷草场', area: '280 亩', quality: '优良', current: '38 / 55 头', pressure: '0.69', coverage: '82%', tone: 'ok' },
  { id: 'P-A-02', name: '北坡草场', area: '210 亩', quality: '一般', current: '45 / 48 头', pressure: '0.94', coverage: '58%', tone: 'warn' },
]
const selected = ref<Zone | null>(null)
const toast = ref('')
const tableScroll = ref<HTMLElement | null>(null)
const tableProgressWidth = ref(100)
const tableProgressLeft = ref(0)
const todayRotationSchedules = computed(() => rotationSchedules.value
  .filter((schedule) => schedule.date === rotationCurrentDate.value)
  .sort((left, right) => left.time.localeCompare(right.time)))
const todayRotationSchedule = computed(() => todayRotationSchedules.value[0])
const todaySuggestionTitle = computed(() => todayRotationSchedule.value?.title || '无安排')
const todaySuggestionMeta = computed(() => {
  const schedule = todayRotationSchedule.value
  if (!schedule) return '暂无事件'
  const count = todayRotationSchedules.value.length
  return `${schedule.time} · ${schedule.status}${count > 1 ? ` · 共${count}项` : ''}`
})
const todaySuggestionTone = computed(() => todayRotationSchedule.value?.tone || 'ok')
let toastTimer: ReturnType<typeof setTimeout> | undefined
let tableResizeObserver: ResizeObserver | undefined
function showMessage(message: string) { toast.value = message; if (toastTimer) clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.value = '' }, 1600) }
function syncTableProgress() {
  const scroller = tableScroll.value
  if (!scroller) return
  const maxScroll = Math.max(0, scroller.scrollWidth - scroller.clientWidth)
  tableProgressWidth.value = scroller.scrollWidth > 0
    ? Math.min(100, (scroller.clientWidth / scroller.scrollWidth) * 100)
    : 100
  tableProgressLeft.value = maxScroll > 0
    ? (scroller.scrollLeft / maxScroll) * (100 - tableProgressWidth.value)
    : 0
}
onMounted(async () => {
  await nextTick()
  syncTableProgress()
  if (typeof ResizeObserver !== 'undefined' && tableScroll.value) {
    tableResizeObserver = new ResizeObserver(syncTableProgress)
    tableResizeObserver.observe(tableScroll.value)
    const table = tableScroll.value.firstElementChild
    if (table) tableResizeObserver.observe(table)
  }
  window.addEventListener('resize', syncTableProgress)
})
onBeforeUnmount(() => {
  tableResizeObserver?.disconnect()
  window.removeEventListener('resize', syncTableProgress)
})
function navigate(view: string) { window.location.hash = view }
</script>

<template>
  <PageChrome active="pasture" @navigate="navigate" @refresh="showMessage('草场数据已刷新')">
    <main class="content">
      <div class="page-head"><div><div class="eyebrow">PASTURE ZONES</div><h1>草场</h1><p>3 个管理单元 · 载畜与质量实时监测</p></div><span class="date-chip mono">更新于 14:32</span></div>
      <section class="grid-3"><div class="stat-card"><div class="stat-label">优良草场</div><div class="stat-value mono">2<span style="font-size:14px;color:var(--muted);font-family:var(--font-body)"> / 3</span></div><span class="status ok">可放牧</span></div><div class="stat-card"><div class="stat-label">最高压力指数</div><div class="stat-value mono">0.94</div><span class="status warn">北坡 P-A-02</span></div><div class="stat-card"><div class="stat-label">今日建议</div><div class="stat-value" style="font-size:22px">{{ todaySuggestionTitle }}</div><span class="status" :class="todaySuggestionTone">{{ todaySuggestionMeta }}</span></div></section>
      <section class="panel section"><div class="panel-head"><div><div class="panel-title">分区承载概览</div><div class="panel-meta">点击区域查看草层与牲畜数据</div></div><button class="link-btn" @click="showMessage('已生成北坡草场轮换建议')">生成轮换建议</button></div><div ref="tableScroll" class="table-scroll" @scroll.passive="syncTableProgress"><table class="table pasture-table"><thead><tr><th>区域</th><th>质量</th><th>当前 / 上限</th><th>压力</th><th>覆盖度</th></tr></thead><tbody><tr v-for="zone in zones" :key="zone.id" class="zone" @click="selected = zone"><td><strong>{{ zone.name }}</strong><br><span class="mono" style="font-size:11px;color:var(--meta)">{{ zone.id }} · {{ zone.area }}</span></td><td><span class="status" :class="zone.tone">{{ zone.quality }}</span></td><td class="mono">{{ zone.current }}</td><td><span class="mono">{{ zone.pressure }}</span><div class="meter" style="margin-top:6px"><i :class="{ warn: zone.tone === 'warn' }" :style="{ width: `${Number(zone.pressure) * 100}%` }"></i></div></td><td class="mono">{{ zone.coverage }}</td></tr></tbody></table></div><div class="table-scroll-progress" aria-hidden="true"><i :style="{ width: `${tableProgressWidth}%`, left: `${tableProgressLeft}%` }"></i></div></section>
      <section class="panel section"><div class="panel-head"><div class="panel-title">草层指标</div><span class="panel-meta">P-A-01 东沟</span></div><div class="stack" style="padding:18px"><div><div class="metric-line"><span>植被覆盖度</span><strong class="mono">75%</strong></div><div class="meter" style="margin-top:8px"><i style="width:75%"></i></div></div><div><div class="metric-line"><span>草层高度</span><strong class="mono">8 cm</strong></div><div class="meter" style="margin-top:8px"><i style="width:62%"></i></div></div><div><div class="metric-line"><span>土壤湿度</span><strong class="mono">28%</strong></div><div class="meter" style="margin-top:8px"><i class="warn" style="width:28%"></i></div></div></div></section>
    </main>
    <div class="toast" :class="{ show: toast }">{{ toast }}</div>
    <div class="drawer" :class="{ open: selected }" @click.self="selected = null"><div class="drawer-card"><div class="drawer-head"><h2>草场详情 · {{ selected?.id }}</h2><button class="close" aria-label="关闭" @click="selected = null"><X :size="18" /></button></div><div v-if="selected" class="detail-grid"><div class="detail"><label>区域名称</label><strong>{{ selected.name }}</strong></div><div class="detail"><label>面积</label><strong>{{ selected.area }}</strong></div><div class="detail"><label>质量等级</label><strong>{{ selected.quality }}</strong></div><div class="detail"><label>当前载畜</label><strong>{{ selected.current }}</strong></div><div class="detail"><label>压力指数</label><strong>{{ selected.pressure }}</strong></div><div class="detail"><label>植被覆盖度</label><strong>{{ selected.coverage }}</strong></div></div><div class="drawer-actions"><button class="btn btn-primary" @click="navigate('livestock')">查看牲畜</button><button class="btn btn-secondary" @click="selected = null">关闭</button></div></div></div>
  </PageChrome>
</template>
