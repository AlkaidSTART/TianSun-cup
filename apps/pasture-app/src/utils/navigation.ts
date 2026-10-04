import { hasAuthSessionHint, goToLogin } from '../services/session'

export type AppView = 'dashboard' | 'alerts' | 'livestock' | 'pasture' | 'profile' | 'consultation'

const routes: Record<AppView, string> = {
  dashboard: '/pages/dashboard/index',
  alerts: '/pages/alerts/index',
  livestock: '/pages/livestock/index',
  pasture: '/pages/pasture/index',
  profile: '/pages/profile/index',
  consultation: '/pages/consultation/index',
}

export function isAppView(value: string): value is AppView {
  return Object.prototype.hasOwnProperty.call(routes, value)
}

export function navigateToView(view: string) {
  if (!isAppView(view)) return
  if (!hasAuthSessionHint()) { goToLogin(); return }

  const url = routes[view]
  const pages = getCurrentPages()
  const currentRoute = pages[pages.length - 1]?.route
  if (currentRoute && `/${currentRoute}` === url) return

  // Let uni-app update its router and page stack along with the browser URL.
  if (currentRoute === 'pages/login/index') {
    uni.reLaunch({ url })
  } else if (view === 'consultation') {
    uni.navigateTo({ url })
  } else {
    uni.redirectTo({ url })
  }
}
