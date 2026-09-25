import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: 'client',
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./client/src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  build: { outDir: '../dist/client', emptyOutDir: true },
  server: {
    port: 5173,
    // Keep the browser's Host header: the server refuses requests whose Origin and Host differ.
    proxy: {
      '/api': { target: 'http://localhost:3000' },
      '/mcp': { target: 'http://localhost:3000' },
      '/calendar/': { target: 'http://localhost:3000' },
    },
  },
});
