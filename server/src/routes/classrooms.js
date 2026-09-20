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

  // A classroom whose teacher–student link was removed (the student moved to
  // another teacher) is history: hidden unless lessons were held in it.
  const linked = new Set(links.map((l) => `${l.teacherId}:${l.studentId}`))
  const current = (classroom) => classroom.student === null || linked.has(`${classroom.teacherId}:${classroom.student.id}`)

  const view = (classroom) => ({
    id: classroom.id,
    teacher: classroom.teacher,
    former: !current(classroom),
    student: classroom.student ? { id: classroom.student.id, name: classroom.student.name } : null,
    isTestRoom: classroom.student === null,
    boards: classroom._count.boards,
    lastSession: classroom.sessions.at(-1)?.startedAt ?? null,
    progress: packageProgress(classroom.student, classroom.sessions)
  })

  res.json({ classrooms: classrooms.filter((c) => c.student !== null && (current(c) || c.sessions.length > 0)).map(view) })
})

// The student's home: the latest homework on their board, so it is one
// click away and they know it exists.
classroomsRouter.get('/home', async (req, res) => {
  if (req.user.role !== 'STUDENT') return res.json({ homework: null })
  const boards = await prisma.board.findMany({
    where: { classroom: { studentId: req.user.id } },
    select: { id: true, title: true, classroomId: true, elements: true, updatedAt: true }
  })
  const isText = (e) => (e.type === 'text' || e.type === 'note') && typeof e.text === 'string'
  const clean = (text) => text.replace(/\{\{#[0-9a-f]{6}:([^}]*)\}\}/gi, '$1').replace(/\*\*|__/g, '').trim()
  let homework = null
  for (const board of boards) {
    const elements = Array.isArray(board.elements) ? board.elements : []
    const texts = elements.filter(isText).map((e) => ({ ...e, plain: clean(e.text) }))
    // The "— Homework —" heading, or any text/note that starts with "Homework".
    const headings = texts.filter((e) => /^[—\-\s]*homework\b/i.test(e.plain)).sort((a, b) => b.y - a.y)
    const heading = headings[0]
    if (!heading) continue
    // What sits under the heading, until the next lesson heading: the task itself.
    const nextLesson = texts.filter((e) => e.y > heading.y && /^—\s*Lesson/i.test(e.plain)).sort((a, b) => a.y - b.y)[0]
    const own = heading.plain.replace(/^[—\-\s]*homework[\s:—\-]*/i, '').replace(/\s*—\s*$/, '').trim()
    const lines = [own, ...texts
      .filter((e) => e.id !== heading.id && e.y > heading.y && (!nextLesson || e.y < nextLesson.y))
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((e) => e.plain)]
      .filter(Boolean)
    const candidate = { boardId: board.id, boardTitle: board.title, classroomId: board.classroomId, elementId: heading.id, updatedAt: board.updatedAt, lines: lines.slice(0, 6), more: Math.max(0, lines.length - 6) }
    if (!homework || candidate.updatedAt > homework.updatedAt) homework = candidate
  }
  res.json({ homework })
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
      boards: { select: { id: true, title: true, updatedAt: true }, orderBy: { updatedAt: 'desc' } },
      sharedBoards: { select: { id: true, title: true, updatedAt: true }, orderBy: { updatedAt: 'desc' } }
    }
  })
  const seen = new Set()
  const boards = classrooms.flatMap((classroom) =>
    [...classroom.boards, ...classroom.sharedBoards].filter((board) => !seen.has(board.id) && seen.add(board.id)).map((board) => ({
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
      where: { OR: [{ classroomId: classroom.id }, { sharedWith: { some: { id: classroom.id } } }] },
      select: { id: true, title: true, createdAt: true, updatedAt: true, classroomId: true, sharedWith: { select: { id: true, student: { select: { name: true } } } } },
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
      boards: boards.map((board) => ({
        id: board.id,
        title: board.title,
        createdAt: board.createdAt,
        updatedAt: board.updatedAt,
        // Shared in from another student's space, or shared out to others.
        // Who else a board is shared with is the teacher's business only.
        shared: board.classroomId !== classroom.id,
        sharedWith: req.user.role === 'STUDENT' ? [] : board.sharedWith.map((c) => c.student?.name).filter(Boolean)
      }))
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
  mode: z.enum(['copy', 'move', 'share', 'unshare'])
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
    where: { id: req.params.boardId, OR: [{ classroomId: source.id }, { sharedWith: { some: { id: source.id } } }] }
  })
  if (!board) return res.status(404).json({ error: 'Board not found' })

  // Sharing keeps one board and attaches it to another student too.
  if (parsed.data.mode === 'share' || parsed.data.mode === 'unshare') {
    if (target.id === board.classroomId) return res.status(400).json({ error: 'Board already belongs there' })
    const updated = await prisma.board.update({
      where: { id: board.id },
      data: { sharedWith: parsed.data.mode === 'share' ? { connect: { id: target.id } } : { disconnect: { id: target.id } } },
      select: { id: true, title: true }
    })
    return res.json({ board: updated, mode: parsed.data.mode })
  }

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

  const owned = await prisma.board.deleteMany({ where: { id: req.params.boardId, classroomId: classroom.id } })
  if (!owned.count) {
    // Not ours: just detach it from this space.
    await prisma.board.update({ where: { id: req.params.boardId }, data: { sharedWith: { disconnect: { id: classroom.id } } } }).catch(() => {})
  }
  res.json({ ok: true })
})

// Accepts a data URL, stores the file, returns a path the board element can
// reference. Data URLs are the simplest way to get a pasted screenshot here
// without a multipart dependency.
classroomsRouter.post('/:id/boards/:boardId/images', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const classroom = await accessibleClassroom(req.user, req.params.id)
  if (!classroom) return res.status(404).json({ error: 'Classroom not found' })

  const board = await prisma.board.findFirst({
    where: { id: req.params.boardId, OR: [{ classroomId: classroom.id }, { sharedWith: { some: { id: classroom.id } } }] },
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

// Screenshots pasted into the writing document; the student may add them too.
classroomsRouter.post('/:id/writing/images', async (req, res) => {
  const classroom = await accessibleClassroom(req.user, req.params.id)
  if (!classroom) return res.status(404).json({ error: 'Classroom not found' })

  const dataUrl = typeof req.body?.data === 'string' ? req.body.data : ''
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|gif|webp));base64,(.+)$/)
  if (!match) return res.status(400).json({ error: 'Only PNG, JPEG, GIF or WebP images are accepted' })

  const bytes = Buffer.from(match[2], 'base64')
  if (bytes.length > MAX_IMAGE_BYTES) return res.status(413).json({ error: 'Image is larger than 5 MB' })

  const fileName = `${randomBytes(12).toString('hex')}.${IMAGE_TYPES[match[1]]}`
  const directory = path.join(UPLOAD_ROOT, classroom.id.toLowerCase())
  await mkdir(directory, { recursive: true })
  await writeFile(path.join(directory, fileName), bytes)

  res.status(201).json({ src: `/uploads/${classroom.id.toLowerCase()}/${fileName}` })
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
