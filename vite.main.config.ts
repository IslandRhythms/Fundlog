import { defineConfig } from 'vite';

// Vite config for Electron main process
export default defineConfig({
  build: {
    rollupOptions: {
      // Keep better-sqlite3 as a native dependency, not bundled
      external: ['better-sqlite3'],
    },
  },
  optimizeDeps: {
    // Don't try to prebundle the native module
    exclude: ['better-sqlite3'],
  },
});
