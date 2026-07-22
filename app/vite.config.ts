import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5179,
  },
  build: {
    // C++/comments are Shiki grammars loaded only when that code-block language is selected.
    // Route-level application chunks remain below the default 500 kB threshold.
    chunkSizeWarningLimit: 900,
  },
})
