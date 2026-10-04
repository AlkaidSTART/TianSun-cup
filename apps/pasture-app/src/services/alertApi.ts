import { request } from './http'

export type AlertSeverity = 'bad' | 'warn' | 'off'
export type AlertStatus = 'pending' | 'handling' | 'resolved'
export type AlertType = 'temperature' | 'pressure' | 'device'
export type AlertTargetType = 'livestock' | 'pasture'

export interface AlertRecord {
  id: string
  userId: string
  type: AlertType
  severity: AlertSeverity
  targetType: AlertTargetType
  targetId: string
  title: string
  detail: string
  status: AlertStatus
  statusLabel: string
  triggeredAt: string
  handledByName: string | null
  handledAt: string | null
  createdAt: string
  updatedAt: string
}

export interface AlertSummary {
  total: number
  pending: number
  handling: number
  resolved: number
  resolvedRate: number
  bySeverity: Record<AlertSeverity, number>
  date: string
}

export interface AlertRules {
  temperatureAbove: number
  pressureAbove: number
  reportTimeoutMinutes: number
  units: {
    temperature: string
    pressure: string
    reportTimeoutMinutes: string
  }
}

export interface AlertListFilters {
  type?: AlertType
  severity?: AlertSeverity
  status?: AlertStatus | 'open'
  targetId?: string
  date?: string
  page?: number
  pageSize?: number
}

function toQuery(filters: AlertListFilters) {
  const params: string[] = []
  if (filters.type) params.push(`type=${encodeURIComponent(filters.type)}`)
  if (filters.severity) params.push(`severity=${encodeURIComponent(filters.severity)}`)
  if (filters.status) params.push(`status=${encodeURIComponent(filters.status)}`)
  if (filters.targetId) params.push(`targetId=${encodeURIComponent(filters.targetId)}`)
  if (filters.date) params.push(`date=${encodeURIComponent(filters.date)}`)
  if (filters.page) params.push(`page=${filters.page}`)
  if (filters.pageSize) params.push(`pageSize=${filters.pageSize}`)
  return params.length ? `?${params.join('&')}` : ''
}

export const alertApi = {
  list(filters: AlertListFilters = {}) {
    return request<AlertRecord[]>(`/alerts${toQuery(filters)}`)
  },

  summary(date?: string) {
    return request<AlertSummary>(`/alerts/summary${date ? `?date=${encodeURIComponent(date)}` : ''}`)
  },

  rules() {
    return request<AlertRules>('/alerts/rules')
  },

  handle(id: string, status: Exclude<AlertStatus, 'pending'>) {
    return request<AlertRecord>(`/alerts/${encodeURIComponent(id)}/handle`, {
      method: 'PATCH',
      data: { status },
    })
  },
}
