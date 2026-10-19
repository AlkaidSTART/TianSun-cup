import { resolve } from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import { resolveMapToken } from '../../scripts/map-env.mjs'

// 资源基础路径需与实际访问地址一致，否则 index.html 会引用不存在的
// /3d/assets/*.css、/3d/assets/*.js，导致页面无样式、脚本 404。
// 可用 shell 环境变量或 apps/pasture-3d/.env(.local) 配置：
// - 默认 '/3d/'：由 services/api 的 Express 在 /3d/ 下托管（Docker 部署）
// - 直接静态部署到网站根目录：WEB_BASE_PATH=/
// - 部署到其他子路径：例如 WEB_BASE_PATH=/webgis/
function resolveBasePath(raw) {
  const value = (raw || '/3d/').trim()
  if (!value || value === '/') return '/'
  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, '')
  const rootEnv = loadEnv(mode, resolve(import.meta.dirname, '../..'), '')
  const mapToken = resolveMapToken(process.env, env, rootEnv)

  return {
    base: resolveBasePath(process.env.WEB_BASE_PATH || env.WEB_BASE_PATH),
    envPrefix: 'TIANDITU_',
    define: { 'import.meta.env.TIANDITU_TOKEN': JSON.stringify(mapToken) },
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
  }
})
