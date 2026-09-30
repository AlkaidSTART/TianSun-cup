import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// 资源基础路径需与实际访问地址一致，否则 index.html 会引用不存在的
// /3d/assets/*.css、/3d/assets/*.js，导致页面无样式、脚本 404。
// - 默认 '/3d/'：由 services/api 的 Express 在 /3d/ 下托管（Docker 部署）
// - 直接静态部署到网站根目录：构建时设置 WEB_BASE_PATH=/
// - 部署到其他子路径：例如 WEB_BASE_PATH=/webgis/
function resolveBasePath() {
  const raw = (process.env.WEB_BASE_PATH || '/3d/').trim()
  if (!raw || raw === '/') return '/'
  const withLeadingSlash = raw.startsWith('/') ? raw : `/${raw}`
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`
}

export default defineConfig({
  base: resolveBasePath(),
  envPrefix: 'TIANDITU_',
  server: {
    watch: {
      ignored: ['**/.edge-profile-panel/**'],
    },
  },
  build: {
    rollupOptions: {
      input: {
        app: resolve(import.meta.dirname, 'index.html'),
        legacy: resolve(import.meta.dirname, 'legacy.html'),
      },
    },
  },
})
