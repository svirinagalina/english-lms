import jwt from 'jsonwebtoken'
import { prisma } from './db.js'
import { accessibleClassroom } from './routes/classrooms.js'
import {
  elementSchema,
  loadBoard,
  addElement,
  updateElement,
  deleteElement,
  clearBoard
} from './boardStore.js'

// A call that resumes within this window continues the previous session rather
// than counting as a second lesson — reconnects should not inflate the count.
const SESSION_RESUME_MS = 15 * 60 * 1000

function readTokenCookie(cookieHeader) {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === 'lms_token') return decodeURIComponent(rest.join('='))
  }
  return null
}

async function openSession(classroomId) {
  const recent = await prisma.session.findFirst({
    where: { classroomId },
    orderBy: { startedAt: 'desc' }
  })

  if (recent && !recent.endedAt) return recent
  if (recent?.endedAt && Date.now() - recent.endedAt.getTime() < SESSION_RESUME_MS) {
    return prisma.session.update({ where: { id: recent.id }, data: { endedAt: null } })
  }

  return prisma.session.create({ data: { classroomId } })
}

async function closeSession(classroomId) {
  const open = await prisma.session.findFirst({
    where: { classroomId, endedAt: null },
    orderBy: { startedAt: 'desc' }
  })
  if (open) {
    await prisma.session.update({ where: { id: open.id }, data: { endedAt: new Date() } })
  }
}

export function setupSignaling(io) {
  io.use(async (socket, next) => {
    const token = readTokenCookie(socket.handshake.headers.cookie)

    if (token) {
      try {
        const payload = jwt.verify(token, process.env.JWT_SECRET)
        socket.data.user = { id: payload.sub, role: payload.role, schoolId: payload.schoolId }
        return next()
      } catch {
        // fall through: a stale cookie should not block a guest join
      }
    }

    // Guests carry the call token and a display name instead of a session.
    const { callToken, guestName } = socket.handshake.auth ?? {}
    if (typeof callToken === 'string' && typeof guestName === 'string' && guestName.trim()) {
      const call = await prisma.call.findUnique({ where: { token: callToken } })
      if (call && !call.endedAt) {
        socket.data.guest = { callToken, name: guestName.trim().slice(0, 60) }
        return next()
      }
    }

    next(new Error('Not authenticated'))
  })

  io.on('connection', (socket) => {
    const user = socket.data.user

    // withCall marks a real lesson; opening the room to look at materials
    // or edit a board must not count as one.
    socket.on('join-classroom', async (classroomId, options, ack) => {
      if (typeof options === 'function') { ack = options; options = {} }
      if (!user) {
        if (typeof ack === 'function') ack({ error: 'Sign in required' })
        return
      }
      const classroom = await accessibleClassroom(user, classroomId)
      if (!classroom) {
        if (typeof ack === 'function') ack({ error: 'No access to this classroom' })
        return
      }

      socket.data.classroomId = classroom.id
      socket.data.roomId = classroom.roomId
      socket.join(classroom.roomId)

      const profile = await prisma.user.findUnique({
        where: { id: user.id },
        select: { name: true }
      })
      socket.data.name = profile?.name ?? 'Participant'

      const session = options?.withCall ? await openSession(classroom.id) : null
      socket.data.inCall = Boolean(options?.withCall)

      const peers = []
      for (const id of io.sockets.adapter.rooms.get(classroom.roomId) ?? []) {
        if (id === socket.id) continue
        const peer = io.sockets.sockets.get(id)
        if (peer) peers.push({ id, name: peer.data.name })
      }

      socket.to(classroom.roomId).emit('user-joined', { id: socket.id, name: socket.data.name })
      if (typeof ack === 'function') {
        ack({ peers, sessionId: session?.id ?? null, startedAt: session?.startedAt ?? null })
      }
    })

    socket.on('join-call', async (callToken, ack) => {
      const call = await prisma.call.findUnique({
        where: { token: callToken },
        include: { classroom: { select: { id: true, roomId: true } } }
      })
      if (!call || call.endedAt) {
        if (typeof ack === 'function') ack({ error: 'This call is not available' })
        return
      }

      // A guest may only enter the call whose token they authenticated with.
      if (socket.data.guest && socket.data.guest.callToken !== callToken) {
        if (typeof ack === 'function') ack({ error: 'Not allowed' })
        return
      }

      // Members of the school join with their real name; guests with the one they typed.
      if (socket.data.user) {
        const profile = await prisma.user.findUnique({ where: { id: socket.data.user.id }, select: { name: true } })
        socket.data.name = profile?.name ?? 'Participant'
      } else {
        socket.data.name = socket.data.guest.name
      }

      const roomId = `call:${call.token}`
      socket.data.roomId = roomId
      socket.data.callId = call.id
      socket.data.classroomId = call.classroom?.id ?? null
      socket.data.inCall = true
      socket.join(roomId)

      // Calls tied to a student's classroom count as lessons.
      if (call.classroom) await openSession(call.classroom.id)

      const peers = []
      for (const id of io.sockets.adapter.rooms.get(roomId) ?? []) {
        if (id === socket.id) continue
        const peer = io.sockets.sockets.get(id)
        if (peer) peers.push({ id, name: peer.data.name })
      }

      socket.to(roomId).emit('user-joined', { id: socket.id, name: socket.data.name })
      if (typeof ack === 'function') ack({ peers, name: socket.data.name })
    })

    socket.on('call:start', async (ack) => {
      const { classroomId } = socket.data
      if (!classroomId) return

      const session = await openSession(classroomId)
      socket.data.inCall = true
      if (typeof ack === 'function') ack({ sessionId: session.id, startedAt: session.startedAt })
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

    socket.on('screen-share-start', () => {
      const room = socket.data.roomId
      if (room) socket.to(room).emit('screen-share-started', { from: socket.id })
    })

    socket.on('screen-share-stop', () => {
      const room = socket.data.roomId
      if (room) socket.to(room).emit('screen-share-stopped', { from: socket.id })
    })

    // --- Whiteboards ---------------------------------------------------------

    // Everyone in the classroom looks at the same board at a time.
    const boardBelongsHere = async (boardId) => {
      if (socket.data.guest) return false
      if (!socket.data.classroomId || typeof boardId !== 'string') return false
      const board = await prisma.board.findFirst({
        where: { id: boardId, classroomId: socket.data.classroomId },
        select: { id: true }
      })
      return Boolean(board)
    }

    socket.on('board:open', async (boardId, ack) => {
      if (!(await boardBelongsHere(boardId))) {
        if (typeof ack === 'function') ack({ error: 'Board not found' })
        return
      }

      socket.data.boardId = boardId
      const elements = await loadBoard(boardId)
      socket.to(socket.data.roomId).emit('board:switched', boardId)
      if (typeof ack === 'function') ack({ elements })
    })

    socket.on('board:add', async (raw) => {
      const { boardId, roomId } = socket.data
      if (!boardId) return

      const parsed = elementSchema.safeParse(raw)
      if (!parsed.success) return

      const element = { ...parsed.data, authorId: user?.id ?? 'guest' }
      if (await addElement(boardId, element)) {
        socket.to(roomId).emit('board:add', element)
      }
    })

    socket.on('board:update', async (raw) => {
      const { boardId, roomId } = socket.data
      if (!boardId) return

      const parsed = elementSchema.safeParse(raw)
      if (!parsed.success) return

      if (await updateElement(boardId, parsed.data)) {
        socket.to(roomId).emit('board:update', parsed.data)
      }
    })

    socket.on('board:delete', async (elementId) => {
      const { boardId, roomId } = socket.data
      if (!boardId || typeof elementId !== 'string') return

      if (await deleteElement(boardId, elementId)) {
        socket.to(roomId).emit('board:delete', elementId)
      }
    })

    socket.on('board:clear', async () => {
      const { boardId, roomId } = socket.data
      if (!boardId) return

      await clearBoard(boardId)
      socket.to(roomId).emit('board:clear')
    })

    socket.on('disconnect', async () => {
      const { roomId, classroomId } = socket.data
      if (!roomId) return

      socket.to(roomId).emit('user-left', socket.id)

      // Close the session once nobody is left on the call.
      let stillOnCall = 0
      for (const id of io.sockets.adapter.rooms.get(roomId) ?? []) {
        if (io.sockets.sockets.get(id)?.data.inCall) stillOnCall++
      }

      if (stillOnCall === 0 && classroomId && socket.data.inCall) {
        await closeSession(classroomId).catch((error) =>
          console.error('Could not close session:', error.message)
        )
      }
    })
  })
}
