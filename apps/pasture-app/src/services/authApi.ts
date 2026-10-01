import { request } from './http'
import { clearAuthSession, getAuthToken, hasAuthSessionHint, setAuthSession, setAuthUser, usesBrowserCookie, type AuthUser } from './session'

interface AuthResult {
  token?: string
  expiresAt: string
  user: AuthUser
}

export const authApi = {
  async login(username: string, password: string) {
    const result = await request<AuthResult>('/auth/login', { method: 'POST', data: { username, password } })
    setAuthSession(result.token || '', result.user)
    return result.user
  },
  async me() {
    if (!usesBrowserCookie && !getAuthToken()) throw new Error('请先登录')
    const user = await request<AuthUser>('/auth/me')
    setAuthUser(user)
    return user
  },
  async changePassword(currentPassword: string, newPassword: string) {
    const result = await request<AuthResult>('/auth/password', {
      method: 'POST', data: { currentPassword, newPassword },
    })
    setAuthSession(result.token || '', result.user)
    return result.user
  },
  async logout() {
    try { if (usesBrowserCookie || hasAuthSessionHint()) await request('/auth/logout', { method: 'POST' }) }
    finally { clearAuthSession() }
  },
}
