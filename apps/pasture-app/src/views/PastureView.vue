<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { X } from 'lucide-vue-next'
import PageChrome from '../components/PageChrome.vue'
import { navigateToView } from '../utils/navigation'
import { pastureApi, type PastureDetail, type PastureZone } from '../services/pastureApi'

const zones = ref<PastureZone[]>([])
const loading = ref(false)
const loadError = ref('')
const updatedAt = ref('')
const selected = ref<PastureZone | null>(null)
const detail = ref<PastureDetail | null>(null)
const detailLoading = ref(false)
const detailError = ref('')
const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout> | undefined

const excellentCount = computed(() => zones.value.filter((zone) => zone.quality === 'excellent').length)
const peak = computed(() => zones.value.reduce<PastureZone | null>(
  (highest, zone) => (!highest || zone.pressure > highest.pressure ? zone : highest), null,
))

function formatLoad(zone: PastureZone) {
  return `${zone.currentLoad} / ${zone.capacity} 头`
}

function formatPercent(value: number | null) {
  return value === null ? '—' : `${Math.round(value * 100)}%`
}

function showMessage(message: string) {
  toast.value = message
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.value = ''
  }, 1600)
}

async function load() {
  if (loading.value) return
  loading.value = true
  loadError.value = ''
  try {
    zones.value = await pastureApi.list()
    updatedAt.value = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '草场数据加载失败'
  } finally {
    loading.value = false
  }
}

async function openZone(zone: PastureZone) {
  selected.value = zone
  detail.value = null
  detailError.value = ''
  detailLoading.value = true
  try {
    detail.value = await pastureApi.detail(zone.id)
  } catch (error) {
    detailError.value = error instanceof Error ? error.message : '草场详情加载失败'
  } finally {
    detailLoading.value = false
  }
}

function closeZone() {
  selected.value = null
  detail.value = null
  detailError.value = ''
}

onMounted(load)
</script>

<template>
  <PageChrome active="pasture">
    <view class="content">
      <view class="page-head">
        <view>
          <view class="eyebrow">PASTURE ZONES</view>
          <view class="page-title">草场</view>
          <view class="page-description">{{ zones.length }} 个管理单元 · 载畜与质量实时监测</view>
        </view>
        <text class="date-chip mono">{{ updatedAt ? `更新于 ${updatedAt}` : '尚未同步' }}</text>
      </view>

      <view class="grid-2-cards">
        <view class="stat-card">
          <view class="stat-label">优良草场</view>
          <view class="stat-value mono">{{ excellentCount }}<text class="stat-unit"> / {{ zones.length }}</text></view>
          <text class="status ok">可放牧</text>
        </view>
        <view class="stat-card">
          <view class="stat-label">最高压力指数</view>
          <view class="stat-value mono">{{ peak ? peak.pressure.toFixed(2) : '—' }}</view>
          <text v-if="peak" class="status" :class="peak.tone">{{ peak.name }} {{ peak.id }}</text>
        </view>
      </view>

      <view class="panel section">
        <view class="panel-head">
          <view>
            <view class="panel-title">分区承载概览</view>
            <view class="panel-meta">点击区域查看草层与牲畜数据</view>
          </view>
        </view>
        <view v-if="loading" class="list-state">
          <text>正在加载草场数据...</text>
        </view>
        <view v-else-if="loadError" class="list-state error">
          <text>{{ loadError }}</text>
        </view>
        <view v-else-if="zones.length === 0" class="list-state">
          <text>暂无草场分区</text>
        </view>
        <view v-else class="zone-list">
          <view
            v-for="zone in zones"
            :key="zone.id"
            class="zone-row"
            @click="openZone(zone)"
          >
            <view class="zone-main">
              <view class="zone-heading">
                <text class="zone-name">{{ zone.name }}</text>
                <text class="status" :class="zone.tone">{{ zone.qualityLabel }}</text>
              </view>
              <text class="zone-meta">{{ zone.id }} · {{ zone.areaSize }} 亩</text>
            </view>
            <view class="zone-load">
              <text class="zone-value">{{ formatLoad(zone) }}</text>
              <view class="meter"><i :class="{ warn: zone.tone === 'warn' }" :style="{ width: `${Math.min(100, zone.pressure * 100)}%` }"></i></view>
            </view>
            <text class="zone-coverage">{{ formatPercent(zone.coverage) }}</text>
          </view>
        </view>
      </view>

      <view class="panel section">
        <view class="panel-head">
          <view class="panel-title">草层指标</view>
          <text class="panel-meta">{{ selected ? `${selected.id} ${selected.name.replace('草场', '')}` : '选择分区查看' }}</text>
        </view>
        <view v-if="detailLoading" class="list-state">
          <text>正在读取草层指标...</text>
        </view>
        <view v-else-if="detailError" class="list-state error">
          <text>{{ detailError }}</text>
        </view>
        <view v-else-if="!detail" class="list-state">
          <text>点击上方分区查看该草场的草层指标</text>
        </view>
        <view v-else class="stack pasture-metrics">
          <view>
            <view class="metric-line"><text>植被覆盖度</text><text class="mono">{{ formatPercent(detail.metrics.coverage) }}</text></view>
            <view class="meter"><i :style="{ width: `${Math.min(100, detail.metrics.coverage * 100)}%` }"></i></view>
          </view>
          <view>
            <view class="metric-line"><text>草层高度</text><text class="mono">{{ detail.metrics.grassHeight === null ? '—' : `${detail.metrics.grassHeight} cm` }}</text></view>
            <view class="meter"><i :style="{ width: `${Math.min(100, ((detail.metrics.grassHeight ?? 0) / 30) * 100)}%` }"></i></view>
          </view>
          <view>
            <view class="metric-line"><text>土壤湿度</text><text class="mono">{{ formatPercent(detail.metrics.soilMoisture) }}</text></view>
            <view class="meter"><i class="warn" :style="{ width: `${Math.min(100, (detail.metrics.soilMoisture ?? 0) * 100)}%` }"></i></view>
          </view>
        </view>
      </view>
    </view>

    <view class="toast" :class="{ show: toast }">{{ toast }}</view>

    <view v-if="selected" class="drawer open pasture-drawer" @click.self="closeZone">
      <view class="drawer-card">
        <view class="drawer-head">
          <text class="drawer-title">草场详情 · {{ selected.id }}</text>
          <button class="close" aria-label="关闭" @click="closeZone"><X :size="18" /></button>
        </view>
        <view class="detail-grid">
          <view class="detail"><text class="detail-label">区域名称</text><text class="detail-value">{{ selected.name }}</text></view>
          <view class="detail"><text class="detail-label">面积</text><text class="detail-value">{{ selected.areaSize }} 亩</text></view>
          <view class="detail"><text class="detail-label">质量等级</text><text class="detail-value">{{ selected.qualityLabel }}</text></view>
          <view class="detail"><text class="detail-label">当前载畜</text><text class="detail-value">{{ formatLoad(selected) }}</text></view>
          <view class="detail"><text class="detail-label">压力指数</text><text class="detail-value">{{ selected.pressure.toFixed(2) }}</text></view>
          <view class="detail"><text class="detail-label">植被覆盖度</text><text class="detail-value">{{ formatPercent(selected.coverage) }}</text></view>
        </view>
        <view class="drawer-actions">
          <button class="btn btn-primary" @click="navigateToView('livestock')">查看牲畜</button>
          <button class="btn btn-secondary" @click="closeZone">关闭</button>
        </view>
      </view>
    </view>
  </PageChrome>
</template>

<style scoped>
.page-title {
  margin: 8px 0 5px;
  font: 600 32px/1.1 var(--font-display);
}

.page-description {
  color: var(--muted);
  font-size: 14px;
}

.stat-unit {
  color: var(--muted);
  font: 14px var(--font-body);
}

/* 宽屏列布局保留横向滚动兜底；移动端在下方媒体查询中压缩列宽，使整行适配屏幕 */
.zone-list {
  display: grid;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}
.zone-list::-webkit-scrollbar {
  display: none;
}

.zone-row {
  display: grid;
  grid-template-columns: minmax(200px, 1.25fr) minmax(170px, 1fr) 70px;
  gap: 12px;
  align-items: center;
  min-width: 560px;
  padding: 14px 18px;
  border-top: 1px solid var(--border-soft);
}

.zone-row:first-child {
  border-top: 0;
}

.zone-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.zone-heading .status {
  flex: none;
}
.zone-main {
  min-width: 0;
}

.zone-name,
.zone-meta,
.zone-value,
.zone-coverage {
  display: block;
}

.zone-name {
  font-size: 14px;
  font-weight: 700;
}

.zone-meta {
  margin-top: 4px;
  color: var(--meta);
  font: 11px var(--font-mono);
}

.zone-load {
  min-width: 0;
}

.zone-value,
.zone-coverage {
  font-family: var(--font-mono);
  font-size: 12px;
}

.pasture-metrics {
  padding: 18px;
}

.list-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 130px;
  padding: 28px 20px;
  color: var(--muted);
  text-align: center;
  font-size: 12px;
}

.list-state.error {
  color: var(--danger);
}

.drawer-title {
  font-size: 18px;
  font-weight: 700;
}

.detail-label,
.detail-value {
  display: block;
}

.detail-label {
  margin-bottom: 4px;
  color: var(--muted);
  font-size: 10px;
}

.detail-value {
  font: 600 17px var(--font-display);
}

@media (max-width: 620px) {
  .zone-row {
    width: 100%;
    min-width: 0;
    grid-template-columns: minmax(118px, 1fr) minmax(80px, 100px) 36px;
    gap: 6px;
    padding: 12px 10px;
  }
}
</style>
