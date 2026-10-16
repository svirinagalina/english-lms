import { Router } from 'express'
import { z } from 'zod'
import { randomBytes } from 'crypto'
import { prisma } from '../db.js'
import { requireAuth, requireRole } from '../auth.js'
import { accessibleClassroom } from './classrooms.js'
import { TEST_ITEMS, LEVELS, GRAMMAR_TOPICS, estimateLevel } from '../placementTest.js'
import { buildTrialReport } from '../trialReport.js'
import { assistantEnabled } from '../assistant.js'
import { sendTrialReportEmail } from '../mailer.js'
import { linkCallToAdventLesson, adventTrialReport } from '../adventLessons.js'
import { startTrialCall } from '../trialCalls.js'

// Trial lessons: a call that opens on the board the teacher prepared for the
// student; the placement test goes on it from the board's own Test button.
// Then the teacher's marks and the level report.
export const trialsRouter = Router()
trialsRouter.use(requireAuth)

const newId = () => randomBytes(16).toString('hex')

const originOf = (req) => process.env.CLIENT_ORIGIN ?? `${req.protocol}://${req.get('host')}`

// Start a trial lesson: the call on the student's board, an empty report.
trialsRouter.post('/', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const classroomId = typeof req.body?.classroomId === 'string' ? req.body.classroomId : ''
  const classroom = await accessibleClassroom(req.user, classroomId)
  if (!classroom || !classroom.studentId) return res.status(404).json({ error: 'Classroom not found' })
  const { status, body } = await startTrialCall(req.user, classroom, originOf(req))
  res.status(status).json(body)
})

// The placement test's sentences, for the board's Test button.
trialsRouter.get('/test-items', requireRole('OWNER', 'TEACHER'), (req, res) => {
  res.json({ items: TEST_ITEMS.map((i) => ({ n: i.n, ru: i.ru })) })
})

// The teacher's trial lessons that are over but whose report hasn't been
// sent: the home and student pages show a "Send the report" banner, however
// the teacher left the call (closed tab, student hung up…).
trialsRouter.get('/pending', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const reports = await prisma.trialReport.findMany({
    where: { teacherId: req.user.id, publishedAt: null, callId: { not: null }, createdAt: { gt: since } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, classroomId: true, callId: true, createdAt: true, classroom: { select: { student: { select: { name: true } } } } }
  })
  const ended = new Set((await prisma.call.findMany({
    where: { id: { in: reports.map((r) => r.callId) }, endedAt: { not: null } },
    select: { id: true }
  })).map((c) => c.id))
  res.json({
    reports: reports.filter((r) => ended.has(r.callId)).map((r) => ({
      id: r.id, classroomId: r.classroomId, createdAt: r.createdAt, student: r.classroom?.student?.name ?? 'the student'
    }))
  })
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
  focusTopics: forStudent ? undefined : r.focusTopics,
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
  res.json({ reports: reports.map((r) => view(r, { forStudent: student })), items: student ? undefined : TEST_ITEMS, topics: student ? undefined : GRAMMAR_TOPICS, levels: LEVELS, aiEnabled: assistantEnabled() })
})

const patchSchema = z.object({
  answers: z.record(z.string().regex(/^\d{1,2}$/), z.enum(['ok', 'partly', 'no']).nullable()).optional(),
  teacherLevel: z.enum(['A1', 'A1+', 'A2', 'A2+', 'B1', 'B1+', 'B2', 'B2+', 'C1']).nullable().optional(),
  comments: z.string().max(4000).nullable().optional(),
  focusTopics: z.array(z.string().max(120)).max(20).optional()
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
  if (parsed.data.focusTopics) data.focusTopics = parsed.data.focusTopics
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
  const publishing = !req.body?.unpublish
  const updated = await prisma.trialReport.update({ where: { id: report.id }, data: { publishedAt: publishing ? new Date() : null } })
  if (publishing) adventTrialReport(updated).catch(() => {})
  // The report's discount runs three days from now; a trial student's access
  // to the platform lasts at least as long (one date for them, not two).
  if (publishing) {
    const until = new Date(Date.now() + 3 * 86400000)
    await prisma.user.updateMany({ where: { id: report.studentId, trialAccessUntil: { not: null, lt: until } }, data: { trialAccessUntil: until } }).catch(() => {})
  }
  // The student gets the report by email the moment it is published.
  let mailed = false
  if (publishing) {
    const student = await prisma.user.findUnique({ where: { id: report.studentId }, select: { email: true, name: true } })
    if (student) {
      const origin = originOf(req)
      const result = await sendTrialReportEmail({
        to: student.email,
        name: student.name,
        level: updated.generated?.level ?? '',
        summary: updated.generated?.summary ?? '',
        reportLink: `${origin}/report/${updated.id}`,
        paymentLink: `${origin}/billing`
      })
      mailed = result.sent
    }
  }
  res.json({ report: view(updated), mailed })
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
