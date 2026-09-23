import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/3d/',
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
