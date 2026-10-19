import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'

// The blur runtime's exact version, for its jsDelivr URL (videoProcessor.js).
const mediapipeVersion = JSON.parse(readFileSync(new URL('./node_modules/@mediapipe/tasks-vision/package.json', import.meta.url))).version

// API_PORT lets a second local server run next to the usual one on 4000.
const api = `http://localhost:${process.env.API_PORT ?? 4000}`

export default defineConfig({
  plugins: [react()],
  define: { __MEDIAPIPE_VERSION__: JSON.stringify(mediapipeVersion) },
  server: {
    proxy: {
      '/api': { target: api, changeOrigin: true },
      '/uploads': { target: api, changeOrigin: true },
      '/socket.io': { target: api, ws: true }
    }
  }
})
