import { request } from './http'

export type ConsultationStatus = 'open' | 'answered' | 'closed'
export type ConsultationRole = 'doctor' | 'user' | 'assistant'

export interface ConsultationMessage {
  id: string
  role: ConsultationRole
  authorName: string
  text: string
  createdAt: string
}

export interface ConsultationSummary {
  id: string
  code: string
  userId: string
  livestockId: string | null
  pastureId: string | null
  symptoms: string[]
  description: string
  title: string
  status: ConsultationStatus
  statusLabel: string
  doctorName: string
  messageCount: number
  summary: string
  createdAt: string
  updatedAt: string
}

export interface ConsultationDetail extends ConsultationSummary {
  messages: ConsultationMessage[]
  aiError?: boolean
}

export interface ConsultationDraft {
  symptoms: string[]
  description: string
  livestockId?: string | null
  pastureId?: string | null
}

export const consultationApi = {
  list(filters: { status?: ConsultationStatus; days?: number } = {}) {
    const params: string[] = []
    if (filters.status) params.push(`status=${encodeURIComponent(filters.status)}`)
    if (filters.days) params.push(`days=${filters.days}`)
    return request<ConsultationSummary[]>(`/consultations${params.length ? `?${params.join('&')}` : ''}`)
  },

  detail(id: string) {
    return request<ConsultationDetail>(`/consultations/${encodeURIComponent(id)}`)
  },

  create(draft: ConsultationDraft) {
    return request<ConsultationDetail>('/consultations', { method: 'POST', data: { ...draft }, timeout: 60_000 })
  },

  sendMessage(id: string, text: string) {
    return request<ConsultationMessage & { aiError?: boolean }>(`/consultations/${encodeURIComponent(id)}/messages`, {
      method: 'POST',
      data: { text },
      timeout: 60_000,
    })
  },

  retry(id: string) {
    return request<ConsultationDetail>(`/consultations/${encodeURIComponent(id)}/retry`, {
      method: 'POST',
      timeout: 60_000,
    })
  },
}
