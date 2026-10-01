import { request } from './http'

export type HealthStatus = 'normal' | 'attention' | 'abnormal'
export type LivestockStatus = 'normal' | 'attention' | 'abnormal' | 'offline'

export interface LatestPosition {
  livestockId: string
  status: LivestockStatus
  statusLabel: string
  owner: string
  pastureId: string
  pastureName: string
  longitude: number
  latitude: number
  temperature: number | null
  heartRate: number | null
  steps: number | null
  rumination: number | null
  recordedAt: string
  staleMinutes: number
}

export interface TelemetrySample {
  livestockId: string
  recordedAt: string
  longitude: number
  latitude: number
  temperature: number | null
  heartRate: number | null
  steps: number | null
  rumination: number | null
  healthStatus: HealthStatus | null
  source: string
}

export interface TelemetryMetricPoint {
  recordedAt: string
  temperature?: number | null
  heartRate?: number | null
  steps?: number | null
  rumination?: number | null
}

export interface TelemetrySummary {
  total: number
  online: number
  offline: number
  normal: number
  attention: number
  abnormal: number
  onlineRate: number
  healthRate: number
  reportingWithinMinutes: number
  date: string
}

export interface TelemetrySampleDraft {
  livestockId: string
  recordedAt: string
  longitude: number
  latitude: number
  temperature?: number | null
  heartRate?: number | null
  steps?: number | null
  rumination?: number | null
  healthStatus?: HealthStatus
}

export type TelemetryMetric = 'temperature' | 'heartRate' | 'steps' | 'rumination'

export interface SampleHistoryFilters {
  from?: string
  to?: string
  metric?: TelemetryMetric
  limit?: number
}

function historyQuery(filters: SampleHistoryFilters) {
  const params: string[] = []
  if (filters.from) params.push(`from=${encodeURIComponent(filters.from)}`)
  if (filters.to) params.push(`to=${encodeURIComponent(filters.to)}`)
  if (filters.metric) params.push(`metric=${encodeURIComponent(filters.metric)}`)
  if (filters.limit) params.push(`limit=${filters.limit}`)
  return params.length ? `?${params.join('&')}` : ''
}

export const telemetryApi = {
  latest(filters: { pastureId?: string; status?: LivestockStatus; pageSize?: number } = {}) {
    const params: string[] = []
    if (filters.pastureId) params.push(`pastureId=${encodeURIComponent(filters.pastureId)}`)
    if (filters.status) params.push(`status=${encodeURIComponent(filters.status)}`)
    if (filters.pageSize) params.push(`pageSize=${filters.pageSize}`)
    return request<LatestPosition[]>(`/telemetry/latest${params.length ? `?${params.join('&')}` : ''}`)
  },

  summary() {
    return request<TelemetrySummary>('/telemetry/summary')
  },

  history(livestockId: string, filters: SampleHistoryFilters = {}) {
    return request<TelemetrySample[] | TelemetryMetricPoint[]>(
      `/telemetry/${encodeURIComponent(livestockId)}${historyQuery(filters)}`,
    )
  },

  report(draft: TelemetrySampleDraft) {
    return request<TelemetrySample>('/telemetry', { method: 'POST', data: { ...draft } })
  },
}
