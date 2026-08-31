import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

// base './' обязателен: продовая сборка Electron грузит index.html через file://
export default defineConfig({
  base: './',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1600, // Phaser большой, предупреждение не критично
  },
  test: {
    environment: 'jsdom', // window/localStorage для meta-store
    include: ['tests/**/*.test.ts'],
  },
});
