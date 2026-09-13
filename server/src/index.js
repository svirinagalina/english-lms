import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import path from 'path'
import { fileURLToPath } from 'url'

import { authRouter } from './routes/auth.js'
import { usersRouter } from './routes/users.js'
import { lessonsRouter } from './routes/lessons.js'
import { billingRouter } from './routes/billing.js'
import { unitsRouter } from './routes/units.js'
import { vocabRouter } from './routes/vocab.js'
import { setupSignaling } from './signaling.js'

const app = express()
const httpServer = createServer(app)
const clientOrigin = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173'

app.use(cors({ origin: clientOrigin, credentials: true }))
app.use(express.json())
app.use(cookieParser())

app.use('/api/auth', authRouter)
app.use('/api/users', usersRouter)
app.use('/api/lessons', lessonsRouter)
app.use('/api/billing', billingRouter)
app.use('/api/units', unitsRouter)
app.use('/api/vocab', vocabRouter)

app.get('/api/health', (req, res) => res.json({ ok: true }))

if (process.env.NODE_ENV === 'production') {
  const clientDist = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../public'
  )

  app.use(express.static(clientDist))
  app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')))
}

const io = new Server(httpServer, {
  cors: { origin: clientOrigin, credentials: true }
})
setupSignaling(io)

const port = process.env.PORT ?? 4000
httpServer.listen(port, () => {
  console.log(`LMS server running on http://localhost:${port}`)
})
