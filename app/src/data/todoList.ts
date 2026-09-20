import { ref } from 'vue'
import {
  todoApi,
  type TodoDraft,
  type TodoItem,
  type TodoListFilters,
  type TodoType,
  type TodoTypeMeta,
} from '../services/todoApi'

export type { TodoDraft, TodoItem, TodoListFilters, TodoTone, TodoType, TodoTypeMeta } from '../services/todoApi'

export const todoTypeMeta: Record<TodoType, TodoTypeMeta> = {
  rotation: { label: '轮换日程', hint: '草场轮换与牲畜转移', status: '待办', tone: 'warn' },
  inspection: { label: '巡检任务', hint: '草层、水源等巡查', status: '待办', tone: 'warn' },
  vaccination: { label: '疫苗接种', hint: '畜群免疫与防疫安排', status: '待办', tone: 'warn' },
  maintenance: { label: '草场维护', hint: '补播施肥与围栏修复', status: '待办', tone: 'warn' },
  device: { label: '设备维护', hint: '终端检修与故障处理', status: '待办', tone: 'warn' },
  custom: { label: '自定义待办', hint: '其他需要跟进的事项', status: '待办', tone: 'warn' },
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
export const todoItems = ref<TodoItem[]>([])
export const todoLoading = ref(false)
export const todoError = ref('')

let latestRequest = 0

function sortTodos(items: TodoItem[]) {
  return [...items].sort((left, right) => `${left.date} ${left.time}`.localeCompare(`${right.date} ${right.time}`))
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : '待办事项操作失败'
}

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

export async function loadTodos(filters: TodoListFilters = {}) {
  const requestId = ++latestRequest
  todoLoading.value = true
  todoError.value = ''

  try {
    const records = await todoApi.list(filters)
    if (requestId === latestRequest) todoItems.value = sortTodos(records)
    return records
  } catch (error) {
    const message = errorText(error)
    if (requestId === latestRequest) todoError.value = message
    throw new Error(message)
  } finally {
    if (requestId === latestRequest) todoLoading.value = false
  }
}

export async function addTodo(draft: TodoDraft) {
  const item = await todoApi.create(draft)
  todoItems.value = sortTodos([
    ...todoItems.value.filter((existing) => existing.id !== item.id),
    item,
  ])
  todoError.value = ''
  return item
}

export async function completeTodo(id: string) {
  const item = await todoApi.complete(id)
  todoItems.value = todoItems.value.map((existing) => existing.id === item.id ? item : existing)
  todoError.value = ''
  return item
}

export async function updateTodo(id: string, draft: TodoDraft) {
  const item = await todoApi.update(id, draft)
  todoItems.value = sortTodos(todoItems.value.map((existing) => existing.id === item.id ? item : existing))
  todoError.value = ''
  return item
}

export async function removeTodo(id: string) {
  await todoApi.remove(id)
  todoItems.value = todoItems.value.filter((existing) => existing.id !== id)
  todoError.value = ''
}
