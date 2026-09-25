import { Router } from 'express'
import { randomBytes, createHmac } from 'crypto'
import { z } from 'zod'
import { prisma } from '../db.js'
import { requireAuth, requireRole } from '../auth.js'
import { accessibleClassroom, ensurePersonalSpace } from './classrooms.js'

export const callsRouter = Router()

const originOf = (req) => process.env.CLIENT_ORIGIN ?? `${req.protocol}://${req.get('host')}`

const callView = (call, origin) => ({
  id: call.id,
  token: call.token,
  title: call.title,
  createdAt: call.createdAt,
  endedAt: call.endedAt,
  link: `${origin}/call/${call.token}`,
  host: call.host ? { id: call.host.id, name: call.host.name } : undefined,
  classroomId: call.classroomId,
  boardId: call.boardId ?? null
})

callsRouter.use(requireAuth)

// STUN always; TURN (relay for people behind strict NATs) when a coturn
// server is configured. TURN credentials are short-lived HMACs of a shared
// secret, the standard "REST API" scheme coturn understands.
callsRouter.get('/ice', (req, res) => {
  const iceServers = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }]
  const secret = process.env.TURN_SECRET
  const host = process.env.TURN_HOST
  if (secret && host) {
    const username = `${Math.floor(Date.now() / 1000) + 6 * 3600}:lms`
    const credential = createHmac('sha1', secret).update(username).digest('base64')
    iceServers.push({
      urls: [`turn:${host}:3478?transport=udp`, `turn:${host}:3478?transport=tcp`],
      username,
      credential
    })
  }
  res.json({ iceServers })
})

// What a participant sees before joining. Only members of the school that
// made the call can look it up — a link alone is not an invitation.
callsRouter.get('/token/:token', async (req, res) => {
  const call = await prisma.call.findFirst({
    where: { token: req.params.token, schoolId: req.user.schoolId },
    include: { host: { select: { name: true } }, school: { select: { name: true } } }
  })
  if (!call) return res.status(404).json({ error: 'Call not found' })
  if (call.endedAt) return res.status(410).json({ error: 'This call has ended' })

  res.json({
    call: {
      title: call.title,
      host: call.host.name,
      schoolName: call.school.name,
      // The student's board can be opened inside the call.
      classroomId: call.classroomId
    }
  })
})

const createSchema = z.object({
  title: z.string().max(200).optional(),
  classroomId: z.string().optional(),
  // The board it is started on (from My boards): its students see the call.
  boardId: z.string().max(40).optional()
})

// One host's call creations run one after another, so the "same lesson just
// started" check below sees the call a parallel click is creating.
const hostQueues = new Map()
function oneAtATime(hostId, fn) {
  const run = (hostQueues.get(hostId) ?? Promise.resolve()).then(fn, fn)
  const tail = run.catch(() => {})
  hostQueues.set(hostId, tail)
  tail.then(() => { if (hostQueues.get(hostId) === tail) hostQueues.delete(hostId) })
  return run
}

callsRouter.post('/', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid data' })

  let classroomId = null
  if (parsed.data.classroomId) {
    const classroom = await accessibleClassroom(req.user, parsed.data.classroomId)
    if (!classroom) return res.status(404).json({ error: 'Classroom not found' })
    classroomId = classroom.id
  }

  let boardId = null
  if (parsed.data.boardId) {
    const board = await prisma.board.findFirst({
      where: { id: parsed.data.boardId, classroom: { schoolId: req.user.schoolId } },
      select: { id: true, classroomId: true, sharedWith: { select: { id: true, studentId: true } } }
    })
    if (!board || !(await accessibleClassroom(req.user, board.classroomId))) return res.status(404).json({ error: 'Board not found' })
    boardId = board.id
    // A board with exactly one student: the call is that student's lesson
    // (it counts, and "Join call" shows in their cabinet). Several students
    // (a pair lesson) see it through the board instead.
    const students = board.sharedWith.filter((c) => c.studentId)
    if (!classroomId && students.length === 1) classroomId = students[0].id
  }

  // A second click while the first is still on its way (slow network) used
  // to open a new call each time — twenty in half a minute once. The same
  // host starting the same lesson again within two minutes gets that call.
  const { call, reused } = await oneAtATime(req.user.id, async () => {
    const recent = await prisma.call.findFirst({
      where: { hostId: req.user.id, endedAt: null, classroomId, boardId, createdAt: { gt: new Date(Date.now() - 2 * 60 * 1000) } },
      include: { host: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' }
    })
    if (recent) return { call: recent, reused: true }
    const created = await prisma.call.create({
      data: {
        token: randomBytes(9).toString('base64url'),
        title: parsed.data.title?.trim() || null,
        hostId: req.user.id,
        schoolId: req.user.schoolId,
        classroomId,
        boardId
      },
      include: { host: { select: { id: true, name: true } } }
    })
    return { call: created, reused: false }
  })

  res.status(reused ? 200 : 201).json({ call: callView(call, originOf(req)) })
})

// A blank board for a call that has no student (a colleague or group call):
// created on the teacher's own shelf, flagged scratch so it never shows in
// My boards and is deleted once the call ends (see signaling.js).
callsRouter.post('/:token/scratch-board', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const call = await prisma.call.findUnique({ where: { token: req.params.token } })
  if (!call || call.endedAt || call.schoolId !== req.user.schoolId) return res.status(404).json({ error: 'Call not found' })
  if (call.classroomId) return res.status(400).json({ error: 'This call already has its own board' })

  const home = await ensurePersonalSpace(req.user.id, req.user.schoolId)
  const board = await prisma.board.create({
    data: { classroomId: home.id, title: call.title ?? `Call — ${new Date().toLocaleDateString()}`, scratch: true },
    select: { id: true, title: true, classroomId: true, createdAt: true, updatedAt: true }
  })
  res.status(201).json({ board })
})

// The lesson that is on right now for this person: for a student, an open
// call on one of their classrooms started in the last three hours; for a
// teacher, their own open call. The student's cabinet polls this so the
// Join button appears the moment the teacher starts the lesson.
callsRouter.get('/active', async (req, res) => {
  const since = new Date(Date.now() - 3 * 60 * 60 * 1000)
  const where = req.user.role === 'STUDENT'
    ? {
        endedAt: null,
        createdAt: { gt: since },
        // Their own lesson, or a call on a board they are assigned to.
        OR: [
          { classroom: { studentId: req.user.id } },
          { board: { sharedWith: { some: { studentId: req.user.id } } } }
        ]
      }
    : { endedAt: null, createdAt: { gt: since }, hostId: req.user.id }
  const call = await prisma.call.findFirst({
    where: { ...where, schoolId: req.user.schoolId },
    include: { host: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' }
  })
  res.json({ call: call ? { ...callView(call, originOf(req)), kind: call.kind } : null })
})

callsRouter.get('/', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const calls = await prisma.call.findMany({
    where: { hostId: req.user.id, endedAt: null },
    include: { host: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 10
  })
  res.json({ calls: calls.map((call) => callView(call, originOf(req))) })
})

callsRouter.post('/:id/end', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const call = await prisma.call.findFirst({
    where: { id: req.params.id, hostId: req.user.id }
  })
  if (!call) return res.status(404).json({ error: 'Call not found' })

  await prisma.call.update({ where: { id: call.id }, data: { endedAt: new Date() } })
  res.json({ ok: true })
})
