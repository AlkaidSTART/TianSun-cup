import { hasAuthSessionHint, goToLogin } from '../services/session'

export type AppView = 'dashboard' | 'alerts' | 'livestock' | 'pasture' | 'profile' | 'consultation' | 'help'

const routes: Record<AppView, string> = {
  dashboard: '/pages/dashboard/index',
  alerts: '/pages/alerts/index',
  livestock: '/pages/livestock/index',
  pasture: '/pages/pasture/index',
  profile: '/pages/profile/index',
  consultation: '/pages/consultation/index',
  help: '/pages/help/index',
}

// 以子页面形式叠加在当前页之上的视图（带返回按钮），其余视图会替换当前页。
const stackViews: ReadonlySet<AppView> = new Set(['consultation', 'help'])

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
  } else if (stackViews.has(view)) {
    uni.navigateTo({ url })
  } else {
    uni.redirectTo({ url })
  }
}
