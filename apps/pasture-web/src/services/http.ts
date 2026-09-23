interface ApiEnvelope<T> {
  code: number
  message: string
  data: T
  details?: Record<string, string>
}

type RequestMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

interface RequestOptions {
  method?: RequestMethod
  data?: string | Record<string, unknown> | ArrayBuffer
  headers?: Record<string, string>
}

export const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '')

export function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    uni.request({
      url: `${apiBaseUrl}${path}`,
      method: (options.method || 'GET') as UniApp.RequestOptions['method'],
      data: options.data as UniApp.RequestOptions['data'],
      header: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      success: (response) => {
        const payload = response.data as ApiEnvelope<T>
        if (response.statusCode < 200 || response.statusCode >= 300 || payload.code !== 0) {
          const details = payload.details ? ` (${Object.values(payload.details).join('; ')})` : ''
          reject(new Error(`${payload.message || '请求失败'}${details}`))
          return
        }
        resolve(payload.data)
      },
      fail: () => {
        reject(new Error('无法连接后台接口，请先启动 text_backend 服务，并配置 VITE_API_BASE_URL'))
      },
    })
  })
}
