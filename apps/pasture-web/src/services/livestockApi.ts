import { request } from './http'

export type LivestockStatus = 'normal' | 'attention' | 'abnormal' | 'offline'
export type LivestockSourceType = 'purchased' | 'born'
export type LivestockSex = 'female' | 'male'

export interface LivestockRecord {
  id: string
  species: string
  breed: string
  sex: LivestockSex
  sourceType: LivestockSourceType
  motherId: string | null
  birthDate: string | null
  purchaseDate: string | null
  supplier: string | null
  purchasePrice: number | null
  pastureId: string
  pastureName: string
  owner: string
  status: LivestockStatus
  temperature: number | null
  heartRate: number | null
  steps: number | null
  rumination: number | null
  lastReportAt: string | null
  notes: string
  createdAt: string
  updatedAt: string
}

export interface MotherOption {
  id: string
  species: string
  breed: string
  birthDate: string | null
  pastureId: string
  pastureName: string
  owner: string
  status: LivestockStatus
}

export interface LivestockDraft {
  id: string
  species: string
  breed: string
  sex: LivestockSex
  sourceType: LivestockSourceType
  motherId?: string | null
  birthDate?: string | null
  purchaseDate?: string | null
  supplier?: string | null
  purchasePrice?: number | null
  pastureId: string
  pastureName?: string
  owner: string
  notes?: string
}

export interface LivestockStats {
  total: number
  online: number
  normal: number
  attention: number
  abnormal: number
  offline: number
  born: number
  purchased: number
  female: number
  male: number
}

export const livestockApi = {
  list(filters: { q?: string; status?: LivestockStatus | ''; sourceType?: LivestockSourceType | '' } = {}) {
    const params: string[] = []
    if (filters.q) params.push(`q=${encodeURIComponent(filters.q)}`)
    if (filters.status) params.push(`status=${encodeURIComponent(filters.status)}`)
    if (filters.sourceType) params.push(`sourceType=${encodeURIComponent(filters.sourceType)}`)
    const query = params.join('&')
    return request<LivestockRecord[]>(`/livestock${query ? `?${query}` : ''}`)
  },

  mothers() {
    return request<MotherOption[]>('/livestock/mothers')
  },

  stats() {
    return request<LivestockStats>('/livestock/stats')
  },

  create(draft: LivestockDraft) {
    return request<LivestockRecord>('/livestock', {
      method: 'POST',
      data: { ...draft },
    })
  },
}
