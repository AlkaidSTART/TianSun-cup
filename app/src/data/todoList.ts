import { ref } from 'vue'

export type TodoType = 'rotation' | 'inspection' | 'vaccination' | 'maintenance' | 'device' | 'custom'

export interface TodoDraft {
  type: TodoType
  date: string
  time: string
  title: string
  detail: string
}

export interface TodoItem extends TodoDraft {
  id: string
  status: string
  tone: 'ok' | 'warn'
}

export interface TodoTypeMeta {
  label: string
  hint: string
  status: string
  tone: 'ok' | 'warn'
}

export const todoTypeMeta: Record<TodoType, TodoTypeMeta> = {
  rotation: { label: '轮换日程', hint: '草场轮换与牲畜转移', status: '待确认', tone: 'warn' },
  inspection: { label: '巡检任务', hint: '草层、水源等巡查', status: '待执行', tone: 'ok' },
  vaccination: { label: '疫苗接种', hint: '畜群免疫与防疫安排', status: '待执行', tone: 'ok' },
  maintenance: { label: '草场维护', hint: '补播施肥与围栏修复', status: '待执行', tone: 'ok' },
  device: { label: '设备维护', hint: '终端检修与故障处理', status: '待处理', tone: 'warn' },
  custom: { label: '自定义待办', hint: '其他需要跟进的事项', status: '待执行', tone: 'ok' },
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

export const todoCurrentDate = ref(localDateValue())

function relativeDateLabel(value: string) {
  const today = new Date(`${todoCurrentDate.value}T00:00:00`)
  const target = new Date(`${value}T00:00:00`)
  const difference = Math.round((target.getTime() - today.getTime()) / 86_400_000)
  if (difference === 0) return '今日'
  if (difference === 1) return '明日'
  if (difference === 2) return '后日'
  const [, month, day] = value.split('-')
  return `${Number(month)}月${Number(day)}日`
}

export function todoDisplayTitle(item: TodoItem) {
  return `${relativeDateLabel(item.date)} ${item.time} · ${item.title}`
}

export const todoItems = ref<TodoItem[]>([
  {
    id: '01',
    type: 'rotation',
    date: dateAfter(1),
    time: '06:00',
    title: '北坡 → 河谷',
    detail: '释放北坡压力，预计转移 20 头',
    status: '待确认',
    tone: 'warn',
  },
  {
    id: '02',
    type: 'device',
    date: dateAfter(1),
    time: '15:00',
    title: 'SC-2026-00220 检修',
    detail: '更换电池并复核上报链路',
    status: '待处理',
    tone: 'warn',
  },
  {
    id: '03',
    type: 'inspection',
    date: dateAfter(2),
    time: '07:00',
    title: '东沟草场巡检',
    detail: '复核土壤湿度与围栏状态',
    status: '待执行',
    tone: 'ok',
  },
  {
    id: '04',
    type: 'vaccination',
    date: dateAfter(2),
    time: '09:30',
    title: '河谷牛群疫苗接种',
    detail: '口蹄疫疫苗第一针 · 预计 55 头',
    status: '待执行',
    tone: 'ok',
  },
])

let nextTodoId = 5

function sortTodos() {
  todoItems.value.sort((left, right) => `${left.date} ${left.time}`.localeCompare(`${right.date} ${right.time}`))
}

export function cleanupExpiredTodos(referenceDate = localDateValue()) {
  todoCurrentDate.value = referenceDate
  const previousCount = todoItems.value.length
  todoItems.value = todoItems.value.filter((item) => item.date >= referenceDate)
  return previousCount - todoItems.value.length
}

export function startTodoCleanup() {
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false

  const runCleanup = () => {
    if (stopped) return
    cleanupExpiredTodos()
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

export function addTodo(draft: TodoDraft) {
  cleanupExpiredTodos()
  if (draft.date < todoCurrentDate.value) return null

  const meta = todoTypeMeta[draft.type]
  const item: TodoItem = {
    id: String(nextTodoId++).padStart(2, '0'),
    type: draft.type,
    date: draft.date,
    time: draft.time,
    title: draft.title,
    detail: draft.detail,
    status: meta.status,
    tone: meta.tone,
  }
  todoItems.value.push(item)
  sortTodos()
  return item
}
