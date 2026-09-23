import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import uniModule from '@dcloudio/vite-plugin-uni'

type UniPluginFactory = typeof import('@dcloudio/vite-plugin-uni')['default']
const uni = ((uniModule as unknown as { default?: UniPluginFactory }).default || uniModule) as UniPluginFactory

function normalizeMiniProgramChunkNames(): Plugin {
  return {
    name: 'normalize-mini-program-chunk-names',
    enforce: 'post',
    config(config) {
      if (process.env.UNI_PLATFORM !== 'mp-weixin') {
        return
      }

      const output = config.build?.rollupOptions?.output
      if (!output || Array.isArray(output)) {
        return
      }

      const originalChunkFileNames = output.chunkFileNames
      output.chunkFileNames = (chunk) => {
        const filename =
          typeof originalChunkFileNames === 'function'
            ? originalChunkFileNames(chunk)
            : typeof originalChunkFileNames === 'string'
              ? originalChunkFileNames.replace(/\[name\]/g, chunk.name)
              : `${chunk.name}.js`

        return String(filename).replace(/^(?:\.\.\/)+/, '')
      }
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    base: '/app/',
    plugins: [uni(), normalizeMiniProgramChunkNames()],
    resolve: {
      alias: {
        'lucide-vue-next': fileURLToPath(new URL('./src/shims/lucide-vue-next.ts', import.meta.url)),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: env.API_PROXY_TARGET || 'http://127.0.0.1:3000',
          changeOrigin: true,
        },
      },
    },
  }
})
