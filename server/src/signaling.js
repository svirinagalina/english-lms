import jwt from 'jsonwebtoken'
import { prisma } from './db.js'
import { PARTNER_READ_ONLY } from './auth.js'
import { accessibleClassroom } from './routes/classrooms.js'
import {
  elementSchema,
  tidyElement,
  loadBoard,
  studentMayChange,
  addElement,
  updateElement,
  deleteElement,
  clearBoard,
  forgetBoard
} from './boardStore.js'
import { loadDocument, replaceDocument, runsSchema, HOMEWORK_PREFIX } from './docStore.js'
import { buildSummary } from './lessonSummary.js'
import { adventCallPresence, adventCallEnded } from './adventLessons.js'
import { trialCallEnded } from './trialReport.js'
import { sfuEnabled, sfuJoin, sfuKick } from './sfu.js'
import { notifyHomeworkLater, notifyAfterLessonLater } from './push.js'
import { isUnpaidLead } from './trialCalls.js'

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

// Group lessons in progress: call room → the classrooms of its students.
const groupSessions = new Map()

async function openSession(classroomId, { counted = true, callId = null } = {}) {
  const recent = await prisma.session.findFirst({
    where: { classroomId },
    orderBy: { startedAt: 'desc' }
  })

  // A reconnect continues the session — but a trial never merges into a
  // paid lesson or the other way round.
  if (recent && !recent.endedAt && recent.counted === counted) return recent
  if (recent?.endedAt && recent.counted === counted && Date.now() - recent.endedAt.getTime() < SESSION_RESUME_MS) {
    return prisma.session.update({ where: { id: recent.id }, data: { endedAt: null } })
  }

  // A trial lesson is held but never uses up a paid lesson.
  return prisma.session.create({ data: { classroomId, counted, callId } })
}

// The same test as the student's Homework tile (/classrooms/home).
const isHomeworkHeading = (element) => (element.type === 'text' || element.type === 'note') && typeof element.text === 'string' &&
  /^[—\-\s]*homework\b/i.test(element.text.replace(/\{\{#[0-9a-f]{6}:([^}]*)\}\}/gi, '$1').replace(/\*\*|__|~~/g, '').trim())

// Lets a route push an element onto a board everyone watching sees at once.
export function broadcastBoardAdd(boardId, element) {
  for (const socket of boardWatchers.get(boardId) ?? []) socket.emit('board:add', element)
}

async function closeSession(classroomId) {
  const open = await prisma.session.findFirst({
    where: { classroomId, endedAt: null },
    orderBy: { startedAt: 'desc' }
  })
  if (open) {
    await prisma.session.update({ where: { id: open.id }, data: { endedAt: new Date() } })
    // The lesson's summary: topics, words, mistakes, questions for next time.
    buildSummary(open.id).catch((error) => console.error('Lesson summary failed:', error.message))
    // And the student's phone: what the lesson added to practise.
    notifyAfterLessonLater(open.id)
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
// Which board is spotlighted, by whom, and their last view (see board:spotlight).
const boardSpotlights = new Map()
// The spotlighter left the board (another board, or gone): the others stop following.
function endSpotlight(socket) {
  const boardId = socket.data.boardId
  if (!boardId || boardSpotlights.get(boardId)?.from !== socket.id) return
  boardSpotlights.delete(boardId)
  emitToWatchers(boardWatchers, boardId, socket, 'board:spotlight', { from: socket.id, on: false })
}

const emitToWatchers = (map, key, socket, event, payload) => {
  for (const other of map.get(key) ?? []) if (other !== socket) other.emit(event, payload)
}

// Open calls nobody is in any more get closed by a sweep every few minutes.
// The 15-minute timer on the last person's exit (below) does it too, but it
// lives in memory: a deploy or restart inside those 15 minutes lost it, and a
// call nobody ever entered (a double-clicked "Start call") never started one
// — 47 calls had piled up open that way.
const SWEEP_EVERY_MS = 5 * 60 * 1000
const EMPTY_GRACE_MS = 15 * 60 * 1000 // after the last person left: time to reconnect
const UNSEEN_GRACE_MS = 60 * 60 * 1000 // nobody seen in it since this server started
const STALE_MS = 3 * 60 * 60 * 1000
const SCRATCH_MAX_AGE_MS = 24 * 60 * 60 * 1000
const serverStartedAt = Date.now()
const callLastSeen = new Map() // call id → when someone was last in its room
let signalingIo = null
// How each call room carries media: 'sfu' (through the media server) or
// 'p2p'. Decided by whoever joins an empty room, so everyone in one call
// uses the same; switching it in Settings affects calls started afterwards.
const callModes = new Map()

// How many people are in a call's room right now (0 before signaling starts).
export function callRoomSize(token) {
  return signalingIo?.sockets.adapter.rooms.get(`call:${token}`)?.size ?? 0
}

export function setupSignaling(io) {
  signalingIo = io
  const sweepCalls = async () => {
    try {
      const open = await prisma.call.findMany({ where: { endedAt: null }, select: { id: true, token: true, createdAt: true, lastActiveAt: true } })
      const now = Date.now()
      const idle = []
      for (const call of open) {
        if (io.sockets.adapter.rooms.get(`call:${call.token}`)?.size) {
          callLastSeen.set(call.id, now)
          // Remembered in the database too, so a restart (a deploy) does not
          // make a finished call look fresh and keep it open for another hour.
          if (!call.lastActiveAt || now - call.lastActiveAt.getTime() > 60 * 1000) {
            await prisma.call.update({ where: { id: call.id }, data: { lastActiveAt: new Date(now) } }).catch(() => {})
          }
          continue
        }
        const seen = callLastSeen.get(call.id) ?? call.lastActiveAt?.getTime()
        const since = seen ?? Math.max(call.createdAt.getTime(), serverStartedAt)
        // Unseen and over three hours old: no one is coming back to it (a
        // student's "Join call" stops offering it after three hours anyway).
        const abandoned = !seen && now - call.createdAt.getTime() > STALE_MS
        if (abandoned || now - since > (seen ? EMPTY_GRACE_MS : UNSEEN_GRACE_MS)) idle.push(call.id)
      }
      if (idle.length) {
        await prisma.call.updateMany({ where: { id: { in: idle }, endedAt: null }, data: { endedAt: new Date() } })
        for (const id of idle) { callLastSeen.delete(id); adventCallEnded(id).catch(() => {}); trialCallEnded(id).catch(() => {}) }
        console.log(`Closed ${idle.length} idle call(s)`)
      }
      // Scratch boards belong to one call each; a restart can orphan them.
      const openBoards = new Set(roomBoards.values())
      const oldScratch = await prisma.board.findMany({ where: { scratch: true, updatedAt: { lt: new Date(now - SCRATCH_MAX_AGE_MS) } }, select: { id: true } })
      for (const { id } of oldScratch) {
        if (openBoards.has(id)) continue
        await prisma.board.delete({ where: { id } }).catch(() => {})
        forgetBoard(id)
      }
    } catch (error) {
      console.error('Call sweep failed:', error.message)
    }
  }
  setTimeout(sweepCalls, 60 * 1000)
  setInterval(sweepCalls, SWEEP_EVERY_MS)

  // Open sockets per address: a tab holds one, a school's class a few dozen.
  const socketsPerIp = new Map()
  io.use((socket, next) => {
    const ip = socket.handshake.headers['x-forwarded-for']?.split(',')[0].trim() || socket.handshake.address
    const count = socketsPerIp.get(ip) ?? 0
    if (count >= 60) return next(new Error('Too many connections'))
    socketsPerIp.set(ip, count + 1)
    socket.on('disconnect', () => {
      const left = (socketsPerIp.get(ip) ?? 1) - 1
      if (left > 0) socketsPerIp.set(ip, left)
      else socketsPerIp.delete(ip)
    })
    next()
  })
  io.use(async (socket, next) => {
    const token = readTokenCookie(socket.handshake.headers.cookie)

    // Only members of the platform connect — calls, boards, everything.
    // The role comes from the database, as for API requests, so a removed
    // account or a changed role takes effect on the next connection.
    if (token) {
      try {
        const payload = jwt.verify(token, process.env.JWT_SECRET)
        const user = await prisma.user.findUnique({
          where: { id: payload.sub },
          select: { id: true, role: true, schoolId: true, free: true }
        })
        if (user) {
          socket.data.user = user
          return next()
        }
      } catch {
        // stale or forged cookie: rejected below
      }
    }

    next(new Error('Not authenticated'))
  })

const PARTNER_BLOCKED_EVENTS = new Set(['call:start', 'drawing', 'board:add', 'board:update', 'board:delete', 'board:clear', 'doc:update'])

  io.on('connection', (socket) => {
    const user = socket.data.user

    // A partner only looks: no board, drawing or Writing edits, no starting a
    // call (see partnerReadOnly in auth.js).
    if (user.role === 'PARTNER') {
      socket.use(([event, ...args], next) => {
        if (!PARTNER_BLOCKED_EVENTS.has(event)) return next()
        const ack = args[args.length - 1]
        if (typeof ack === 'function') ack({ error: PARTNER_READ_ONLY.error })
      })
    }

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

      const profile = await prisma.user.findUnique({
        where: { id: user.id },
        select: { name: true }
      })
      socket.data.name = profile?.name ?? 'Participant'
      const session = options?.withCall ? await openSession(classroom.id) : null

      // Joining and listing who is already here happen in one go, with no
      // await in between: two people arriving together must not each see
      // the other as "already there" and both make an offer.
      socket.data.classroomId = classroom.id
      socket.data.roomId = classroom.roomId
      socket.data.inCall = Boolean(options?.withCall)
      socket.join(classroom.roomId)

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
        include: { classroom: { select: { id: true, roomId: true, studentId: true } } }
      })
      if (!call || call.endedAt) {
        if (typeof ack === 'function') ack({ error: 'This call is not available' })
        return
      }

      // A call is open to everyone signed in to the school that made it —
      // free accounts too: guests join free, only hosting needs a plan.
      if (call.schoolId !== user.schoolId) {
        if (typeof ack === 'function') ack({ error: 'This call is not available' })
        return
      }

      const profile = await prisma.user.findUnique({ where: { id: user.id }, select: { name: true } })
      socket.data.name = profile?.name ?? 'Participant'

      // Calls tied to a student's classroom count as lessons (trials do not)
      // — once the student is actually there. A teacher who opened the call
      // and waited alone used to use up one of the student's paid lessons.
      if (call.classroom) {
        const studentHere = user.id === call.classroom.studentId ||
          [...(io.sockets.adapter.rooms.get(`call:${call.token}`) ?? [])].some((id) => io.sockets.sockets.get(id)?.data.user?.id === call.classroom.studentId)
        // A trial — or any lesson with a trial student who hasn't paid — is never counted.
        if (studentHere) await openSession(call.classroom.id, { counted: call.kind !== 'TRIAL' && !(await isUnpaidLead(call.classroom.studentId)) })
      }

      // A group lesson: a call on a board shared with several students. The
      // moment one of them is there, it is a lesson for every student of the
      // group — charged whether they came or not (Galina, 2026-10-15). The
      // sessions close with the call (groupSessions, see 'disconnect').
      if (!call.classroom && call.boardId && user.role === 'STUDENT' && !groupSessions.has(`call:${call.token}`)) {
        const group = await prisma.classroom.findMany({
          where: { schoolId: call.schoolId, studentId: { not: null }, sharedBoards: { some: { id: call.boardId } } },
          select: { id: true, studentId: true }
        })
        if (group.length > 1 && group.some((c) => c.studentId === user.id)) {
          groupSessions.set(`call:${call.token}`, group.map((c) => c.id))
          for (const c of group) {
            await openSession(c.id, { counted: call.kind !== 'TRIAL' && !(await isUnpaidLead(c.studentId)), callId: call.id })
              .catch((error) => console.error('Group session failed:', error.message))
          }
        }
      }

      // Join and list the others without an await in between (see above).
      const roomId = `call:${call.token}`
      // A student coming back by the link (a dropped connection, another
      // device) replaces their older copy, which otherwise stayed in the call
      // as a frozen picture. Staff may be in on two devices on purpose.
      if (user.role === 'STUDENT') {
        for (const id of io.sockets.adapter.rooms.get(roomId) ?? []) {
          const old = io.sockets.sockets.get(id)
          if (!old || old.id === socket.id || old.data.user?.id !== user.id) continue
          old.leave(roomId)
          old.data.roomId = null
          old.data.inCall = false
          io.to(roomId).emit('user-left', old.id)
          old.emit('call:replaced')
          sfuKick(call.id, old.id)
        }
      }
      socket.data.roomId = roomId
      socket.data.callId = call.id
      socket.data.classroomId = call.classroom?.id ?? null
      socket.data.inCall = true
      socket.join(roomId)
      callLastSeen.set(call.id, Date.now())
      adventCallPresence(call.id, user.role, true).catch(() => {})

      const peers = []
      for (const id of io.sockets.adapter.rooms.get(roomId) ?? []) {
        if (id === socket.id) continue
        const peer = io.sockets.sockets.get(id)
        if (peer) peers.push({ id, name: peer.data.name, userId: peer.data.user?.id, muted: Boolean(peer.data.micMuted), denoised: peer.data.denoised, sharing: Boolean(peer.data.sharing) })
      }

      if (!peers.length || !callModes.has(roomId)) callModes.set(roomId, sfuEnabled() ? 'sfu' : 'p2p')
      const sfu = callModes.get(roomId) === 'sfu' ? sfuJoin({ room: call.id, identity: socket.id, name: socket.data.name }) : null

      socket.to(roomId).emit('user-joined', { id: socket.id, name: socket.data.name, userId: user.id })
      // The teacher's current board/document is offered to staff joining
      // later; a student starts on their own (the client opens it).
      const lead = user.role !== 'STUDENT'
      const roomDoc = lead ? roomDocs.get(roomId) ?? null : null
      const docId = roomDoc && await accessibleClassroom(user, roomDoc) ? roomDoc : null
      if (typeof ack === 'function') ack({ peers, sfu, name: socket.data.name, boardId: lead ? roomBoards.get(roomId) ?? null : null, docId })
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
      // Whether this person's sound is already cleaned on their device.
      if (typeof state?.denoised === 'boolean') socket.data.denoised = state.denoised
      socket.to(room).emit('mic:state', { from: socket.id, muted: socket.data.micMuted, denoised: socket.data.denoised })
    })

    socket.on('screen-share-start', () => {
      const room = socket.data.roomId
      socket.data.sharing = true
      if (room) socket.to(room).emit('screen-share-started', { from: socket.id })
    })

    socket.on('screen-share-stop', () => {
      const room = socket.data.roomId
      socket.data.sharing = false
      if (room) socket.to(room).emit('screen-share-stopped', { from: socket.id })
    })

    // A quick emoji reaction, shown flying up for everyone in the room.
    const REACTIONS = new Set(['👍', '👏', '🎉', '❤️', '😂', '🔥', '💪', '⭐', '🙌', '😊', '💯'])
    socket.on('reaction', (payload) => {
      const room = socket.data.roomId
      const emoji = typeof payload?.emoji === 'string' ? payload.emoji : ''
      if (!room || !REACTIONS.has(emoji)) return
      io.to(room).emit('reaction', { from: socket.id, name: socket.data.name, emoji, at: Date.now() })
    })

    // Pointer strokes over a shared screen, for everyone else in the room.
    socket.on('drawing', (stroke) => {
      const room = socket.data.roomId
      if (!room || typeof stroke?.x0 !== 'number' || typeof stroke?.x1 !== 'number') return
      socket.to(room).emit('drawing', { x0: stroke.x0, y0: Number(stroke.y0) || 0, x1: stroke.x1, y1: Number(stroke.y1) || 0, color: typeof stroke.color === 'string' ? stroke.color.slice(0, 20) : undefined })
    })

    // --- Whiteboards ---------------------------------------------------------

    // Everyone in the room looks at the same board at a time. A board may be
    // opened here when it belongs to this classroom, when this person has
    // access to its classroom, or when it is already the room's board.
    const boardBelongsHere = async (boardId) => {
      if (typeof boardId !== 'string') return false
      const board = await prisma.board.findUnique({ where: { id: boardId }, select: { classroomId: true, sharedWith: { select: { id: true, studentId: true } } } })
      if (!board) return false
      // A student sees their own boards and those shared with them — never
      // another student's, whatever call they are in.
      if (user.role === 'STUDENT') {
        if (board.sharedWith.some((c) => c.studentId === user.id)) return true
        return Boolean(await accessibleClassroom(user, board.classroomId))
      }
      const { roomId, classroomId } = socket.data
      if (board.classroomId === classroomId) return true
      if (classroomId && board.sharedWith.some((c) => c.id === classroomId)) return true
      if (roomId && roomBoards.get(roomId) === boardId) return true
      const classroom = await accessibleClassroom(user, board.classroomId)
      if (!classroom) return false
      if (roomId) roomBoards.set(roomId, boardId)
      return true
    }

    // `quiet` reopens a board after a reconnect without leading the room to it.
    socket.on('board:open', async (boardId, options, ack) => {
      if (typeof options === 'function') { ack = options; options = {} }
      if (!(await boardBelongsHere(boardId))) {
        if (typeof ack === 'function') ack({ error: 'Board not found' })
        return
      }

      endSpotlight(socket)
      unwatch(boardWatchers, socket.data.boardId, socket)
      socket.data.boardId = boardId
      watch(boardWatchers, boardId, socket)
      const elements = await loadBoard(boardId)
      // What each person has open is their own business; the only thing a
      // teacher's choice does is tell people who join the call later which
      // board to start on. Edits reach everyone through the watchers.
      if (user.role !== 'STUDENT' && socket.data.callId) roomBoards.set(socket.data.roomId, boardId)
      if (typeof ack === 'function') ack({ elements })
      const spot = boardSpotlights.get(boardId)
      if (spot && spot.from !== socket.id) {
        socket.emit('board:spotlight', { from: spot.from, name: spot.name, on: true })
        if (spot.view) socket.emit('board:view', spot.view)
      }
    })

    socket.on('board:add', async (raw) => {
      const { boardId, roomId } = socket.data
      if (!boardId) return

      const parsed = elementSchema.safeParse(tidyElement(raw))
      if (!parsed.success) {
        // Nobody else will ever see it: take it off the sender's board too.
        console.warn('[board] add rejected', raw?.type, raw?.id, parsed.error.issues.map((i) => i.path.join('.')).join(','))
        if (typeof raw?.id === 'string') socket.emit('board:delete', raw.id)
        return
      }

      const element = { ...parsed.data, authorId: user.id, at: parsed.data.at ?? Date.now() }
      if (user.role === 'STUDENT') {
        const stored = (await loadBoard(boardId)).find((e) => e.id === element.id)
        if (stored && !studentMayChange(stored, element, user.id)) return socket.emit('board:update', stored)
      }
      if (await addElement(boardId, element)) {
        emitToWatchers(boardWatchers, boardId, socket, 'board:add', (await loadBoard(boardId)).find((e) => e.id === element.id) ?? element)
        // A teacher's "— Homework —" heading: the students' phones hear of it.
        if (user.role !== 'STUDENT' && isHomeworkHeading(element)) {
          notifyHomeworkLater(boardId, element.id, async () => (await loadBoard(boardId)).some((e) => e.id === element.id))
        }
      }
    })

    socket.on('board:update', async (raw) => {
      const { boardId, roomId } = socket.data
      if (!boardId) return

      const parsed = elementSchema.safeParse(tidyElement(raw))
      if (!parsed.success) {
        // Dropped silently, the change stayed on the sender's screen only and
        // the students saw the old version (a crop by 1.0000000001 did this).
        // The sender gets the stored copy back so both sides match again.
        console.warn('[board] update rejected', raw?.type, raw?.id, parsed.error.issues.map((i) => i.path.join('.')).join(','))
        const stored = (await loadBoard(boardId)).find((e) => e.id === raw?.id)
        socket.emit(stored ? 'board:update' : 'board:delete', stored ?? raw?.id)
        return
      }

      if (user.role === 'STUDENT') {
        const stored = (await loadBoard(boardId)).find((e) => e.id === parsed.data.id)
        if (stored && !studentMayChange(stored, parsed.data, user.id)) return socket.emit('board:update', stored)
      }
      if (await updateElement(boardId, parsed.data, user.id)) {
        emitToWatchers(boardWatchers, boardId, socket, 'board:update', (await loadBoard(boardId)).find((e) => e.id === parsed.data.id) ?? parsed.data)
      }
    })

    socket.on('board:delete', async (elementId) => {
      const { boardId, roomId } = socket.data
      if (!boardId || typeof elementId !== 'string') return
      if (user.role === 'STUDENT') {
        const stored = (await loadBoard(boardId)).find((e) => e.id === elementId)
        if (stored && !studentMayChange(stored, null, user.id)) return socket.emit('board:add', stored)
      }

      if (await deleteElement(boardId, elementId)) {
        emitToWatchers(boardWatchers, boardId, socket, 'board:delete', elementId)
      }
    })

    // Closing is private too; newcomers then start without a board.
    socket.on('board:close', () => {
      const { roomId } = socket.data
      unwatch(boardWatchers, socket.data.boardId, socket)
      socket.data.boardId = null
      if (roomId && user.role !== 'STUDENT') roomBoards.delete(roomId)
    })

    // --- Writing documents ---------------------------------------------------
    // One per classroom. Only the classroom's own teacher and student (and the
    // school's admins) may open it — in a call too: a colleague in someone
    // else's call never gets their students' writing (Galina, 2026-10-20).

    const docAllowed = async (classroomId) => {
      if (typeof classroomId !== 'string') return false
      // A homework document: whoever may open its cabinet may open it.
      if (classroomId.startsWith(HOMEWORK_PREFIX)) {
        const hw = await prisma.homeworkDoc.findUnique({ where: { id: classroomId.slice(HOMEWORK_PREFIX.length) }, select: { classroomId: true } })
        return Boolean(hw && await accessibleClassroom(user, hw.classroomId))
      }
      return Boolean(await accessibleClassroom(user, classroomId))
    }

    socket.on('doc:open', async (classroomId, options, ack) => {
      if (typeof options === 'function') { ack = options; options = {} }
      if (!(await docAllowed(classroomId))) {
        if (typeof ack === 'function') ack({ error: 'Document not found' })
        return
      }
      if (socket.data.docId) emitToWatchers(docWatchers, socket.data.docId, socket, 'doc:selection', { from: socket.id, gone: true })
      unwatch(docWatchers, socket.data.docId, socket)
      socket.data.docId = classroomId
      watch(docWatchers, classroomId, socket)
      if (user.role !== 'STUDENT' && socket.data.callId && !classroomId.startsWith(HOMEWORK_PREFIX)) roomDocs.set(socket.data.roomId, classroomId)
      let runs
      try {
        runs = await loadDocument(classroomId)
      } catch (error) {
        console.error('Document load failed:', error.message)
        if (typeof ack === 'function') ack({ error: 'Could not load the document' })
        return
      }
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

    // What someone has highlighted in the document, so the other side sees
    // the same words marked (a teacher pointing at a sentence). Offsets are
    // into the document's text; nothing is stored.
    socket.on('doc:selection', (raw) => {
      const { docId } = socket.data
      if (!docId) return
      const start = Number(raw?.start)
      const end = Number(raw?.end)
      const valid = Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end > start && end - start < 200_000
      emitToWatchers(docWatchers, docId, socket, 'doc:selection', valid ? { from: socket.id, name: socket.data.name ?? user.name, start, end } : { from: socket.id, gone: true })
    })

    // Opening and closing the document are private as well; a teacher's
    // open only tells later joiners which document to start on.
    socket.on('doc:close', () => {
      const { roomId } = socket.data
      if (socket.data.docId) emitToWatchers(docWatchers, socket.data.docId, socket, 'doc:selection', { from: socket.id, gone: true })
      unwatch(docWatchers, socket.data.docId, socket)
      socket.data.docId = null
      if (!roomId || user.role === 'STUDENT') return
      roomDocs.delete(roomId)
    })

    // Live cursors: everyone with the board open sees where the others point.
    socket.on('board:cursor', (pos) => {
      const { boardId } = socket.data
      if (!boardId || typeof pos?.x !== 'number' || typeof pos?.y !== 'number') return
      emitToWatchers(boardWatchers, boardId, socket, 'board:cursor', { from: socket.id, name: socket.data.name, x: pos.x, y: pos.y })
    })

    // Spotlight: the teacher's viewport goes to everyone looking at the
    // same board, so their view follows it.
    socket.on('board:spotlight', async (state) => {
      const { boardId } = socket.data
      if (!boardId) return
      const on = Boolean(state?.on)
      // Remembered, so someone opening the board later follows at once (set
      // before any await: the first board:view comes right after this).
      const spot = on ? { from: socket.id, name: socket.data.name, view: null } : null
      if (on) boardSpotlights.set(boardId, spot)
      else if (boardSpotlights.get(boardId)?.from === socket.id) boardSpotlights.delete(boardId)
      // Outside a call the name isn't known yet (it is set on join-call).
      if (!socket.data.name) socket.data.name = (await prisma.user.findUnique({ where: { id: user.id }, select: { name: true } }))?.name ?? 'Teacher'
      if (spot) spot.name = socket.data.name
      emitToWatchers(boardWatchers, boardId, socket, 'board:spotlight', { from: socket.id, name: socket.data.name, on })
    })
    socket.on('board:view', (view) => {
      const { boardId } = socket.data
      if (!boardId || typeof view?.scale !== 'number') return
      const payload = { from: socket.id, scale: view.scale, cx: Number(view.cx) || 0, cy: Number(view.cy) || 0 }
      const spot = boardSpotlights.get(boardId)
      if (spot?.from === socket.id) spot.view = payload
      emitToWatchers(boardWatchers, boardId, socket, 'board:view', payload)
    })

    // Wiping a board is the teacher's call; a student can undo their own strokes.
    socket.on('board:clear', async () => {
      const { boardId, roomId } = socket.data
      if (!boardId || user.role === 'STUDENT') return

      await clearBoard(boardId)
      emitToWatchers(boardWatchers, boardId, socket, 'board:clear')
    })

    socket.on('disconnect', async () => {
      endSpotlight(socket)
      if (socket.data.boardId) emitToWatchers(boardWatchers, socket.data.boardId, socket, 'board:cursor', { from: socket.id, gone: true })
      unwatch(boardWatchers, socket.data.boardId, socket)
      if (socket.data.docId) emitToWatchers(docWatchers, socket.data.docId, socket, 'doc:selection', { from: socket.id, gone: true })
      unwatch(docWatchers, socket.data.docId, socket)
      const { roomId, classroomId } = socket.data
      if (!roomId) return

      socket.to(roomId).emit('user-left', socket.id)
      // Its media link may outlive the socket (see sfuKick); a reconnecting
      // browser joins the media room again under its new id anyway.
      if (socket.data.inCall) sfuKick(socket.data.callId, socket.id)
      if (socket.data.inCall) adventCallPresence(socket.data.callId, user.role, false).catch(() => {})

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
      // A group lesson ends for everyone of the group.
      if (stillOnCall === 0 && groupSessions.has(roomId)) {
        for (const id of groupSessions.get(roomId)) await closeSession(id).catch((error) => console.error('Could not close session:', error.message))
        groupSessions.delete(roomId)
      }
      // An empty call room is over: the call ends so nothing piles up. The
      // link stays usable for 15 minutes in case someone reconnects.
      if (socket.data.callId) callLastSeen.set(socket.data.callId, Date.now())
      if (stillOnCall === 0 && socket.data.callId) {
        const callId = socket.data.callId
        const hadClassroom = Boolean(classroomId)
        setTimeout(async () => {
          const still = [...(io.sockets.adapter.rooms.get(roomId) ?? [])].length
          if (still) return
          await prisma.call.updateMany({ where: { id: callId, endedAt: null }, data: { endedAt: new Date() } }).catch(() => {})
          adventCallEnded(callId).catch(() => {})
          trialCallEnded(callId).catch((error) => console.error('[trial] end', error.message))
          // A scratch board made for a boardless call (no student attached)
          // was only ever for this one call: gone with it, not left behind
          // cluttering the teacher's own boards.
          const openBoardId = roomBoards.get(roomId)
          if (!hadClassroom && openBoardId) {
            const board = await prisma.board.findUnique({ where: { id: openBoardId }, select: { scratch: true } }).catch(() => null)
            if (board?.scratch) {
              await prisma.board.delete({ where: { id: openBoardId } }).catch(() => {})
              forgetBoard(openBoardId)
            }
          }
          roomBoards.delete(roomId)
          roomDocs.delete(roomId)
        }, 15 * 60 * 1000)
      }
    })
  })
}
