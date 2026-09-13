import jwt from 'jsonwebtoken'
import { loadAccessibleLesson } from './routes/lessons.js'
import {
  elementSchema,
  loadBoard,
  addElement,
  updateElement,
  deleteElement,
  clearBoard
} from './boardStore.js'

function readTokenCookie(cookieHeader) {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === 'lms_token') return decodeURIComponent(rest.join('='))
  }
  return null
}

export function setupSignaling(io) {
  io.use((socket, next) => {
    const token = readTokenCookie(socket.handshake.headers.cookie)
    if (!token) return next(new Error('Not authenticated'))

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET)
      socket.data.user = { id: payload.sub, role: payload.role, schoolId: payload.schoolId }
      next()
    } catch {
      next(new Error('Invalid session'))
    }
  })

  io.on('connection', (socket) => {
    const user = socket.data.user

    socket.on('join-lesson', async (lessonId, ack) => {
      const lesson = await loadAccessibleLesson(user, lessonId)
      if (!lesson) {
        if (typeof ack === 'function') ack({ error: 'No access to this lesson' })
        return
      }

      socket.data.roomId = lesson.roomId
      socket.data.lessonId = lesson.id
      socket.join(lesson.roomId)

      const peers = []
      for (const id of io.sockets.adapter.rooms.get(lesson.roomId) ?? []) {
        if (id === socket.id) continue
        const peer = io.sockets.sockets.get(id)
        if (peer) peers.push({ id, name: peer.data.name })
      }

      socket.data.name = lesson.teacherId === user.id
        ? lesson.teacher.name
        : lesson.enrollments.find((e) => e.studentId === user.id)?.student.name ?? 'Guest'

      socket.to(lesson.roomId).emit('user-joined', { id: socket.id, name: socket.data.name })
      if (typeof ack === 'function') ack({ peers, roomId: lesson.roomId })
    })

    const relayToPeer = (event) => (data) => {
      const room = socket.data.roomId
      if (!room || !data?.to) return

      const target = io.sockets.sockets.get(data.to)
      if (!target || target.data.roomId !== room) return

      target.emit(event, { ...data, from: socket.id })
    }

    socket.on('offer', relayToPeer('offer'))
    socket.on('answer', relayToPeer('answer'))
    socket.on('ice-candidate', relayToPeer('ice-candidate'))

    socket.on('drawing', (data) => {
      const room = socket.data.roomId
      if (!room) return
      socket.to(room).emit('drawing', { ...data, from: socket.id })
    })

    socket.on('screen-share-start', () => {
      const room = socket.data.roomId
      if (room) socket.to(room).emit('screen-share-started', { from: socket.id })
    })

    socket.on('screen-share-stop', () => {
      const room = socket.data.roomId
      if (room) socket.to(room).emit('screen-share-stopped', { from: socket.id })
    })

    socket.on('board:load', async (ack) => {
      const { lessonId } = socket.data
      if (!lessonId || typeof ack !== 'function') return
      ack({ elements: await loadBoard(lessonId) })
    })

    socket.on('board:add', async (raw) => {
      const { lessonId, roomId } = socket.data
      if (!lessonId) return

      const parsed = elementSchema.safeParse(raw)
      if (!parsed.success) return

      const element = { ...parsed.data, authorId: user.id }
      if (await addElement(lessonId, element)) {
        socket.to(roomId).emit('board:add', element)
      }
    })

    socket.on('board:update', async (raw) => {
      const { lessonId, roomId } = socket.data
      if (!lessonId) return

      const parsed = elementSchema.safeParse(raw)
      if (!parsed.success) return

      if (await updateElement(lessonId, parsed.data)) {
        socket.to(roomId).emit('board:update', parsed.data)
      }
    })

    socket.on('board:delete', async (elementId) => {
      const { lessonId, roomId } = socket.data
      if (!lessonId || typeof elementId !== 'string') return

      if (await deleteElement(lessonId, elementId)) {
        socket.to(roomId).emit('board:delete', elementId)
      }
    })

    socket.on('board:clear', async () => {
      const { lessonId, roomId } = socket.data
      if (!lessonId) return

      await clearBoard(lessonId)
      socket.to(roomId).emit('board:clear')
    })

    socket.on('disconnect', () => {
      const room = socket.data.roomId
      if (room) socket.to(room).emit('user-left', socket.id)
    })
  })
}
