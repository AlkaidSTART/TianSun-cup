import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import uniModule from '@dcloudio/vite-plugin-uni'

type UniPluginFactory = typeof import('@dcloudio/vite-plugin-uni')['default']
const uni = ((uniModule as unknown as { default?: UniPluginFactory }).default || uniModule) as UniPluginFactory

export default defineConfig({
  plugins: [uni()],
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
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
})
