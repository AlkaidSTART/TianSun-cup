import { ref } from 'vue'

export interface AuthUser {
  id: string
  username: string
  displayName: string
  role: 'admin' | 'operator'
  isActive: boolean
  mustChangePassword: boolean
}

const tokenKey = 'tiansun_auth_token'
const browserHintKey = 'tiansun_browser_session'
export const usesBrowserCookie = (() => {
  let browser = false
  // #ifdef H5
  browser = true
  // #endif
  return browser
})()
export const currentUser = ref<AuthUser | null>(null)

export function getAuthToken(): string {
  try {
    if (usesBrowserCookie) {
      // Remove any bearer token left by the older H5 implementation.
      uni.removeStorageSync(tokenKey)
      return ''
    }
    return String(uni.getStorageSync(tokenKey) || '')
  } catch { return '' }
}

export function hasAuthSessionHint(): boolean {
  try {
    if (usesBrowserCookie) {
      getAuthToken() // purge legacy H5 bearer tokens
      return uni.getStorageSync(browserHintKey) === '1'
    }
    return Boolean(getAuthToken())
  } catch { return false }
}

export function setAuthSession(token: string, user: AuthUser) {
  if (usesBrowserCookie) {
    uni.removeStorageSync(tokenKey)
    uni.setStorageSync(browserHintKey, '1')
  } else {
    uni.setStorageSync(tokenKey, token)
  }
  currentUser.value = user
}

export function setAuthUser(user: AuthUser) {
  if (usesBrowserCookie) uni.setStorageSync(browserHintKey, '1')
  currentUser.value = user
}

export function clearAuthSession() {
  try {
    uni.removeStorageSync(tokenKey)
    uni.removeStorageSync(browserHintKey)
  } catch { /* already cleared */ }
  currentUser.value = null
}

export function goToLogin() {
  const pages = getCurrentPages()
  if (pages[pages.length - 1]?.route !== 'pages/login/index') {
    uni.reLaunch({ url: '/pages/login/index' })
  }
}
