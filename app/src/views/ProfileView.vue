<script setup lang="ts">
import { reactive, ref } from 'vue'
import { Bell, Moon, RefreshCw, MessageSquarePlus, ChevronRight, X } from 'lucide-vue-next'
import PageChrome from '../components/PageChrome.vue'

interface RotationSchedule {
  id: string
  title: string
  detail: string
  status: string
  tone: 'ok' | 'warn'
}

interface RotationDraft {
  date: string
  time: string
  from: string
  to: string
  amount: number
  note: string
}

const emit = defineEmits<{ (event: 'add-rotation', schedule: RotationDraft): void }>()
const pastureOptions = ['东沟草场', '河谷草场', '北坡草场']
const rotationSchedules = ref<RotationSchedule[]>([
  { id: '01', title: '明日 06:00 · 北坡 → 河谷', detail: '释放北坡压力，预计转移 20 头', status: '待确认', tone: 'warn' },
  { id: '02', title: '后日 07:00 · 东沟巡检', detail: '复核土壤湿度与围栏状态', status: '已安排', tone: 'ok' },
])

const nightMode = ref(false)
const toast = ref('')
const rotationDialogOpen = ref(false)
const minRotationDate = dateValue(new Date())
const rotationForm = reactive<RotationDraft>({
  date: dateAfter(1),
  time: '06:00',
  from: '北坡草场',
  to: '河谷草场',
  amount: 20,
  note: '',
})
let nextRotationId = 3
let toastTimer: ReturnType<typeof setTimeout> | undefined

function dateValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}
function dateAfter(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return dateValue(date)
}
function showMessage(message: string) { toast.value = message; if (toastTimer) clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.value = '' }, 1600) }
function resetRotationForm() {
  Object.assign(rotationForm, {
    date: dateAfter(1),
    time: '06:00',
    from: '北坡草场',
    to: '河谷草场',
    amount: 20,
    note: '',
  })
}
function handleAddRotation() {
  resetRotationForm()
  rotationDialogOpen.value = true
}
function closeRotationDialog() {
  rotationDialogOpen.value = false
}
function shortPastureName(name: string) {
  return name.replace('草场', '')
}
function formatRotationDate(value: string) {
  const [, month, day] = value.split('-')
  return `${Number(month)}月${Number(day)}日`
}
function submitRotation() {
  if (rotationForm.from === rotationForm.to) {
    showMessage('起始草场和目标草场不能相同')
    return
  }
  const schedule = { ...rotationForm }
  rotationSchedules.value.push({
    id: String(nextRotationId++).padStart(2, '0'),
    title: `${formatRotationDate(schedule.date)} ${schedule.time} · ${shortPastureName(schedule.from)} → ${shortPastureName(schedule.to)}`,
    detail: schedule.note.trim() || `预计转移 ${schedule.amount} 头`,
    status: '待确认',
    tone: 'warn',
  })
  emit('add-rotation', schedule)
  closeRotationDialog()
  showMessage('轮换日程已添加')
}
function navigate(view: string) { window.location.hash = view }
</script>

<template>
  <PageChrome active="profile" :refresh="false" @navigate="navigate">
    <main class="content">
      <div class="page-head"><div><div class="eyebrow">ACCOUNT & SETTINGS</div><h1>我的</h1><p>管理个人信息、通知与显示偏好</p></div></div>
      <section class="panel"><div class="profile-summary"><div class="avatar profile-avatar">李</div><div><strong>李建国</strong><div>乡镇畜牧技术员 · 阿坝示范区</div></div><span class="status ok">在线</span></div></section>
      <div class="grid-2 section"><section class="panel"><div class="panel-head"><div class="panel-title">工作偏好</div><span class="panel-meta">本设备</span></div><div class="list"><button class="list-row setting" @click="nightMode = !nightMode; showMessage('已切换夜间模式')"><span class="icon-disc"><Moon :size="15" /></span><span class="list-main"><strong>夜间模式</strong><small>冬季 17:00 后降低亮度</small></span><span class="chip">{{ nightMode ? '开启' : '关闭' }}</span></button><button class="list-row setting" @click="showMessage('告警通知已开启')"><span class="icon-disc"><Bell :size="15" /></span><span class="list-main"><strong>告警通知</strong><small>异常体温、超载与离线提醒</small></span><span class="status ok">已开启</span></button><button class="list-row setting" @click="showMessage('数据刷新频率已更新')"><span class="icon-disc"><RefreshCw :size="15" /></span><span class="list-main"><strong>数据刷新频率</strong><small>地图与列表自动同步</small></span><span class="chip">30 秒</span></button></div></section><section class="panel"><div class="panel-head"><div class="panel-title">示范区信息</div><span class="panel-meta">只读</span></div><div class="list profile-info"><div class="list-row"><span class="list-main"><strong>四川 · 阿坝县</strong><small>高原放牧示范区</small></span><span class="mono muted-value">P-A</span></div><div class="list-row"><span class="list-main"><strong>当前数据源</strong><small>模拟数据 · 接口预留</small></span><span class="status ok">稳定</span></div><div class="list-row"><span class="list-main"><strong>最近同步</strong><small>2026 / 09 / 07 14:32</small></span><span class="mono muted-value">12 秒前</span></div></div></section></div>
      <section class="panel section"><div class="panel-head"><div class="panel-title">轮换日程</div><button class="link-btn" type="button" @click="handleAddRotation">添加</button></div><div class="list"><div v-for="item in rotationSchedules" :key="item.id" class="list-row"><span class="icon-disc">{{ item.id }}</span><span class="list-main"><strong>{{ item.title }}</strong><small>{{ item.detail }}</small></span><span class="status" :class="item.tone">{{ item.status }}</span></div></div></section>
      <section class="panel section"><div class="panel-head"><div class="panel-title">帮助与反馈</div></div><div class="list"><button class="list-row setting" @click="navigate('consultation')"><span class="icon-disc"><MessageSquarePlus :size="15" /></span><span class="list-main"><strong>在线问诊</strong><small>联系驻场兽医，咨询牲畜健康问题</small></span><span class="status ok">医生在线</span></button><button class="list-row setting" @click="showMessage('帮助中心即将打开')"><span class="list-main"><strong>使用帮助</strong><small>查看地图、告警和轮换操作说明</small></span><ChevronRight :size="16" class="muted-icon" /></button><button class="list-row setting" @click="showMessage('反馈已记录，感谢你的建议')"><span class="list-main"><strong>问题反馈</strong><small>告诉我们现场使用中的问题</small></span><ChevronRight :size="16" class="muted-icon" /></button><button class="list-row setting" @click="showMessage('当前版本 1.0.0')"><span class="list-main"><strong>关于牧场智控</strong><small>版本与数据协议</small></span><span class="mono muted-value">v1.0.0</span></button></div></section>
    </main>
    <div class="drawer rotation-dialog" :class="{ open: rotationDialogOpen }" @click.self="closeRotationDialog">
      <form class="drawer-card rotation-form" @submit.prevent="submitRotation">
        <div class="drawer-head"><h2>添加轮换日程</h2><button class="close" type="button" aria-label="关闭" @click="closeRotationDialog"><X :size="18" /></button></div>
        <div class="rotation-form-grid">
          <label class="rotation-field"><span>日期</span><input v-model="rotationForm.date" type="date" :min="minRotationDate" required></label>
          <label class="rotation-field"><span>时间</span><input v-model="rotationForm.time" type="time" required></label>
          <label class="rotation-field"><span>起始草场</span><select v-model="rotationForm.from" required><option v-for="pasture in pastureOptions" :key="pasture" :value="pasture">{{ pasture }}</option></select></label>
          <label class="rotation-field"><span>目标草场</span><select v-model="rotationForm.to" required><option v-for="pasture in pastureOptions" :key="pasture" :value="pasture">{{ pasture }}</option></select></label>
          <label class="rotation-field"><span>预计转移数量</span><div class="rotation-number"><input v-model.number="rotationForm.amount" type="number" min="1" step="1" required><span>头</span></div></label>
          <label class="rotation-field rotation-field-full"><span>备注</span><textarea v-model.trim="rotationForm.note" rows="3" maxlength="120" placeholder="例如：优先转移需关注牛群"></textarea></label>
        </div>
        <div class="drawer-actions rotation-form-actions"><button class="btn btn-secondary" type="button" @click="closeRotationDialog">取消</button><button class="btn btn-primary" type="submit">保存日程</button></div>
      </form>
    </div>
    <div class="toast" :class="{ show: toast }">{{ toast }}</div>
  </PageChrome>
</template>
