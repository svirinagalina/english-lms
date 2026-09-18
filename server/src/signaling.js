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
import { loadDocument, replaceDocument, runsSchema } from './docStore.js'

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

// Board shown in each call room: once someone with access opens it there,
// everyone in the room may follow, whatever classroom they belong to.
const roomBoards = new Map()
// Likewise for the writing document shown in a call (by classroom id).
const roomDocs = new Map()

// Everyone who currently has a board or a document open, by id — a board
// open in a call and the same board open from the classroom page are in
// different rooms, yet every stroke must reach both.
const boardWatchers = new Map()
const docWatchers = new Map()
const watch = (map, key, socket) => {
  if (!map.has(key)) map.set(key, new Set())
  map.get(key).add(socket)
}
const unwatch = (map, key, socket) => {
  const set = key && map.get(key)
  if (!set) return
  set.delete(socket)
  if (!set.size) map.delete(key)
}
const emitToWatchers = (map, key, socket, event, payload) => {
  for (const other of map.get(key) ?? []) if (other !== socket) other.emit(event, payload)
}

export function setupSignaling(io) {
  io.use(async (socket, next) => {
    const token = readTokenCookie(socket.handshake.headers.cookie)

    // Only members of the platform connect — calls, boards, everything.
    if (token) {
      try {
        const payload = jwt.verify(token, process.env.JWT_SECRET)
        socket.data.user = { id: payload.sub, role: payload.role, schoolId: payload.schoolId }
        return next()
      } catch {
        // stale or forged cookie: rejected below
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

      // A call is open to the teachers and students of the school that made it.
      if (call.schoolId !== user.schoolId) {
        if (typeof ack === 'function') ack({ error: 'This call is not available' })
        return
      }

      const profile = await prisma.user.findUnique({ where: { id: user.id }, select: { name: true } })
      socket.data.name = profile?.name ?? 'Participant'

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
        if (peer) peers.push({ id, name: peer.data.name, userId: peer.data.user?.id, muted: Boolean(peer.data.micMuted) })
      }

      socket.to(roomId).emit('user-joined', { id: socket.id, name: socket.data.name, userId: user.id })
      if (typeof ack === 'function') ack({ peers, name: socket.data.name, boardId: roomBoards.get(roomId) ?? null, docId: roomDocs.get(roomId) ?? null })
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

    // Text chat inside a call: relayed to the room, not stored.
    socket.on('chat:message', (payload) => {
      const room = socket.data.roomId
      const text = typeof payload?.text === 'string' ? payload.text.trim().slice(0, 2000) : ''
      if (!room || !text) return
      io.to(room).emit('chat:message', { from: socket.id, name: socket.data.name, text, at: Date.now() })
    })

    // A muted microphone shows on everyone's tile for that person.
    socket.on('mic:state', (state) => {
      const room = socket.data.roomId
      if (!room) return
      socket.data.micMuted = Boolean(state?.muted)
      socket.to(room).emit('mic:state', { from: socket.id, muted: socket.data.micMuted })
    })

    socket.on('screen-share-start', () => {
      const room = socket.data.roomId
      if (room) socket.to(room).emit('screen-share-started', { from: socket.id })
    })

    socket.on('screen-share-stop', () => {
      const room = socket.data.roomId
      if (room) socket.to(room).emit('screen-share-stopped', { from: socket.id })
    })

    // --- Whiteboards ---------------------------------------------------------

    // Everyone in the room looks at the same board at a time. A board may be
    // opened here when it belongs to this classroom, when this person has
    // access to its classroom, or when it is already the room's board.
    const boardBelongsHere = async (boardId) => {
      if (typeof boardId !== 'string') return false
      const board = await prisma.board.findUnique({ where: { id: boardId }, select: { classroomId: true, sharedWith: { select: { id: true } } } })
      if (!board) return false
      const { roomId, classroomId } = socket.data
      if (board.classroomId === classroomId) return true
      if (classroomId && board.sharedWith.some((c) => c.id === classroomId)) return true
      if (roomId && roomBoards.get(roomId) === boardId) return true
      const classroom = await accessibleClassroom(user, board.classroomId)
      if (!classroom) return false
      if (roomId) roomBoards.set(roomId, boardId)
      return true
    }

    socket.on('board:open', async (boardId, ack) => {
      if (!(await boardBelongsHere(boardId))) {
        if (typeof ack === 'function') ack({ error: 'Board not found' })
        return
      }

      unwatch(boardWatchers, socket.data.boardId, socket)
      socket.data.boardId = boardId
      watch(boardWatchers, boardId, socket)
      const elements = await loadBoard(boardId)
      // A teacher's switch leads the room; a student's is private to them.
      if (user.role !== 'STUDENT') {
        if (socket.data.callId) roomBoards.set(socket.data.roomId, boardId)
        socket.to(socket.data.roomId).emit('board:switched', boardId)
      }
      if (typeof ack === 'function') ack({ elements })
    })

    socket.on('board:add', async (raw) => {
      const { boardId, roomId } = socket.data
      if (!boardId) return

      const parsed = elementSchema.safeParse(raw)
      if (!parsed.success) return

      const element = { ...parsed.data, authorId: user.id }
      if (await addElement(boardId, element)) {
        emitToWatchers(boardWatchers, boardId, socket, 'board:add', element)
      }
    })

    socket.on('board:update', async (raw) => {
      const { boardId, roomId } = socket.data
      if (!boardId) return

      const parsed = elementSchema.safeParse(raw)
      if (!parsed.success) return

      if (await updateElement(boardId, parsed.data)) {
        emitToWatchers(boardWatchers, boardId, socket, 'board:update', parsed.data)
      }
    })

    socket.on('board:delete', async (elementId) => {
      const { boardId, roomId } = socket.data
      if (!boardId || typeof elementId !== 'string') return

      if (await deleteElement(boardId, elementId)) {
        emitToWatchers(boardWatchers, boardId, socket, 'board:delete', elementId)
      }
    })

    // Whoever closes the board in a call closes it for everyone there.
    socket.on('board:close', () => {
      const { roomId } = socket.data
      unwatch(boardWatchers, socket.data.boardId, socket)
      socket.data.boardId = null
      if (!roomId || user.role === 'STUDENT') return
      roomBoards.delete(roomId)
      socket.to(roomId).emit('board:closed')
    })

    // --- Writing documents ---------------------------------------------------
    // One per classroom. Opened in a call, it is shared with everyone there;
    // otherwise only the classroom's own teacher and student may open it.

    const docAllowed = async (classroomId) => {
      if (typeof classroomId !== 'string') return false
      const { roomId } = socket.data
      if (socket.data.classroomId === classroomId) return true
      if (roomId && roomDocs.get(roomId) === classroomId) return true
      const classroom = await accessibleClassroom(user, classroomId)
      return Boolean(classroom)
    }

    socket.on('doc:open', async (classroomId, ack) => {
      if (!(await docAllowed(classroomId))) {
        if (typeof ack === 'function') ack({ error: 'Document not found' })
        return
      }
      unwatch(docWatchers, socket.data.docId, socket)
      socket.data.docId = classroomId
      watch(docWatchers, classroomId, socket)
      if (user.role !== 'STUDENT' && socket.data.callId) roomDocs.set(socket.data.roomId, classroomId)
      let runs
      try {
        runs = await loadDocument(classroomId)
      } catch (error) {
        console.error('Document load failed:', error.message)
        if (typeof ack === 'function') ack({ error: 'Could not load the document' })
        return
      }
      if (user.role !== 'STUDENT') socket.to(socket.data.roomId).emit('doc:switched', classroomId)
      if (typeof ack === 'function') ack({ runs })
    })

    socket.on('doc:update', async (raw) => {
      const { docId, roomId } = socket.data
      if (!docId) return
      const parsed = runsSchema.safeParse(raw)
      if (!parsed.success) return
      replaceDocument(docId, parsed.data)
      emitToWatchers(docWatchers, docId, socket, 'doc:update', { classroomId: docId, runs: parsed.data, from: socket.id })
    })

    socket.on('doc:close', () => {
      const { roomId } = socket.data
      unwatch(docWatchers, socket.data.docId, socket)
      socket.data.docId = null
      if (!roomId || user.role === 'STUDENT') return
      roomDocs.delete(roomId)
      socket.to(roomId).emit('doc:closed')
    })

    // Spotlight: the teacher's viewport is broadcast so students' boards
    // follow it. Pure relay; the room decides what to do with it.
    socket.on('board:spotlight', (state) => {
      const { roomId } = socket.data
      if (!roomId) return
      socket.to(roomId).emit('board:spotlight', { from: socket.id, name: socket.data.name, on: Boolean(state?.on) })
    })
    socket.on('board:view', (view) => {
      const { roomId } = socket.data
      if (!roomId || typeof view?.scale !== 'number') return
      socket.to(roomId).emit('board:view', { from: socket.id, scale: view.scale, cx: Number(view.cx) || 0, cy: Number(view.cy) || 0 })
    })

    socket.on('board:clear', async () => {
      const { boardId, roomId } = socket.data
      if (!boardId) return

      await clearBoard(boardId)
      emitToWatchers(boardWatchers, boardId, socket, 'board:clear')
    })

    socket.on('disconnect', async () => {
      unwatch(boardWatchers, socket.data.boardId, socket)
      unwatch(docWatchers, socket.data.docId, socket)
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
      // An empty call room is over: the call ends so nothing piles up. The
      // link stays usable for 15 minutes in case someone reconnects.
      if (stillOnCall === 0 && socket.data.callId) {
        const callId = socket.data.callId
        setTimeout(async () => {
          const still = [...(io.sockets.adapter.rooms.get(roomId) ?? [])].length
          if (still) return
          await prisma.call.updateMany({ where: { id: callId, endedAt: null }, data: { endedAt: new Date() } }).catch(() => {})
          roomBoards.delete(roomId)
          roomDocs.delete(roomId)
        }, 15 * 60 * 1000)
      }
    })
  })
}
