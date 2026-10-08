import { fileURLToPath, URL } from 'node:url'
import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { defineConfig, loadEnv } from 'vite'
import uniModule from '@dcloudio/vite-plugin-uni'
import { resolveMapToken } from '../../scripts/map-env.mjs'
import { buildMobileRuntime } from '../pasture-3d/scripts/build-mobile-runtime.mjs'
import type { ViteDevServer } from 'vite'

// Resolve from the actual Vue install (npm or pnpm), not a hoisted compiler's Vue 3.5 helpers.
const require = createRequire(import.meta.url)
const vueRequire = createRequire(realpathSync(require.resolve('vue/package.json')))

type UniPluginFactory = typeof import('@dcloudio/vite-plugin-uni')['default']
const uni = ((uniModule as unknown as { default?: UniPluginFactory }).default || uniModule) as UniPluginFactory

export default defineConfig(async ({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const repositoryEnv = loadEnv(mode, fileURLToPath(new URL('../../', import.meta.url)), '')
  const screenEnv = loadEnv(mode, fileURLToPath(new URL('../pasture-3d', import.meta.url)), '')
  const mapToken = resolveMapToken(process.env, env, screenEnv, repositoryEnv)
  let server: ViteDevServer | undefined
  const runtimeWatcher = await buildMobileRuntime({
    watch: command === 'serve',
    onRebuild: () => server?.ws.send({ type: 'full-reload' }),
  })

  return {
    base: '/app/',
    plugins: [uni(), {
      name: 'pasture-runtime-watch',
      configureServer(devServer: ViteDevServer) {
        server = devServer
        devServer.httpServer?.once('close', () => { void runtimeWatcher?.close() })
      },
    }],
    define: { __PASTURE_MAP_TOKEN__: JSON.stringify(mapToken) },
    resolve: {
      alias: {
        '@vue/shared': vueRequire.resolve('@vue/shared/dist/shared.esm-bundler.js'),
        'lucide-vue-next': fileURLToPath(new URL('./src/shims/lucide-vue-next.ts', import.meta.url)),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      // By default the API is the Docker Compose service published on host port 3000.
      proxy: {
        '/api': {
          target: env.API_PROXY_TARGET || 'http://127.0.0.1:3000',
          changeOrigin: true,
        },
      },
    },
  }
})
