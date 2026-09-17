import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    watch: {
      // Ignore temporary browser automation profiles if one is left in the workspace.
      ignored: ['**/.edge-profile-panel/**']
    }
  },
  build: {
    rollupOptions: {
      input: {
        app: resolve(import.meta.dirname, 'index.html'),
        legacy: resolve(import.meta.dirname, 'legacy.html')
      }
    }
  }
});
