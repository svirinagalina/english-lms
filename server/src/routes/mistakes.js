import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db.js'
import { requireAuth } from '../auth.js'
import { accessibleClassroom } from './classrooms.js'
import { classifyMistake, topicLabel } from '../errorAnalysis.js'
import { assistantEnabled, classifyMistakeWithAi, judgeAnswer } from '../assistant.js'
import { unitsForTopics, unitsForMistake } from '../topicUnits.js'
import { checkAnswer } from '../answerCheck.js'

// The mistake notebook: written on the board during a lesson, kept per
// student, drilled in Practice, summarised in the analytics.
export const mistakesRouter = Router()
mistakesRouter.use(requireAuth)

// The rule-based classifier knows the textbook's topics; with the AI key
// the label comes from Claude instead, which reads the sentence properly.
async function topicsFor(said, correct) {
  if (said.trim().toLowerCase() === correct.trim().toLowerCase()) return []
  if (assistantEnabled()) {
    try {
      const ai = await classifyMistakeWithAi(said, correct)
      if (ai?.topic) return [ai.topic.trim().slice(0, 60)]
    } catch (error) {
      console.error('Mistake classification (AI) failed:', error.message)
    }
  }
  return classifyMistake(said, correct).topics
}

const mistakeSchema = z.object({
  said: z.string().trim().min(1).max(500),
  correct: z.string().trim().min(1).max(500),
  boardId: z.string().max(64).optional(),
  elementId: z.string().max(64).optional()
})

const view = (m, units = []) => ({
  id: m.id,
  units,
  said: m.said,
  correct: m.correct,
  topics: m.topics,
  labels: m.topics.map(topicLabel),
  createdAt: m.createdAt,
  practicedCorrect: m.practicedCorrect,
  lastPracticedAt: m.lastPracticedAt,
  boardId: m.boardId,
  elementId: m.elementId
})

// Everything in a student's notebook (their own, or a classroom the
// teacher can open), newest first.
mistakesRouter.get('/classroom/:id', async (req, res) => {
  const classroom = await accessibleClassroom(req.user, req.params.id)
  if (!classroom) return res.status(404).json({ error: 'Classroom not found' })
  // A student sees their whole notebook (every classroom); a teacher this classroom's.
  const where = req.user.role === 'STUDENT' ? { studentId: req.user.id } : { classroomId: classroom.id }
  const mistakes = await prisma.lessonMistake.findMany({ where, orderBy: { createdAt: 'desc' } })
  const units = await unitsForTopics(req.user.schoolId, mistakes.flatMap((m) => m.topics))
  const views = []
  for (const m of mistakes) views.push(view(m, await unitsForMistake(req.user.schoolId, m.correct, m.topics, units)))
  res.json({ mistakes: views })
})

mistakesRouter.post('/classroom/:id', async (req, res) => {
  if (req.user.role === 'STUDENT') return res.status(403).json({ error: 'Teachers only' })
  const classroom = await accessibleClassroom(req.user, req.params.id)
  if (!classroom || !classroom.studentId) return res.status(404).json({ error: 'Classroom not found' })
  const parsed = mistakeSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Both sentences are needed' })
  const { said, correct, boardId, elementId } = parsed.data
  const topics = await topicsFor(said, correct)
  const mistake = await prisma.lessonMistake.create({
    data: { said, correct, topics, classroomId: classroom.id, studentId: classroom.studentId, teacherId: req.user.id, boardId, elementId }
  })
  res.status(201).json({ mistake: view(mistake) })
})

mistakesRouter.patch('/:id', async (req, res) => {
  if (req.user.role === 'STUDENT') return res.status(403).json({ error: 'Teachers only' })
  const existing = await prisma.lessonMistake.findUnique({ where: { id: req.params.id } })
  if (!existing || !(await accessibleClassroom(req.user, existing.classroomId))) return res.status(404).json({ error: 'Not found' })
  const parsed = mistakeSchema.pick({ said: true, correct: true }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Both sentences are needed' })
  const { said, correct } = parsed.data
  const topics = await topicsFor(said, correct)
  const mistake = await prisma.lessonMistake.update({ where: { id: existing.id }, data: { said, correct, topics } })
  res.json({ mistake: view(mistake) })
})

mistakesRouter.delete('/:id', async (req, res) => {
  if (req.user.role === 'STUDENT') return res.status(403).json({ error: 'Teachers only' })
  const existing = await prisma.lessonMistake.findUnique({ where: { id: req.params.id } })
  if (!existing || !(await accessibleClassroom(req.user, existing.classroomId))) return res.status(404).json({ error: 'Not found' })
  await prisma.lessonMistake.delete({ where: { id: existing.id } })
  res.json({ ok: true })
})

// A board note that carried a mistake was deleted: drop the record too.
mistakesRouter.delete('/element/:elementId', async (req, res) => {
  if (req.user.role === 'STUDENT') return res.status(403).json({ error: 'Teachers only' })
  const existing = await prisma.lessonMistake.findFirst({ where: { elementId: req.params.elementId } })
  if (!existing || !(await accessibleClassroom(req.user, existing.classroomId))) return res.json({ ok: true })
  await prisma.lessonMistake.delete({ where: { id: existing.id } })
  res.json({ ok: true })
})

// --- Drills: the student's own mistakes as practice --------------------------

// Least recently practised first; ones never practised come before all.
mistakesRouter.get('/practice', async (req, res) => {
  if (req.user.role !== 'STUDENT') return res.json({ exercises: [] })
  const mistakes = await prisma.lessonMistake.findMany({ where: { studentId: req.user.id } })
  mistakes.sort((a, b) => (a.lastPracticedAt?.getTime() ?? 0) - (b.lastPracticedAt?.getTime() ?? 0) || b.createdAt - a.createdAt)
  const units = await unitsForTopics(req.user.schoolId, mistakes.flatMap((m) => m.topics))
  const exercises = []
  for (const m of mistakes) {
    exercises.push({
      id: m.id,
      said: m.said,
      labels: m.topics.map(topicLabel),
      units: await unitsForMistake(req.user.schoolId, m.correct, m.topics, units),
      practicedCorrect: m.practicedCorrect,
      createdAt: m.createdAt
    })
  }
  res.json({ exercises })
})

mistakesRouter.post('/practice/:id/attempt', async (req, res) => {
  const mistake = await prisma.lessonMistake.findFirst({ where: { id: req.params.id, studentId: req.user.id } })
  if (!mistake) return res.status(404).json({ error: 'Not found' })
  const answer = typeof req.body?.answer === 'string' ? req.body.answer : ''
  // Exact or near-exact match first (free); otherwise the AI judges the
  // grammar point, so a correct wording that differs from the teacher's counts.
  let result = checkAnswer(answer, [mistake.correct], { prompt: mistake.said })
  let feedback = ''
  if (!result.correct && assistantEnabled() && answer.trim()) {
    try {
      const verdict = await judgeAnswer({ said: mistake.said, correct: mistake.correct, answer, topic: mistake.topics.map(topicLabel).join(', ') })
      if (verdict) { result = { correct: verdict.correct }; feedback = verdict.feedback }
    } catch (error) {
      console.error('Drill judge failed:', error.message)
    }
  }
  await prisma.lessonMistake.update({
    where: { id: mistake.id },
    data: { lastPracticedAt: new Date(), ...(result.correct ? { practicedCorrect: { increment: 1 } } : {}) }
  })
  res.json({ correct: result.correct, expected: mistake.correct, feedback })
})
