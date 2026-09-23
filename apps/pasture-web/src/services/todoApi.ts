import { request } from './http'

export type TodoType = 'rotation' | 'inspection' | 'vaccination' | 'maintenance' | 'device' | 'custom'
export type TodoTone = 'ok' | 'warn'

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
  tone: TodoTone
  createdAt: string
  updatedAt: string
}

export interface TodoTypeMeta {
  label: string
  hint: string
  status: string
  tone: TodoTone
}

export interface TodoListFilters {
  date?: string
}

export const todoApi = {
  list(filters: TodoListFilters = {}) {
    const query = filters.date ? `?date=${encodeURIComponent(filters.date)}` : ''
    return request<TodoItem[]>(`/todos${query}`)
  },

  create(draft: TodoDraft) {
    return request<TodoItem>('/todos', {
      method: 'POST',
      data: { ...draft },
    })
  },

  complete(id: string) {
    return request<TodoItem>(`/todos/${encodeURIComponent(id)}/complete`, {
      method: 'PATCH',
    })
  },

  update(id: string, draft: TodoDraft) {
    return request<TodoItem>(`/todos/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      data: { ...draft },
    })
  },

  remove(id: string) {
    return request<{ id: string }>(`/todos/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  },
}
