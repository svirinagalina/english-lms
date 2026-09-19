import express from 'express'
// Lets a rejected promise in a route reach the error handler below instead
// of taking the whole process (and every call on it) down.
import 'express-async-errors'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import fs from 'node:fs'
import path from 'path'
import { fileURLToPath } from 'url'

import { authRouter } from './routes/auth.js'
import { usersRouter } from './routes/users.js'
import { invitesRouter } from './routes/invites.js'
import { classroomsRouter } from './routes/classrooms.js'
import { billingRouter } from './routes/billing.js'
import { unitsRouter } from './routes/units.js'
import { vocabRouter } from './routes/vocab.js'
import { statsRouter } from './routes/stats.js'
import { callsRouter } from './routes/calls.js'
import { assistRouter } from './routes/assist.js'
import { contentRouter } from './routes/content.js'
import { dictionaryRouter } from './routes/dictionary.js'
import { mistakesRouter } from './routes/mistakes.js'
import { lessonsRouter } from './routes/lessons.js'
import { trialsRouter } from './routes/trials.js'
import { settingsRouter } from './routes/settings.js'
import { diagRouter } from './routes/diag.js'
import { loadAiSettings } from './settings.js'
import { setupSignaling } from './signaling.js'
import { flushBoards } from './boardStore.js'
import { flushDocuments } from './docStore.js'

const app = express()
const httpServer = createServer(app)
// Behind Caddy: the client's address comes from X-Forwarded-For.
app.set('trust proxy', 1)
const clientOrigin = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173'

app.use(cors({ origin: clientOrigin, credentials: true }))
app.use(express.json({ limit: '8mb' }))
app.use(cookieParser())

app.use('/api/auth', authRouter)
app.use('/api/users', usersRouter)
app.use('/api/invites', invitesRouter)
app.use('/api/classrooms', classroomsRouter)
app.use('/api/billing', billingRouter)
app.use('/api/units', unitsRouter)
app.use('/api/vocab', vocabRouter)
app.use('/api/stats', statsRouter)
app.use('/api/calls', callsRouter)
app.use('/api/assist', assistRouter)
app.use('/api/content', contentRouter)
app.use('/api/dictionary', dictionaryRouter)
app.use('/api/mistakes', mistakesRouter)
app.use('/api/lessons', lessonsRouter)
app.use('/api/trials', trialsRouter)
app.use('/api/settings', settingsRouter)
app.use('/api/diag', diagRouter)

app.get('/api/health', (req, res) => res.json({ ok: true }))

// Changes with every deploy; the client reloads itself when it sees a new one.
const BUILD_ID = process.env.BUILD_ID ?? String(Date.now())
app.get('/api/version', (req, res) => res.json({ build: BUILD_ID }))

const uploadDir = process.env.UPLOAD_DIR
  ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../uploads')
app.use('/uploads', express.static(uploadDir, { maxAge: '30d', immutable: true }))

if (process.env.NODE_ENV === 'production') {
  const clientDist = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../public'
  )

  // A brotli twin made at build time is sent when the browser takes it:
  // a fifth of the bytes for scripts and the 12 MB blur runtime, which
  // matters on slow routes and phones. The proxy leaves it untouched.
  const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.tflite': 'application/octet-stream', '.svg': 'image/svg+xml', '.json': 'application/json', '.html': 'text/html' }
  const precompressed = (dir) => (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next()
    if (!/\bbr\b/.test(req.headers['accept-encoding'] ?? '')) return next()
    const ext = path.extname(req.path)
    if (!TYPES[ext]) return next()
    const file = path.join(dir, path.normalize(req.path))
    if (!file.startsWith(dir)) return next()
    fs.stat(`${file}.br`, (err, info) => {
      if (err || !info.isFile()) return next()
      res.set('Content-Encoding', 'br')
      res.set('Content-Type', `${TYPES[ext]}${ext === '.js' || ext === '.css' || ext === '.html' ? '; charset=utf-8' : ''}`)
      res.set('Vary', 'Accept-Encoding')
      res.sendFile(`${file}.br`, { maxAge: req.path.startsWith('/assets/') ? 31536000000 : req.path.startsWith('/mediapipe/') ? 2592000000 : 0, immutable: req.path.startsWith('/assets/') })
    })
  }
  app.use(precompressed(clientDist))
  // Hashed assets and the blur model/runtime never change under one name.
  app.use('/assets', express.static(path.join(clientDist, 'assets'), { maxAge: '365d', immutable: true }))
  app.use('/mediapipe', express.static(path.join(clientDist, 'mediapipe'), { maxAge: '30d' }))
  app.use('/backgrounds', express.static(path.join(clientDist, 'backgrounds'), { maxAge: '7d' }))
  // The page itself must never be cached, or a browser keeps running an
  // old bundle after a deploy.
  app.use(express.static(clientDist, { index: false }))
  app.get('*', (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.sendFile(path.join(clientDist, 'index.html'))
  })
}

// Last resort for anything a route did not handle itself.
app.use((error, req, res, next) => {
  console.error(`${req.method} ${req.originalUrl} failed:`, error)
  if (res.headersSent) return next(error)
  res.status(500).json({ error: 'Something went wrong on the server. Please try again.' })
})
process.on('unhandledRejection', (reason) => console.error('Unhandled rejection:', reason))

const io = new Server(httpServer, {
  cors: { origin: clientOrigin, credentials: true }
})
setupSignaling(io)

// The AI key saved from the Settings page, before the first request.
loadAiSettings().catch((error) => console.error('Could not load AI settings:', error.message))

const port = process.env.PORT ?? 4000
httpServer.listen(port, () => {
  console.log(`LMS server running on http://localhost:${port}`)
})

// A deploy stops the container with SIGTERM: write out the boards and
// documents that are still waiting for their debounced save, then leave.
let stopping = false
const shutdown = async (signal) => {
  if (stopping) return
  stopping = true
  console.log(`${signal}: saving pending work before exit`)
  const deadline = setTimeout(() => process.exit(1), 8000)
  try {
    await Promise.all([flushBoards(), flushDocuments()])
  } finally {
    clearTimeout(deadline)
    process.exit(0)
  }
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
