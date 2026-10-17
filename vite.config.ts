import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['attendance-lamps-ist-unavailable.trycloudflare.com', 'rhythm-repeated-start-prices.trycloudflare.com'],
    proxy: { '/api': 'http://127.0.0.1:4180' },
  },
  preview: {
    allowedHosts: ['rhythm-repeated-start-prices.trycloudflare.com', 'attendance-lamps-ist-unavailable.trycloudflare.com'],
    proxy: { '/api': 'http://127.0.0.1:4180' },
  },
})
