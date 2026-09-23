<script setup lang="ts">
import { ref } from 'vue'
import { X } from 'lucide-vue-next'
import PageChrome from '../components/PageChrome.vue'
import { navigateToView } from '../utils/navigation'

interface Zone {
  id: string
  name: string
  area: string
  quality: string
  current: string
  pressure: string
  coverage: string
  tone: 'ok' | 'warn'
}

const zones: Zone[] = [
  { id: 'P-A-01', name: '东沟草场', area: '320 亩', quality: '优良', current: '45 / 60 头', pressure: '0.75', coverage: '75%', tone: 'ok' },
  { id: 'P-A-03', name: '河谷草场', area: '280 亩', quality: '优良', current: '38 / 55 头', pressure: '0.69', coverage: '82%', tone: 'ok' },
  { id: 'P-A-02', name: '北坡草场', area: '210 亩', quality: '一般', current: '45 / 48 头', pressure: '0.94', coverage: '58%', tone: 'warn' },
]

const selected = ref<Zone | null>(null)
const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout> | undefined

function showMessage(message: string) {
  toast.value = message
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.value = ''
  }, 1600)
}
</script>

<template>
  <PageChrome active="pasture" @refresh="showMessage('草场数据已刷新')">
    <view class="content">
      <view class="page-head">
        <view>
          <view class="eyebrow">PASTURE ZONES</view>
          <view class="page-title">草场</view>
          <view class="page-description">3 个管理单元 · 载畜与质量实时监测</view>
        </view>
        <text class="date-chip mono">更新于 14:32</text>
      </view>

      <view class="grid-2-cards">
        <view class="stat-card">
          <view class="stat-label">优良草场</view>
          <view class="stat-value mono">2<text class="stat-unit"> / 3</text></view>
          <text class="status ok">可放牧</text>
        </view>
        <view class="stat-card">
          <view class="stat-label">最高压力指数</view>
          <view class="stat-value mono">0.94</view>
          <text class="status warn">北坡 P-A-02</text>
        </view>
      </view>

      <view class="panel section">
        <view class="panel-head">
          <view>
            <view class="panel-title">分区承载概览</view>
            <view class="panel-meta">点击区域查看草层与牲畜数据</view>
          </view>
        </view>
        <view class="zone-list">
          <view
            v-for="zone in zones"
            :key="zone.id"
            class="zone-row"
            @click="selected = zone"
          >
            <view class="zone-main">
              <text class="zone-name">{{ zone.name }}</text>
              <text class="zone-meta">{{ zone.id }} · {{ zone.area }}</text>
            </view>
            <text class="status" :class="zone.tone">{{ zone.quality }}</text>
            <view class="zone-load">
              <text class="zone-value">{{ zone.current }}</text>
              <view class="meter"><i :class="{ warn: zone.tone === 'warn' }" :style="{ width: `${Number(zone.pressure) * 100}%` }"></i></view>
            </view>
            <text class="zone-coverage">{{ zone.coverage }}</text>
          </view>
        </view>
      </view>

      <view class="panel section">
        <view class="panel-head">
          <view class="panel-title">草层指标</view>
          <text class="panel-meta">P-A-01 东沟</text>
        </view>
        <view class="stack pasture-metrics">
          <view>
            <view class="metric-line"><text>植被覆盖度</text><text class="mono">75%</text></view>
            <view class="meter"><i style="width:75%"></i></view>
          </view>
          <view>
            <view class="metric-line"><text>草层高度</text><text class="mono">8 cm</text></view>
            <view class="meter"><i style="width:62%"></i></view>
          </view>
          <view>
            <view class="metric-line"><text>土壤湿度</text><text class="mono">28%</text></view>
            <view class="meter"><i class="warn" style="width:28%"></i></view>
          </view>
        </view>
      </view>
    </view>

    <view class="toast" :class="{ show: toast }">{{ toast }}</view>

    <view v-if="selected" class="drawer open pasture-drawer" @click.self="selected = null">
      <view class="drawer-card">
        <view class="drawer-head">
          <text class="drawer-title">草场详情 · {{ selected.id }}</text>
          <button class="close" aria-label="关闭" @click="selected = null"><X :size="18" /></button>
        </view>
        <view class="detail-grid">
          <view class="detail"><text class="detail-label">区域名称</text><text class="detail-value">{{ selected.name }}</text></view>
          <view class="detail"><text class="detail-label">面积</text><text class="detail-value">{{ selected.area }}</text></view>
          <view class="detail"><text class="detail-label">质量等级</text><text class="detail-value">{{ selected.quality }}</text></view>
          <view class="detail"><text class="detail-label">当前载畜</text><text class="detail-value">{{ selected.current }}</text></view>
          <view class="detail"><text class="detail-label">压力指数</text><text class="detail-value">{{ selected.pressure }}</text></view>
          <view class="detail"><text class="detail-label">植被覆盖度</text><text class="detail-value">{{ selected.coverage }}</text></view>
        </view>
        <view class="drawer-actions">
          <button class="btn btn-primary" @click="navigateToView('livestock')">查看牲畜</button>
          <button class="btn btn-secondary" @click="selected = null">关闭</button>
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

.zone-list {
  display: grid;
}

.zone-row {
  display: grid;
  grid-template-columns: minmax(130px, 1.4fr) 70px minmax(130px, 1fr) 70px;
  gap: 12px;
  align-items: center;
  min-width: 560px;
  padding: 14px 18px;
  border-top: 1px solid var(--border-soft);
}

.zone-row:first-child {
  border-top: 0;
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
    grid-template-columns: minmax(130px, 1.4fr) 70px 130px 70px;
  }
}
</style>
