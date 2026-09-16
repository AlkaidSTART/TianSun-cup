import { ref } from 'vue'

export interface RotationDraft {
  date: string
  time: string
  from: string
  to: string
  amount: number
  note: string
}

export interface RotationSchedule {
  id: string
  date: string
  time: string
  title: string
  detail: string
  status: string
  tone: 'ok' | 'warn'
}

export function localDateValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

export function dateAfter(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return localDateValue(date)
}

function shortPastureName(name: string) {
  return name.replace('草场', '')
}

function relativeDateLabel(value: string) {
  const today = new Date(`${rotationCurrentDate.value}T00:00:00`)
  const target = new Date(`${value}T00:00:00`)
  const difference = Math.round((target.getTime() - today.getTime()) / 86_400_000)
  if (difference === 0) return '今日'
  if (difference === 1) return '明日'
  if (difference === 2) return '后日'
  const [, month, day] = value.split('-')
  return `${Number(month)}月${Number(day)}日`
}

export function scheduleDisplayTitle(schedule: RotationSchedule) {
  return `${relativeDateLabel(schedule.date)} ${schedule.time} · ${schedule.title}`
}

export const rotationCurrentDate = ref(localDateValue())
export const rotationSchedules = ref<RotationSchedule[]>([
  {
    id: '01',
    date: dateAfter(1),
    time: '06:00',
    title: '北坡 → 河谷',
    detail: '释放北坡压力，预计转移 20 头',
    status: '待确认',
    tone: 'warn',
  },
  {
    id: '02',
    date: dateAfter(2),
    time: '07:00',
    title: '东沟巡检',
    detail: '复核土壤湿度与围栏状态',
    status: '已安排',
    tone: 'ok',
  },
])

let nextRotationId = 3

export function cleanupExpiredRotationSchedules(referenceDate = localDateValue()) {
  rotationCurrentDate.value = referenceDate
  const previousCount = rotationSchedules.value.length
  rotationSchedules.value = rotationSchedules.value.filter((schedule) => schedule.date >= referenceDate)
  return previousCount - rotationSchedules.value.length
}

export function startRotationScheduleCleanup() {
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false

  const runCleanup = () => {
    if (stopped) return
    cleanupExpiredRotationSchedules()
    const now = new Date()
    const nextMidnight = new Date(now)
    nextMidnight.setHours(24, 0, 1, 0)
    timer = setTimeout(runCleanup, Math.max(1_000, nextMidnight.getTime() - now.getTime()))
  }

  runCleanup()
  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
  }
}

export function addRotationSchedule(draft: RotationDraft) {
  cleanupExpiredRotationSchedules()
  if (draft.date < rotationCurrentDate.value) return null

  const schedule: RotationSchedule = {
    id: String(nextRotationId++).padStart(2, '0'),
    date: draft.date,
    time: draft.time,
    title: `${shortPastureName(draft.from)} → ${shortPastureName(draft.to)}`,
    detail: draft.note.trim() || `预计转移 ${draft.amount} 头`,
    status: '待确认',
    tone: 'warn',
  }
  rotationSchedules.value.push(schedule)
  rotationSchedules.value.sort((left, right) => `${left.date} ${left.time}`.localeCompare(`${right.date} ${right.time}`))
  return schedule
}
