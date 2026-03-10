import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // In local dev: /api/generate → http://localhost:3001/api/generate
      // On Vercel: /api/generate → api/generate.js serverless function (no proxy needed)
      '/api': {
        target:      'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
