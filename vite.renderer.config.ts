import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// Vite config for the renderer (Vue SPA)
export default defineConfig({
  plugins: [vue()],
});
