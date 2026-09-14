<script setup lang="ts">
import { computed, ref } from 'vue'
import { PawPrint, X } from 'lucide-vue-next'
import PageChrome from '../components/PageChrome.vue'

type AnimalType = 'ok' | 'warn' | 'bad' | 'off'
interface AnimalRecord { id: string; type: AnimalType; title: string; detail: string; status: string; temperature: string; steps: string; rumination: string }
const animals: AnimalRecord[] = [
  { id: 'SC-2026-00342', type: 'ok', title: 'SC-2026-00342 · 九龙牦牛', detail: '东沟草场 P-A-01 · 体温 39.2℃ · 心率 62 次/分', status: '正常', temperature: '39.2℃', steps: '2,340', rumination: '42' },
  { id: 'SC-2026-00107', type: 'warn', title: 'SC-2026-00107 · 九龙牦牛', detail: '东沟草场 P-A-01 · 体温 39.8℃ · 反刍 36 次/天', status: '需关注', temperature: '39.8℃', steps: '1,860', rumination: '36' },
  { id: 'SC-2026-00286', type: 'bad', title: 'SC-2026-00286 · 九龙牦牛', detail: '河谷草场 P-A-03 · 体温 40.7℃ · 2 分钟前上报', status: '异常', temperature: '40.7℃', steps: '1,120', rumination: '18' },
  { id: 'SC-2026-00220', type: 'off', title: 'SC-2026-00220 · 九龙牦牛', detail: '东沟草场 P-A-01 · 最后上报 32 分钟前', status: '离线', temperature: '—', steps: '—', rumination: '—' },
]
const activeFilter = ref<'all' | AnimalType>('all')
const selected = ref<AnimalRecord | null>(null)
const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout> | undefined
const filteredAnimals = computed(() => activeFilter.value === 'all' ? animals : animals.filter((item) => item.type === activeFilter.value))
function showMessage(message: string) { toast.value = message; if (toastTimer) clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.value = '' }, 1600) }
function navigate(view: string) { window.location.hash = view }
</script>

<template>
  <PageChrome active="livestock" @navigate="navigate" @refresh="showMessage('牲畜数据已刷新')">
    <main class="content">
      <div class="page-head"><div><div class="eyebrow">LIVESTOCK REGISTRY</div><h1>牲畜</h1><p>128 头在线 · 按健康状态快速筛选</p></div><button class="btn btn-primary" @click="showMessage('列表已准备导出')">导出列表</button></div>
      <section class="grid-3"><div class="stat-card"><div class="stat-label">在线牲畜</div><div class="stat-value mono">128<span style="font-size:14px;color:var(--muted);font-family:var(--font-body)"> 头</span></div><span class="status ok">实时</span></div><div class="stat-card"><div class="stat-label">需要关注</div><div class="stat-value mono">5<span style="font-size:14px;color:var(--muted);font-family:var(--font-body)"> 头</span></div><span class="status warn">观察中</span></div><div class="stat-card"><div class="stat-label">异常 / 离线</div><div class="stat-value mono">3<span style="font-size:14px;color:var(--muted);font-family:var(--font-body)"> 头</span></div><span class="status bad">优先处理</span></div></section>
      <section class="panel section"><div class="filter-row"><button class="filter" :class="{ active: activeFilter === 'all' }" @click="activeFilter = 'all'">全部 128</button><button class="filter" :class="{ active: activeFilter === 'ok' }" @click="activeFilter = 'ok'">正常 121</button><button class="filter" :class="{ active: activeFilter === 'warn' }" @click="activeFilter = 'warn'">需关注 5</button><button class="filter" :class="{ active: activeFilter === 'bad' }" @click="activeFilter = 'bad'">异常 2</button><button class="filter" :class="{ active: activeFilter === 'off' }" @click="activeFilter = 'off'">离线 1</button></div><div class="list"><button v-for="animal in filteredAnimals" :key="animal.id" class="list-row" @click="selected = animal"><span class="icon-disc" :class="animal.type"><PawPrint :size="14" /></span><span class="list-main"><strong>{{ animal.title }}</strong><small>{{ animal.detail }}</small></span><span class="status" :class="animal.type">{{ animal.status }}</span></button></div></section>
    </main>
    <div class="toast" :class="{ show: toast }">{{ toast }}</div>
    <div class="drawer" :class="{ open: selected }" @click.self="selected = null"><div class="drawer-card"><div class="drawer-head"><h2>牲畜详情 · {{ selected?.id }}</h2><button class="close" aria-label="关闭" @click="selected = null"><X :size="18" /></button></div><div v-if="selected" class="detail-grid"><div class="detail"><label>健康状态</label><strong>{{ selected.status }}</strong></div><div class="detail"><label>体温</label><strong>{{ selected.temperature }}</strong></div><div class="detail"><label>今日步数</label><strong>{{ selected.steps }}</strong></div><div class="detail"><label>反刍次数</label><strong>{{ selected.rumination }} <small>次/天</small></strong></div><div class="detail"><label>品种</label><strong style="font-size:14px">九龙牦牛</strong></div><div class="detail"><label>所属牧户</label><strong style="font-size:14px">扎西</strong></div></div><div class="drawer-actions"><button class="btn btn-primary" @click="selected && (showMessage(`已在总览地图定位 ${selected.id}`), selected = null)">定位到地图</button><button class="btn btn-secondary" @click="showMessage('健康趋势将在下一版开放')">查看健康趋势</button></div></div></div>
  </PageChrome>
</template>
