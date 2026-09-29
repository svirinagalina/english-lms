import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'

// The blur runtime's exact version, for its jsDelivr URL (videoProcessor.js).
const mediapipeVersion = JSON.parse(readFileSync(new URL('./node_modules/@mediapipe/tasks-vision/package.json', import.meta.url))).version

export default defineConfig({
  plugins: [react()],
  define: { __MEDIAPIPE_VERSION__: JSON.stringify(mediapipeVersion) },
  server: {
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/uploads': { target: 'http://localhost:4000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:4000', ws: true }
    }
  }
})
