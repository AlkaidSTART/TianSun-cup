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
  return value in routes
}

export function navigateToView(view: string) {
  if (!isAppView(view)) return

  const url = routes[view]
  const pages = getCurrentPages()
  const currentRoute = pages[pages.length - 1]?.route
  if (currentRoute && `/${currentRoute}` === url) return

  if (view === 'consultation') {
    uni.navigateTo({ url })
    return
  }

  uni.reLaunch({ url })
}
