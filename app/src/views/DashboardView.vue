<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  Bell,
  CircleAlert,
  Home,
  LocateFixed,
  Minus,
  PawPrint,
  Plus,
  RefreshCw,
  TriangleAlert,
  UserRound,
  Waves,
  WifiOff,
  X,
} from 'lucide-vue-next'
import { rotationCurrentDate, rotationSchedules } from '../data/rotationSchedule'

type DotStatus = 'normal' | 'attn' | 'alert' | 'offline'

interface MapDot {
  id: string
  status: DotStatus
  label: string
  temp: string
  area: string
  position: string
}

const dots: MapDot[] = [
  { id: 'SC-2026-00342', status: 'normal', label: '正常', temp: '39.2℃', area: 'P-A-01 · 东沟', position: 'd1' },
  { id: 'SC-2026-00418', status: 'normal', label: '正常', temp: '38.8℃', area: 'P-A-01 · 东沟', position: 'd2' },
  { id: 'SC-2026-00107', status: 'attn', label: '需关注', temp: '39.8℃', area: 'P-A-01 · 东沟', position: 'd3' },
  { id: 'SC-2026-00286', status: 'alert', label: '异常', temp: '40.7℃', area: 'P-A-03 · 河谷', position: 'd4' },
  { id: 'SC-2026-00377', status: 'normal', label: '正常', temp: '38.9℃', area: 'P-A-03 · 河谷', position: 'd5' },
  { id: 'SC-2026-00091', status: 'normal', label: '正常', temp: '39.1℃', area: 'P-A-02 · 北坡', position: 'd6' },
  { id: 'SC-2026-00312', status: 'normal', label: '正常', temp: '38.6℃', area: 'P-A-03 · 河谷', position: 'd7' },
  { id: 'SC-2026-00220', status: 'offline', label: '离线', temp: '—', area: 'P-A-03 · 河谷', position: 'd8' },
  { id: 'SC-2026-00401', status: 'normal', label: '正常', temp: '39.0℃', area: 'P-A-02 · 北坡', position: 'd9' },
  { id: 'SC-2026-00168', status: 'attn', label: '需关注', temp: '39.7℃', area: 'P-A-02 · 北坡', position: 'd10' },
]

const activeDot = ref<MapDot | null>(null)
const toastText = ref('')
let toastTimer: ReturnType<typeof setTimeout> | undefined
const isDrawerOpen = computed(() => activeDot.value !== null)
const todayRotationSchedules = computed(() => rotationSchedules.value
  .filter((schedule) => schedule.date === rotationCurrentDate.value)
  .sort((left, right) => left.time.localeCompare(right.time)))
const todaySuggestion = computed(() => todayRotationSchedules.value[0])
const todaySuggestionTitle = computed(() => todaySuggestion.value?.title || '无安排')
const todaySuggestionMeta = computed(() => {
  const schedule = todaySuggestion.value
  if (!schedule) return '暂无事件'
  const count = todayRotationSchedules.value.length
  return `${schedule.time} · ${schedule.status}${count > 1 ? ` · 共${count}项` : ''}`
})
const todaySuggestionDetail = computed(() => todaySuggestion.value?.detail || '今日暂无安排')
const todaySuggestionTone = computed(() => todaySuggestion.value?.tone || 'ok')
const emit = defineEmits<{ (event: 'navigate', view: string): void }>()

function showMessage(message: string) {
  toastText.value = message
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastText.value = '' }, 1600)
}

function openDot(dot: MapDot) { activeDot.value = dot }
function closeDrawer() { activeDot.value = null }
function openAlert(id: string) {
  const dot = dots.find((item) => item.id === id)
  if (dot) openDot(dot)
  else showMessage('已定位东沟草场')
}
function markHandled() { closeDrawer(); showMessage('已标记为处理中') }
function focusDot() {
  if (!activeDot.value) return
  const id = activeDot.value.id
  closeDrawer()
  showMessage(`已定位 ${id}`)
}
</script>

<template>
  <div class="app">
    <header class="topbar">
      <div class="brand"><div class="brand-mark">牧</div><div class="brand-title">牧场智控<span class="brand-sub">· 阿坝示范区</span></div></div>
      <div class="top-actions"><button class="icon-btn" aria-label="刷新数据" @click="showMessage('已刷新最新数据')"><RefreshCw :size="17" /></button><button class="icon-btn" aria-label="查看通知" @click="showMessage('暂无新的系统通知')"><Bell :size="17" /></button><div class="avatar">扎</div></div>
    </header>

    <main class="content">
      <div class="welcome"><div><div class="eyebrow">LIVE FIELD MONITOR</div><h1>今天的牧场，一眼掌握。</h1><p>四川 · 阿坝县 · 智慧放牧示范区　<span>刚刚更新</span></p></div><div class="date-chip">2026 / 09 / 07　☼ 14:32</div></div>
      <section class="kpi-grid" aria-label="牧场关键指标"><article class="kpi"><div class="kpi-label">在线牲畜<span>●</span></div><div class="kpi-value">128<small> 头</small></div><div class="kpi-foot good">↗ 较昨日 +6</div></article><article class="kpi"><div class="kpi-label">健康状态<span>◉</span></div><div class="kpi-value">94.5<span>%</span></div><div class="kpi-foot good">正常 121 · 关注 5 · 异常 2</div></article><article class="kpi"><div class="kpi-label">草场压力指数<span>⌁</span></div><div class="kpi-value">0.75</div><div class="kpi-foot warn">东沟草场接近承载上限</div></article><article class="kpi"><div class="kpi-label">今日告警<span>!</span></div><div class="kpi-value">03</div><div class="kpi-foot bad">2 条待处理 · 1 台离线</div></article></section>

      <div class="workspace">
        <section class="panel"><div class="panel-head"><div><div class="panel-title">3D 牧场总览</div><div class="panel-meta">程序化地形 · LOD 128×128 · 实时点位</div></div><button class="link-btn" @click="showMessage('视角已重置')">重置视角 ↗</button></div><div class="map-wrap"><div class="map"><div class="mountain m1"></div><div class="mountain m2"></div><div class="mountain m3"></div><div class="river"></div><div class="boundary zone-a"></div><div class="boundary zone-b"></div><div class="boundary zone-c"></div><span class="zone-label za">P-A-01 · 东沟</span><span class="zone-label zb">P-A-02 · 北坡</span><span class="zone-label zc">P-A-03 · 河谷</span><button v-for="dot in dots" :key="dot.id" class="dot" :class="[dot.status, dot.position]" :aria-label="`${dot.id} ${dot.label}`" @click="openDot(dot)"></button><div class="map-legend"><div class="legend-item"><i class="legend-dot ld-g"></i>正常</div><div class="legend-item"><i class="legend-dot ld-y"></i>需关注</div><div class="legend-item"><i class="legend-dot ld-r"></i>异常</div><div class="legend-item"><i class="legend-dot ld-x"></i>离线</div></div><div class="map-tools"><button class="map-tool" aria-label="放大地图" @click="showMessage('已放大地图')"><Plus :size="17" /></button><button class="map-tool" aria-label="缩小地图" @click="showMessage('已缩小地图')"><Minus :size="17" /></button><button class="map-tool" aria-label="定位示范区" @click="showMessage('已回到示范区中心')"><LocateFixed :size="17" /></button></div><div class="map-status">数据流 <b>● 正常</b>　128 个点位 · 约 12 秒前</div></div></div></section>
        <aside class="side"><div class="side-stack"><section class="panel"><div class="panel-head"><div class="panel-title">需要立即关注</div><button class="link-btn" @click="showMessage('当前共 3 条待处理告警')">查看全部</button></div><button class="alert-item" @click="openAlert('SC-2026-00286')"><div class="alert-icon red"><TriangleAlert :size="13" /></div><div class="alert-copy"><strong>SC-2026-00286 体温偏高</strong><span>40.7℃ · P-A-03 河谷</span></div><div class="alert-time">2分钟前</div></button><button class="alert-item" @click="openAlert('P-A-01')"><div class="alert-icon yellow"><CircleAlert :size="13" /></div><div class="alert-copy"><strong>东沟草场压力偏高</strong><span>指数 0.75 · 建议轮换</span></div><div class="alert-time">18分钟前</div></button><button class="alert-item" @click="openAlert('SC-2026-00220')"><div class="alert-icon gray"><WifiOff :size="13" /></div><div class="alert-copy"><strong>SC-2026-00220 设备离线</strong><span>最后上报 32 分钟前</span></div><div class="alert-time">32分钟前</div></button></section><section class="panel"><div class="panel-head"><div class="panel-title">今日建议</div><span class="status" :class="todaySuggestionTone">{{ todaySuggestionMeta }}</span></div><div class="suggestion"><div class="suggestion-title">{{ todaySuggestionTitle }}</div><p class="suggestion-detail">{{ todaySuggestionDetail }}</p></div></section></div><section class="panel"><div class="panel-head"><div class="panel-title">今日健康分布</div><span class="panel-meta">128 头</span></div><div class="health"><div class="health-row"><span>正常</span><strong>121 <small>94.5%</small></strong></div><div class="bar"><i style="width:94.5%"></i></div><div class="health-row"><span>需关注</span><strong>5 <small>3.9%</small></strong></div><div class="bar"><i class="yellow" style="width:3.9%"></i></div><div class="health-row"><span>异常</span><strong>2 <small>1.6%</small></strong></div><div class="bar"><i style="width:1.6%;background:var(--danger)"></i></div></div></section></aside>
      </div>

      <div class="section-grid section"><section class="panel"><div class="panel-head"><div><div class="panel-title">草场分区</div><div class="panel-meta">3 个管理单元 · 实时承载</div></div><button class="link-btn" @click="showMessage('正在打开分区详情')">分区详情</button></div><table class="zone-table"><thead><tr><th>区域</th><th>质量</th><th>载畜 / 上限</th><th>压力</th></tr></thead><tbody><tr><td><div class="zone-name"><i class="zone-swatch"></i>东沟草场 <small>P-A-01</small></div></td><td><span class="quality">优良</span></td><td>45 / 60 头</td><td>0.75</td></tr><tr><td><div class="zone-name"><i class="zone-swatch"></i>河谷草场 <small>P-A-03</small></div></td><td><span class="quality">优良</span></td><td>38 / 55 头</td><td>0.69</td></tr><tr><td><div class="zone-name"><i class="zone-swatch warn"></i>北坡草场 <small>P-A-02</small></div></td><td><span class="quality warn">一般</span></td><td>45 / 48 头</td><td>0.94</td></tr></tbody></table></section><section class="panel"><div class="panel-head"><div><div class="panel-title">近 7 日草场压力</div><div class="panel-meta">指数越低越健康</div></div><span class="panel-meta">均值 0.68</span></div><div class="mini-chart"><div class="bar-col" style="height:56%"><b>01</b></div><div class="bar-col" style="height:62%"><b>02</b></div><div class="bar-col" style="height:50%"><b>03</b></div><div class="bar-col" style="height:68%"><b>04</b></div><div class="bar-col" style="height:74%"><b>05</b></div><div class="bar-col" style="height:78%"><b>06</b></div><div class="bar-col" style="height:75%;background:linear-gradient(to top,#f6c76e,#fef3c7)"><b>今</b></div></div></section></div>
    </main>

    <nav class="bottom-nav" aria-label="主导航"><button class="nav-item active"><Home class="nav-ico" :size="19" />总览</button><button class="nav-item" @click="emit('navigate', 'alerts')"><TriangleAlert class="nav-ico" :size="19" />告警</button><button class="nav-item" @click="emit('navigate', 'livestock')"><PawPrint class="nav-ico" :size="19" />牲畜</button><button class="nav-item" @click="emit('navigate', 'pasture')"><Waves class="nav-ico" :size="19" />草场</button><button class="nav-item" @click="emit('navigate', 'profile')"><UserRound class="nav-ico" :size="19" />我的</button></nav>
  </div>

  <div class="drawer" :class="{ open: isDrawerOpen }" @click.self="closeDrawer"><div class="drawer-card"><div class="drawer-head"><h2>牲畜详情 · {{ activeDot?.id }}</h2><button class="close" aria-label="关闭" @click="closeDrawer"><X :size="18" /></button></div><div v-if="activeDot" class="detail-grid"><div class="detail"><label>健康状态</label><strong>{{ activeDot.label }}</strong></div><div class="detail"><label>体温</label><strong>{{ activeDot.temp }}</strong></div><div class="detail"><label>所在区域</label><strong style="font-size:14px">{{ activeDot.area }}</strong></div><div class="detail"><label>今日步数</label><strong>2,340</strong></div><div class="detail"><label>心率</label><strong>62 <small>次/分</small></strong></div><div class="detail"><label>反刍次数</label><strong>42 <small>次/天</small></strong></div></div><div class="drawer-actions"><button class="btn primary" @click="focusDot">定位到地图</button><button class="btn secondary" @click="markHandled">标记已处理</button></div></div></div>
  <div class="toast" :class="{ show: toastText }">{{ toastText }}</div>
</template>
