import { computed } from 'vue'
import { addTodo, todoCurrentDate, todoItems, type TodoItem } from './todoList'

export { dateAfter, localDateValue } from './todoList'

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

function shortPastureName(name: string) {
  return name.replace('草场', '')
}

function toRotationSchedule(item: TodoItem): RotationSchedule {
  return {
    id: item.id,
    date: item.date,
    time: item.time,
    title: item.title,
    detail: item.detail,
    status: item.status,
    tone: item.tone,
  }
}

export const rotationCurrentDate = todoCurrentDate

export const rotationSchedules = computed<RotationSchedule[]>(() => todoItems.value
  .filter((item) => item.type === 'rotation')
  .map(toRotationSchedule)
  .sort((left, right) => `${left.date} ${left.time}`.localeCompare(`${right.date} ${right.time}`)))

export function addRotationSchedule(draft: RotationDraft) {
  return addTodo({
    type: 'rotation',
    date: draft.date,
    time: draft.time,
    title: `${shortPastureName(draft.from)} → ${shortPastureName(draft.to)}`,
    detail: draft.note.trim() || `预计转移 ${draft.amount} 头`,
  })
}
