import { request } from './http'

export type PastureQuality = 'excellent' | 'fair' | 'poor' | 'closed'
export type PastureTone = 'ok' | 'warn'

export interface PastureZone {
  id: string
  name: string
  quality: PastureQuality
  qualityLabel: string
  areaSize: number
  capacity: number
  currentLoad: number
  pressure: number
  coverage: number
  overloaded: boolean
  tone: PastureTone
}

export interface PastureMetrics {
  coverage: number
  grassHeight: number | null
  soilMoisture: number | null
}

export interface PastureDetail extends PastureZone {
  metrics: PastureMetrics
}

export interface PasturePressureDay {
  date: string
  averagePressure: number
  zones: Array<{ pastureId: string; pressure: number }>
}

export interface CarryingCapacity {
  averagePressure: number
  peakPressure: number
  peakPastureId: string | null
  peakPastureName: string | null
  overloadedCount: number
  zoneCount: number
}

export const pastureApi = {
  list() {
    return request<PastureZone[]>('/pastures')
  },

  detail(id: string) {
    return request<PastureDetail>(`/pastures/${encodeURIComponent(id)}`)
  },

  pressure(days = 7) {
    return request<PasturePressureDay[]>(`/pastures/pressure?days=${days}`)
  },

  carryingCapacity() {
    return request<CarryingCapacity>('/pastures/carrying-capacity')
  },
}
