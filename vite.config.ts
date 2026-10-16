import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['attendance-lamps-ist-unavailable.trycloudflare.com'],
  },
  preview: {
    allowedHosts: ['rhythm-repeated-start-prices.trycloudflare.com'],
  },
})
