import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db.js'
import { requireAuth, requireRole, isAdmin } from '../auth.js'
import { forgetBoard } from '../boardStore.js'
import { randomBytes } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const UPLOAD_ROOT = process.env.UPLOAD_DIR
  ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads')
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const IMAGE_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' }

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

// A teacher's own space: a classroom with no student, holding the boards they
// keep for themselves. Never listed as a classroom; reached via /mine.
async function ensurePersonalSpace(teacherId, schoolId) {
  const existing = await prisma.classroom.findFirst({ where: { teacherId, studentId: null } })
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
    isAdmin(user) ||
    classroom.teacherId === user.id ||
    (classroom.studentId !== null && classroom.studentId === user.id)

  return allowed ? classroom : null
}

classroomsRouter.get('/', async (req, res) => {
  const where =
    isAdmin(req.user)
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

  res.json({ classrooms: classrooms.filter((c) => c.student !== null).map(view) })
})

classroomsRouter.get('/mine', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const space = await ensurePersonalSpace(req.user.id, req.user.schoolId)
  const boards = await prisma.board.findMany({
    where: { classroomId: space.id },
    select: { id: true, title: true, createdAt: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' }
  })
  res.json({ classroom: { id: space.id, boards } })
})

// Every board this person can open in a call: their students' boards
// (all of them for an admin) and their own. Used by the call's board picker.
classroomsRouter.get('/boards', async (req, res) => {
  const where = isAdmin(req.user)
    ? { schoolId: req.user.schoolId }
    : req.user.role === 'TEACHER'
      ? { teacherId: req.user.id }
      : { studentId: req.user.id }
  const classrooms = await prisma.classroom.findMany({
    where,
    include: {
      student: { select: { id: true, name: true } },
      teacher: { select: { id: true, name: true } },
      boards: { select: { id: true, title: true, updatedAt: true }, orderBy: { updatedAt: 'desc' } }
    }
  })
  const boards = classrooms.flatMap((classroom) =>
    classroom.boards.map((board) => ({
      id: board.id,
      title: board.title,
      classroomId: classroom.id,
      studentId: classroom.student?.id ?? null,
      student: classroom.student?.name ?? null,
      owner: classroom.student ? null : classroom.teacher.name
    }))
  )
  res.json({ boards })
})

classroomsRouter.get('/:id', async (req, res) => {
  const classroom = await accessibleClassroom(req.user, req.params.id)
  if (!classroom) return res.status(404).json({ error: 'Classroom not found' })

  // One board per student holds every lesson; it exists from the first visit.
  if (classroom.student && !(await prisma.board.count({ where: { classroomId: classroom.id } }))) {
    await prisma.board.create({
      data: { classroomId: classroom.id, title: `${classroom.student.name} — lessons`, elements: [] }
    })
  }

  const [sessions, boards] = await Promise.all([
    prisma.session.findMany({
      where: { classroomId: classroom.id },
      orderBy: { startedAt: 'desc' }
    }),
    prisma.board.findMany({
      where: { classroomId: classroom.id },
      select: { id: true, title: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: 'asc' }
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

const assignSchema = z.object({
  targetClassroomId: z.string(),
  mode: z.enum(['copy', 'move'])
})

// Copies or moves a board into another classroom the teacher can access —
// typically from their own boards into a student's space. Images keep their
// stored paths, so no files are duplicated.
classroomsRouter.post('/:id/boards/:boardId/assign', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const parsed = assignSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid data' })

  const source = await accessibleClassroom(req.user, req.params.id)
  if (!source) return res.status(404).json({ error: 'Classroom not found' })

  const target = await accessibleClassroom(req.user, parsed.data.targetClassroomId)
  if (!target) return res.status(404).json({ error: 'Target classroom not found' })
  if (target.id === source.id) return res.status(400).json({ error: 'Board is already there' })

  const board = await prisma.board.findFirst({
    where: { id: req.params.boardId, classroomId: source.id }
  })
  if (!board) return res.status(404).json({ error: 'Board not found' })

  if (parsed.data.mode === 'move') {
    const moved = await prisma.board.update({
      where: { id: board.id },
      data: { classroomId: target.id },
      select: { id: true, title: true }
    })
    forgetBoard(board.id)
    return res.json({ board: moved, mode: 'move' })
  }

  const copy = await prisma.board.create({
    data: { classroomId: target.id, title: board.title, elements: board.elements },
    select: { id: true, title: true }
  })
  res.status(201).json({ board: copy, mode: 'copy' })
})

classroomsRouter.delete('/:id/boards/:boardId', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const classroom = await accessibleClassroom(req.user, req.params.id)
  if (!classroom) return res.status(404).json({ error: 'Classroom not found' })

  await prisma.board.deleteMany({ where: { id: req.params.boardId, classroomId: classroom.id } })
  res.json({ ok: true })
})

// Accepts a data URL, stores the file, returns a path the board element can
// reference. Data URLs are the simplest way to get a pasted screenshot here
// without a multipart dependency.
classroomsRouter.post('/:id/boards/:boardId/images', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const classroom = await accessibleClassroom(req.user, req.params.id)
  if (!classroom) return res.status(404).json({ error: 'Classroom not found' })

  const board = await prisma.board.findFirst({
    where: { id: req.params.boardId, classroomId: classroom.id },
    select: { id: true }
  })
  if (!board) return res.status(404).json({ error: 'Board not found' })

  const dataUrl = typeof req.body?.data === 'string' ? req.body.data : ''
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|gif|webp));base64,(.+)$/)
  if (!match) return res.status(400).json({ error: 'Only PNG, JPEG, GIF or WebP images are accepted' })

  const bytes = Buffer.from(match[2], 'base64')
  if (bytes.length > MAX_IMAGE_BYTES) return res.status(413).json({ error: 'Image is larger than 5 MB' })

  const extension = IMAGE_TYPES[match[1]]
  const fileName = `${randomBytes(12).toString('hex')}.${extension}`
  const directory = path.join(UPLOAD_ROOT, board.id.toLowerCase())

  await mkdir(directory, { recursive: true })
  await writeFile(path.join(directory, fileName), bytes)

  res.status(201).json({ src: `/uploads/${board.id.toLowerCase()}/${fileName}` })
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
