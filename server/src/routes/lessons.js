import { Router } from 'express'
import { prisma } from '../db.js'
import { requireAuth } from '../auth.js'
import { accessibleClassroom } from './classrooms.js'
import { buildSummary } from '../lessonSummary.js'
import { assistantEnabled } from '../assistant.js'

// Lesson summaries of a classroom, and rebuilding one on request.
export const lessonsRouter = Router()
lessonsRouter.use(requireAuth)

const view = (s, mistakesById) => ({
  id: s.id,
  sessionId: s.sessionId,
  startedAt: s.session.startedAt,
  endedAt: s.session.endedAt,
  minutes: s.session.endedAt ? Math.max(1, Math.round((s.session.endedAt - s.session.startedAt) / 60000)) : null,
  topics: s.topics,
  words: s.words,
  mistakes: s.mistakeIds.map((id) => mistakesById.get(id)).filter(Boolean).map((m) => ({ id: m.id, said: m.said, correct: m.correct })),
  questions: s.questions,
  withAi: s.withAi,
  updatedAt: s.updatedAt
})

lessonsRouter.get('/classroom/:id/summaries', async (req, res) => {
  const classroom = await accessibleClassroom(req.user, req.params.id)
  if (!classroom) return res.status(404).json({ error: 'Classroom not found' })
  const summaries = await prisma.lessonSummary.findMany({
    where: { classroomId: classroom.id },
    include: { session: { select: { startedAt: true, endedAt: true } } },
    orderBy: { createdAt: 'desc' },
    take: 30
  })
  const ids = [...new Set(summaries.flatMap((s) => s.mistakeIds))]
  const mistakes = ids.length ? await prisma.lessonMistake.findMany({ where: { id: { in: ids } } }) : []
  const byId = new Map(mistakes.map((m) => [m.id, m]))
  // Sessions without a summary yet (older ones, or one still running).
  const covered = new Set(summaries.map((s) => s.sessionId))
  const sessions = await prisma.session.findMany({ where: { classroomId: classroom.id, counted: true }, orderBy: { startedAt: 'desc' }, take: 30, select: { id: true, startedAt: true, endedAt: true } })
  res.json({
    aiEnabled: assistantEnabled(),
    summaries: summaries.map((s) => view(s, byId)),
    pending: sessions.filter((s) => !covered.has(s.id)).map((s) => ({ sessionId: s.id, startedAt: s.startedAt, endedAt: s.endedAt }))
  })
})

// (Re)build the summary of one lesson — after adding the AI key, or after
// fixing the board. Teachers only.
lessonsRouter.post('/:sessionId/summary', async (req, res) => {
  if (req.user.role === 'STUDENT') return res.status(403).json({ error: 'Teachers only' })
  const session = await prisma.session.findUnique({ where: { id: req.params.sessionId }, select: { classroomId: true } })
  if (!session || !(await accessibleClassroom(req.user, session.classroomId))) return res.status(404).json({ error: 'Lesson not found' })
  const summary = await buildSummary(req.params.sessionId)
  if (!summary) return res.status(400).json({ error: 'This lesson has no student' })
  res.json({ ok: true })
})
