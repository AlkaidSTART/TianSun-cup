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

interface ApiEnvelope<T> {
  code: number
  message: string
  data: T
  details?: Record<string, string>
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '')

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      ...options,
    })
  } catch {
    throw new Error('无法连接后台接口，请先启动 text_backend 服务')
  }

  let payload: ApiEnvelope<T>
  try {
    payload = await response.json() as ApiEnvelope<T>
  } catch {
    throw new Error(`后台返回异常（HTTP ${response.status}）`)
  }

  if (!response.ok || payload.code !== 0) {
    const details = payload.details ? `：${Object.values(payload.details).join('，')}` : ''
    throw new Error(`${payload.message || '请求失败'}${details}`)
  }
  return payload.data
}

export const todoApi = {
  list(filters: TodoListFilters = {}) {
    const params = new URLSearchParams()
    if (filters.date) params.set('date', filters.date)
    const query = params.toString()
    return request<TodoItem[]>(`/todos${query ? `?${query}` : ''}`)
  },

  create(draft: TodoDraft) {
    return request<TodoItem>('/todos', {
      method: 'POST',
      body: JSON.stringify(draft),
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
      body: JSON.stringify(draft),
    })
  },

  remove(id: string) {
    return request<{ id: string }>(`/todos/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  },
}
