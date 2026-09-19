import { Router } from 'express'
import { z } from 'zod'
import { randomBytes } from 'crypto'
import { prisma } from '../db.js'
import { requireAuth, requireRole } from '../auth.js'
import { accessibleClassroom } from './classrooms.js'
import { TEST_ITEMS, LEVELS, estimateLevel } from '../placementTest.js'
import { buildTrialReport } from '../trialReport.js'
import { addElement } from '../boardStore.js'
import { broadcastBoardAdd } from '../signaling.js'
import { assistantEnabled } from '../assistant.js'

// Trial lessons: a call that opens on the student's board with the
// placement test laid out, then the teacher's marks and the level report.
export const trialsRouter = Router()
trialsRouter.use(requireAuth)

const newId = () => randomBytes(16).toString('hex')

// The test on the board: a heading and two columns of sentences, under
// everything the board already has.
async function layTestOnBoard(boardId, elements) {
  let bottom = 0
  let left = 40
  for (const e of elements) {
    const y = (e.y ?? 0) + Math.abs(e.h ?? 0)
    if (y > bottom) bottom = y
    if (e.x != null && e.x < left) left = e.x
  }
  const y0 = elements.length ? bottom + 120 : 40
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const at = Date.now()
  const heading = { id: newId(), type: 'text', color: '#2563eb', width: 6, x: left, y: y0, text: `— Placement test · ${date} —`, fontSize: 28, at }
  const column = (items, x) => ({
    id: newId(), type: 'text', color: '#111827', width: 6, x, y: y0 + 56, w: 640, fontSize: 20, at,
    text: items.map((i) => `${i.n}. ${i.ru}`).join('\n')
  })
  const first = TEST_ITEMS.slice(0, 18)
  const second = TEST_ITEMS.slice(18)
  const made = [heading, column(first, left), column(second, left + 700)]
  for (const element of made) {
    await addElement(boardId, element)
    broadcastBoardAdd(boardId, element)
  }
  return heading.id
}

const originOf = (req) => process.env.CLIENT_ORIGIN ?? `${req.protocol}://${req.get('host')}`

// Start a trial lesson: the call, the test on the board, an empty report.
trialsRouter.post('/', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const classroomId = typeof req.body?.classroomId === 'string' ? req.body.classroomId : ''
  const classroom = await accessibleClassroom(req.user, classroomId)
  if (!classroom || !classroom.studentId) return res.status(404).json({ error: 'Classroom not found' })

  let board = await prisma.board.findFirst({ where: { classroomId: classroom.id }, orderBy: { createdAt: 'asc' } })
  if (!board) board = await prisma.board.create({ data: { classroomId: classroom.id, title: `${classroom.student.name} — lessons`, elements: [] } })
  const elements = Array.isArray(board.elements) ? board.elements : []
  const focusId = await layTestOnBoard(board.id, elements)

  const call = await prisma.call.create({
    data: {
      token: randomBytes(9).toString('base64url'),
      title: `Trial lesson with ${classroom.student.name}`,
      kind: 'TRIAL',
      hostId: req.user.id,
      schoolId: req.user.schoolId,
      classroomId: classroom.id
    }
  })
  const report = await prisma.trialReport.create({
    data: { classroomId: classroom.id, studentId: classroom.studentId, teacherId: req.user.id, callId: call.id }
  })
  res.status(201).json({ call: { id: call.id, token: call.token, link: `${originOf(req)}/call/${call.token}` }, reportId: report.id, boardId: board.id, focusId })
})

const view = (r, { forStudent = false } = {}) => ({
  id: r.id,
  classroomId: r.classroomId,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
  publishedAt: r.publishedAt,
  answers: forStudent ? undefined : r.answers,
  teacherLevel: forStudent ? undefined : r.teacherLevel,
  comments: forStudent ? undefined : r.comments,
  generated: r.generated,
  estimate: forStudent ? undefined : estimateLevel(r.answers ?? {})
})

// The classroom's trial reports: the teacher sees all, the student only published ones.
trialsRouter.get('/classroom/:id', async (req, res) => {
  const classroom = await accessibleClassroom(req.user, req.params.id)
  if (!classroom) return res.status(404).json({ error: 'Classroom not found' })
  const student = req.user.role === 'STUDENT'
  const reports = await prisma.trialReport.findMany({
    where: { classroomId: classroom.id, ...(student ? { publishedAt: { not: null } } : {}) },
    orderBy: { createdAt: 'desc' }
  })
  res.json({ reports: reports.map((r) => view(r, { forStudent: student })), items: student ? undefined : TEST_ITEMS, levels: LEVELS, aiEnabled: assistantEnabled() })
})

const patchSchema = z.object({
  answers: z.record(z.string().regex(/^\d{1,2}$/), z.enum(['ok', 'partly', 'no']).nullable()).optional(),
  teacherLevel: z.enum(['A1', 'A1+', 'A2', 'A2+', 'B1', 'B1+', 'B2', 'B2+', 'C1']).nullable().optional(),
  comments: z.string().max(4000).nullable().optional()
})

async function teacherReport(req, res) {
  const report = await prisma.trialReport.findUnique({ where: { id: req.params.id } })
  if (!report || !(await accessibleClassroom(req.user, report.classroomId))) { res.status(404).json({ error: 'Report not found' }); return null }
  return report
}

trialsRouter.patch('/:id', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const report = await teacherReport(req, res)
  if (!report) return
  const parsed = patchSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid data' })
  const data = {}
  if (parsed.data.answers) {
    const merged = { ...(report.answers ?? {}) }
    for (const [n, v] of Object.entries(parsed.data.answers)) { if (v) merged[n] = v; else delete merged[n] }
    data.answers = merged
  }
  if (parsed.data.teacherLevel !== undefined) data.teacherLevel = parsed.data.teacherLevel
  if (parsed.data.comments !== undefined) data.comments = parsed.data.comments
  const updated = await prisma.trialReport.update({ where: { id: report.id }, data })
  res.json({ report: view(updated) })
})

trialsRouter.post('/:id/generate', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const report = await teacherReport(req, res)
  if (!report) return
  const updated = await buildTrialReport(report.id)
  res.json({ report: view(updated) })
})

trialsRouter.post('/:id/publish', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const report = await teacherReport(req, res)
  if (!report) return
  if (!report.generated) return res.status(400).json({ error: 'Generate the report first' })
  const updated = await prisma.trialReport.update({ where: { id: report.id }, data: { publishedAt: req.body?.unpublish ? null : new Date() } })
  res.json({ report: view(updated) })
})

trialsRouter.delete('/:id', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const report = await teacherReport(req, res)
  if (!report) return
  await prisma.trialReport.delete({ where: { id: report.id } })
  res.json({ ok: true })
})

// One report, for the report page. Students only see published ones.
trialsRouter.get('/:id', async (req, res) => {
  const report = await prisma.trialReport.findUnique({
    where: { id: req.params.id },
    include: { classroom: { select: { student: { select: { name: true } }, teacher: { select: { name: true } } } } }
  })
  if (!report || !(await accessibleClassroom(req.user, report.classroomId))) return res.status(404).json({ error: 'Report not found' })
  if (req.user.role === 'STUDENT' && !report.publishedAt) return res.status(404).json({ error: 'Report not found' })
  res.json({
    report: {
      ...view(report, { forStudent: req.user.role === 'STUDENT' }),
      student: report.classroom.student?.name ?? '',
      teacher: report.classroom.teacher?.name ?? '',
      items: TEST_ITEMS.map((i) => ({ n: i.n, ru: i.ru, en: i.en, topic: i.topic, level: i.level, result: report.answers?.[i.n] ?? null }))
    }
  })
})
