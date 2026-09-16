<script setup lang="ts">
import { computed, ref } from 'vue'
import { CircleAlert, TriangleAlert, WifiOff, X } from 'lucide-vue-next'
import PageChrome from '../components/PageChrome.vue'

type AlertType = 'bad' | 'warn' | 'off'
interface AlertRecord { id: string; type: AlertType; title: string; detail: string; time: string; status: string }

const alerts: AlertRecord[] = [
  { id: 'SC-2026-00286', type: 'bad', title: 'SC-2026-00286 · 体温偏高', detail: '40.7℃ · 河谷草场 P-A-03 · 已持续 2 分钟', time: '14:30', status: '异常' },
  { id: 'P-A-02', type: 'warn', title: '北坡草场 · 载畜压力偏高', detail: '压力指数 0.94 · 建议明日 06:00 前轮换', time: '14:14', status: '需关注' },
  { id: 'SC-2026-00220', type: 'off', title: 'SC-2026-00220 · 设备离线', detail: '最后上报 32 分钟前 · 东沟草场 P-A-01', time: '14:00', status: '离线' },
]
const activeFilter = ref<'all' | AlertType>('all')
const selected = ref<AlertRecord | null>(null)
const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout> | undefined
const filteredAlerts = computed(() => activeFilter.value === 'all' ? alerts : alerts.filter((item) => item.type === activeFilter.value))

function showMessage(message: string) { toast.value = message; if (toastTimer) clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.value = '' }, 1600) }
function navigate(view: string) { window.location.hash = view }
</script>

<template>
  <PageChrome active="alerts" @navigate="navigate" @refresh="showMessage('告警数据已刷新')">
    <main class="content">
      <div class="page-head"><div><div class="eyebrow">ALERT CENTER</div><h1>告警</h1><p>需要优先处理的异常与设备状态</p></div><span class="date-chip mono">3 条待处理</span></div>
      <section class="panel"><div class="filter-row"><button class="filter" :class="{ active: activeFilter === 'all' }" @click="activeFilter = 'all'">全部 03</button><button class="filter" :class="{ active: activeFilter === 'bad' }" @click="activeFilter = 'bad'">异常 01</button><button class="filter" :class="{ active: activeFilter === 'warn' }" @click="activeFilter = 'warn'">需关注 01</button><button class="filter" :class="{ active: activeFilter === 'off' }" @click="activeFilter = 'off'">离线 01</button></div><div class="list"><button v-for="item in filteredAlerts" :key="item.id" class="list-row" @click="selected = item"><span class="icon-disc" :class="item.type"><TriangleAlert v-if="item.type === 'bad'" :size="13" /><CircleAlert v-else-if="item.type === 'warn'" :size="13" /><WifiOff v-else :size="13" /></span><span class="list-main"><strong>{{ item.title }}</strong><small>{{ item.detail }}</small></span><span class="list-time">{{ item.time }}</span></button></div></section>
      <div class="grid-2 section"><section class="panel"><div class="panel-head"><div><div class="panel-title">处理进度</div><div class="panel-meta">今日告警闭环</div></div><span class="mono">67%</span></div><div style="padding:18px"><div class="stat-value">2<span style="font-size:14px;color:var(--muted);font-family:var(--font-body)"> / 3 已响应</span></div><div class="meter" style="margin-top:14px"><i style="width:67%"></i></div><p style="margin:12px 0 0;color:var(--muted);font-size:12px">异常体温需要现场复核，其余已通知值班人员。</p></div></section><section class="panel"><div class="panel-head"><div class="panel-title">告警规则</div><span class="panel-meta">当前生效</span></div><table class="table rules-table"><tbody><tr><td>体温</td><td class="mono">&gt; 40.0℃</td><td><span class="status bad">高优先级</span></td></tr><tr><td>压力指数</td><td class="mono">&gt; 0.80</td><td><span class="status warn">需关注</span></td></tr><tr><td>设备上报</td><td class="mono">&gt; 30 min</td><td><span class="status off">离线</span></td></tr></tbody></table></section></div>
    </main>
    <div class="toast" :class="{ show: toast }">{{ toast }}</div>
    <div class="drawer" :class="{ open: selected }" @click.self="selected = null"><div class="drawer-card"><div class="drawer-head"><h2>告警详情 · {{ selected?.id }}</h2><button class="close" aria-label="关闭" @click="selected = null"><X :size="18" /></button></div><div v-if="selected" class="detail-grid"><div class="detail"><label>触发对象</label><strong>{{ selected.id }}</strong></div><div class="detail"><label>触发时间</label><strong>{{ selected.time }}</strong></div><div class="detail"><label>当前状态</label><strong>{{ selected.status }}</strong></div><div class="detail"><label>建议动作</label><strong style="font-size:14px">现场复核</strong></div></div><div class="drawer-actions"><button class="btn btn-primary" @click="selected && (showMessage(`已定位 ${selected.id}`), selected = null)">定位到地图</button><button class="btn btn-secondary" @click="selected = null; showMessage('已标记为处理中')">标记已处理</button></div></div></div>
  </PageChrome>
</template>
