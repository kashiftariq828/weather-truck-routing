/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Django runs on :8000 in development; same-origin in production.
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
  build: {
    // MapLibre is ~1.1 MB minified (~300 KB gzipped) and already split into its own chunk.
    chunkSizeWarningLimit: 1200,
  },
  test: {
    environment: 'node',
    // Let tests import stylesheets (theme.test.ts reads index.css?raw to check colour tokens).
    css: true,
  },
})
