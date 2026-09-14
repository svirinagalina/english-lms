import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db.js'
import { requireAuth, requireRole } from '../auth.js'

export const classroomsRouter = Router()

classroomsRouter.use(requireAuth)

// A classroom exists for every teacher-student link; it is created on first use
// rather than at link time, so older links work too.
export async function ensureClassroom(teacherId, studentId, schoolId) {
  return prisma.classroom.upsert({
    where: { teacherId_studentId: { teacherId, studentId } },
    create: { teacherId, studentId, schoolId },
    update: {}
  })
}

// Every teacher gets one room with no student attached, to try the call and
// the whiteboard before inviting anyone.
async function ensureTestRoom(teacherId, schoolId) {
  const existing = await prisma.classroom.findFirst({
    where: { teacherId, studentId: null }
  })
  return existing ?? prisma.classroom.create({ data: { teacherId, studentId: null, schoolId } })
}

function packageProgress(student, sessions) {
  if (!student) return null
  const since = student.packageStartedAt
  const held = sessions.filter(
    (session) => session.counted && (!since || session.startedAt >= since)
  ).length

  return {
    lessonsPaid: student.lessonsPaid ?? null,
    packageStartedAt: since,
    held,
    remaining: student.lessonsPaid == null ? null : student.lessonsPaid - held
  }
}

export async function accessibleClassroom(user, classroomId) {
  const classroom = await prisma.classroom.findFirst({
    where: { id: classroomId, schoolId: user.schoolId },
    include: {
      teacher: { select: { id: true, name: true } },
      student: {
        select: { id: true, name: true, lessonsPaid: true, packageStartedAt: true }
      }
    }
  })
  if (!classroom) return null

  // A test room belongs to its teacher alone; the owner may look in too.
  const allowed =
    user.role === 'OWNER' ||
    classroom.teacherId === user.id ||
    (classroom.studentId !== null && classroom.studentId === user.id)

  return allowed ? classroom : null
}

classroomsRouter.get('/', async (req, res) => {
  const where =
    req.user.role === 'OWNER'
      ? { schoolId: req.user.schoolId }
      : req.user.role === 'TEACHER'
        ? { teacherId: req.user.id }
        : { studentId: req.user.id }

  // Make sure every existing link has a classroom before listing.
  const links = await prisma.teacherStudent.findMany({
    where:
      req.user.role === 'TEACHER'
        ? { teacherId: req.user.id }
        : req.user.role === 'STUDENT'
          ? { studentId: req.user.id }
          : {},
    include: { teacher: { select: { schoolId: true } } }
  })

  for (const link of links) {
    await ensureClassroom(link.teacherId, link.studentId, link.teacher.schoolId)
  }

  if (req.user.role !== 'STUDENT') {
    await ensureTestRoom(req.user.id, req.user.schoolId)
  }

  const classrooms = await prisma.classroom.findMany({
    where,
    include: {
      teacher: { select: { id: true, name: true } },
      student: { select: { id: true, name: true, lessonsPaid: true, packageStartedAt: true } },
      sessions: { select: { id: true, startedAt: true, counted: true } },
      _count: { select: { boards: true } }
    },
    orderBy: { createdAt: 'asc' }
  })

  const view = (classroom) => ({
    id: classroom.id,
    teacher: classroom.teacher,
    student: classroom.student ? { id: classroom.student.id, name: classroom.student.name } : null,
    isTestRoom: classroom.student === null,
    boards: classroom._count.boards,
    lastSession: classroom.sessions.at(-1)?.startedAt ?? null,
    progress: packageProgress(classroom.student, classroom.sessions)
  })

  // Own test room first, then real classrooms; other teachers' test rooms are
  // noise for the owner and are left out.
  const own = classrooms.filter((c) => c.student === null && c.teacherId === req.user.id)
  const real = classrooms.filter((c) => c.student !== null)

  res.json({ classrooms: [...own, ...real].map(view) })
})

classroomsRouter.get('/:id', async (req, res) => {
  const classroom = await accessibleClassroom(req.user, req.params.id)
  if (!classroom) return res.status(404).json({ error: 'Classroom not found' })

  const [sessions, boards] = await Promise.all([
    prisma.session.findMany({
      where: { classroomId: classroom.id },
      orderBy: { startedAt: 'desc' }
    }),
    prisma.board.findMany({
      where: { classroomId: classroom.id },
      select: { id: true, title: true, createdAt: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' }
    })
  ])

  res.json({
    classroom: {
      id: classroom.id,
      teacher: classroom.teacher,
      student: classroom.student ? { id: classroom.student.id, name: classroom.student.name } : null,
      isTestRoom: classroom.student === null,
      progress: packageProgress(classroom.student, sessions),
      sessions: sessions.map((session) => ({
        id: session.id,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        counted: session.counted,
        note: session.note,
        minutes: session.endedAt
          ? Math.max(1, Math.round((session.endedAt - session.startedAt) / 60000))
          : null
      })),
      boards
    }
  })
})

// --- Boards -------------------------------------------------------------------

const boardSchema = z.object({ title: z.string().min(1).max(200) })

classroomsRouter.post('/:id/boards', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const classroom = await accessibleClassroom(req.user, req.params.id)
  if (!classroom) return res.status(404).json({ error: 'Classroom not found' })

  const parsed = boardSchema.safeParse(req.body)
  const title = parsed.success ? parsed.data.title : `Board ${new Date().toLocaleDateString()}`

  const board = await prisma.board.create({
    data: { classroomId: classroom.id, title },
    select: { id: true, title: true, createdAt: true, updatedAt: true }
  })

  res.status(201).json({ board })
})

classroomsRouter.patch('/:id/boards/:boardId', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const classroom = await accessibleClassroom(req.user, req.params.id)
  if (!classroom) return res.status(404).json({ error: 'Classroom not found' })

  const parsed = boardSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid title' })

  const updated = await prisma.board.updateMany({
    where: { id: req.params.boardId, classroomId: classroom.id },
    data: { title: parsed.data.title }
  })
  if (!updated.count) return res.status(404).json({ error: 'Board not found' })

  res.json({ ok: true })
})

classroomsRouter.delete('/:id/boards/:boardId', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const classroom = await accessibleClassroom(req.user, req.params.id)
  if (!classroom) return res.status(404).json({ error: 'Classroom not found' })

  await prisma.board.deleteMany({ where: { id: req.params.boardId, classroomId: classroom.id } })
  res.json({ ok: true })
})

// --- Sessions -----------------------------------------------------------------

const sessionPatchSchema = z.object({
  counted: z.boolean().optional(),
  note: z.string().max(500).nullable().optional()
})

classroomsRouter.patch('/:id/sessions/:sessionId', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const classroom = await accessibleClassroom(req.user, req.params.id)
  if (!classroom) return res.status(404).json({ error: 'Classroom not found' })

  const parsed = sessionPatchSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid data' })

  const updated = await prisma.session.updateMany({
    where: { id: req.params.sessionId, classroomId: classroom.id },
    data: parsed.data
  })
  if (!updated.count) return res.status(404).json({ error: 'Session not found' })

  res.json({ ok: true })
})

classroomsRouter.delete('/:id/sessions/:sessionId', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const classroom = await accessibleClassroom(req.user, req.params.id)
  if (!classroom) return res.status(404).json({ error: 'Classroom not found' })

  await prisma.session.deleteMany({
    where: { id: req.params.sessionId, classroomId: classroom.id }
  })
  res.json({ ok: true })
})

// --- Package ------------------------------------------------------------------

const packageSchema = z.object({
  lessonsPaid: z.number().int().min(0).max(500).nullable(),
  resetCounter: z.boolean().optional()
})

classroomsRouter.patch('/:id/package', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const classroom = await accessibleClassroom(req.user, req.params.id)
  if (!classroom) return res.status(404).json({ error: 'Classroom not found' })

  if (!classroom.studentId) return res.status(400).json({ error: 'A test room has no student' })

  const parsed = packageSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid data' })

  await prisma.user.update({
    where: { id: classroom.studentId },
    data: {
      lessonsPaid: parsed.data.lessonsPaid,
      ...(parsed.data.resetCounter ? { packageStartedAt: new Date() } : {})
    }
  })

  res.json({ ok: true })
})
