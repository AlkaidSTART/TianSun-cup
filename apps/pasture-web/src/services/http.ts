import { clearAuthSession, getAuthToken, goToLogin } from './session'

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
    // #ifdef MP-WEIXIN
    if (!/^https?:\/\//i.test(apiBaseUrl)) {
      reject(new Error('微信小程序需将 VITE_API_BASE_URL 配置为可访问的完整 API 地址'))
      return
    }
    // #endif
    const token = getAuthToken()
    const platformHeaders: Record<string, string> = {}
    // #ifdef H5
    platformHeaders['X-Requested-With'] = 'TianSun'
    // #endif
    // #ifdef MP-WEIXIN
    platformHeaders['X-Client-Platform'] = 'mp-weixin'
    // #endif
    uni.request({
      url: `${apiBaseUrl}${path}`,
      method: (options.method || 'GET') as UniApp.RequestOptions['method'],
      data: options.data as UniApp.RequestOptions['data'],
      header: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...platformHeaders,
        ...(options.headers || {}),
      },
      success: (response) => {
        const payload = response.data as ApiEnvelope<T>
        if (response.statusCode === 401 && path !== '/auth/login') {
          clearAuthSession()
          goToLogin()
        }
        if (response.statusCode === 403 && payload.message === '首次登录请先修改密码') {
          goToLogin()
        }
        if (response.statusCode < 200 || response.statusCode >= 300 || payload.code !== 0) {
          const details = payload.details ? ` (${Object.values(payload.details).join('; ')})` : ''
          reject(new Error(`${payload.message || '请求失败'}${details}`))
          return
        }
        resolve(payload.data)
      },
      fail: () => {
        reject(new Error('无法连接后台接口，请检查服务或 VITE_API_BASE_URL 配置'))
      },
    })
  })
}
