import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // This allows the Cloudflare Tunnel URL to connect to your local server
    allowedHosts: true,
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
})