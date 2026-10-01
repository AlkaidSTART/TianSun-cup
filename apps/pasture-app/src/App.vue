<script setup lang="ts">
import { onLaunch, onShow } from '@dcloudio/uni-app'
import { getAuthToken, goToLogin, usesBrowserCookie } from './services/session'
import { authApi } from './services/authApi'

onLaunch(() => {
  console.info('Smart pasture app launched')
})

onShow(async () => {
  const pages = getCurrentPages()
  const route = pages[pages.length - 1]?.route
  if (!route || route === 'pages/login/index') return
  if (!usesBrowserCookie && !getAuthToken()) { goToLogin(); return }
  try {
    const user = await authApi.me()
    if (user.mustChangePassword) goToLogin()
  } catch {
    goToLogin()
  }
})
</script>

<style>
@import './styles.css';
@import './design-source.css';
@import './secondary-source.css';
</style>
