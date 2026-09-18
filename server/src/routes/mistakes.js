import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db.js'
import { requireAuth } from '../auth.js'
import { accessibleClassroom } from './classrooms.js'
import { classifyMistake, topicLabel } from '../errorAnalysis.js'
import { checkAnswer } from '../answerCheck.js'

// The mistake notebook: written on the board during a lesson, kept per
// student, drilled in Practice, summarised in the analytics.
export const mistakesRouter = Router()
mistakesRouter.use(requireAuth)

const mistakeSchema = z.object({
  said: z.string().trim().min(1).max(500),
  correct: z.string().trim().min(1).max(500),
  boardId: z.string().max(64).optional(),
  elementId: z.string().max(64).optional()
})

const view = (m) => ({
  id: m.id,
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
  const mistakes = await prisma.lessonMistake.findMany({ where: { classroomId: classroom.id }, orderBy: { createdAt: 'desc' } })
  res.json({ mistakes: mistakes.map(view) })
})

mistakesRouter.post('/classroom/:id', async (req, res) => {
  if (req.user.role === 'STUDENT') return res.status(403).json({ error: 'Teachers only' })
  const classroom = await accessibleClassroom(req.user, req.params.id)
  if (!classroom || !classroom.studentId) return res.status(404).json({ error: 'Classroom not found' })
  const parsed = mistakeSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Both sentences are needed' })
  const { said, correct, boardId, elementId } = parsed.data
  const topics = said.trim().toLowerCase() === correct.trim().toLowerCase() ? [] : classifyMistake(said, correct).topics
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
  const topics = said.toLowerCase() === correct.toLowerCase() ? [] : classifyMistake(said, correct).topics
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
  res.json({
    exercises: mistakes.map((m) => ({
      id: m.id,
      said: m.said,
      labels: m.topics.map(topicLabel),
      practicedCorrect: m.practicedCorrect,
      createdAt: m.createdAt
    }))
  })
})

mistakesRouter.post('/practice/:id/attempt', async (req, res) => {
  const mistake = await prisma.lessonMistake.findFirst({ where: { id: req.params.id, studentId: req.user.id } })
  if (!mistake) return res.status(404).json({ error: 'Not found' })
  const answer = typeof req.body?.answer === 'string' ? req.body.answer : ''
  const result = checkAnswer(answer, [mistake.correct], { prompt: mistake.said })
  await prisma.lessonMistake.update({
    where: { id: mistake.id },
    data: { lastPracticedAt: new Date(), ...(result.correct ? { practicedCorrect: { increment: 1 } } : {}) }
  })
  res.json({ correct: result.correct, expected: mistake.correct })
})
