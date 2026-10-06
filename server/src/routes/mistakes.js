import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db.js'
import { requireAuth } from '../auth.js'
import { accessibleClassroom } from './classrooms.js'
import { classifyMistake, topicLabel } from '../errorAnalysis.js'
import { assistantEnabled, classifyMistakeWithAi, judgeAnswer, draftMistakePrompt, draftSimilarDrills } from '../assistant.js'
import { unitsForTopics, unitsForMistake } from '../topicUnits.js'
import { checkAnswer } from '../answerCheck.js'

// The mistake notebook: written on the board during a lesson, kept per
// student, drilled in Practice, summarised in the analytics.
export const mistakesRouter = Router()
mistakesRouter.use(requireAuth)

// The rule-based classifier knows the textbook's topics; with the AI key
// the label comes from Claude instead, which reads the sentence properly.
// Nothing to classify yet without a correction — the teacher jotted down
// just the error to keep the lesson moving and can add it later (editing
// the note re-runs this).
async function topicsFor(said, correct) {
  if (!correct) return []
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
  // Empty for now is fine — a correction added later (PATCH) re-classifies
  // and drafts the drill task, neither of which mean anything without one.
  correct: z.string().trim().max(500),
  boardId: z.string().max(64).optional(),
  elementId: z.string().max(64).optional()
})

// The drill task, written by the AI when the key is there (once, then kept).
async function promptFor(mistake) {
  if (mistake.prompt || !mistake.correct) return mistake.prompt
  if (!assistantEnabled()) return null
  try {
    const prompt = await draftMistakePrompt({ said: mistake.said, correct: mistake.correct, topic: mistake.topics.map(topicLabel).join(', ') })
    if (prompt) { await prisma.lessonMistake.update({ where: { id: mistake.id }, data: { prompt } }); return prompt }
  } catch (error) {
    console.error('Drill prompt failed:', error.message)
  }
  return null
}

const view = (m, units = []) => ({
  id: m.id,
  units,
  prompt: m.prompt,
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
  if (!parsed.success) return res.status(400).json({ error: 'What the student said is needed' })
  const { said, correct, boardId, elementId } = parsed.data
  const topics = await topicsFor(said, correct)
  const mistake = await prisma.lessonMistake.create({
    data: { said, correct, topics, classroomId: classroom.id, studentId: classroom.studentId, teacherId: req.user.id, boardId, elementId }
  })
  res.status(201).json({ mistake: view(mistake) })
  // The drill task can wait a second; the teacher's panel must not.
  promptFor(mistake).catch(() => {})
})

mistakesRouter.patch('/:id', async (req, res) => {
  if (req.user.role === 'STUDENT') return res.status(403).json({ error: 'Teachers only' })
  const existing = await prisma.lessonMistake.findUnique({ where: { id: req.params.id } })
  if (!existing || !(await accessibleClassroom(req.user, existing.classroomId))) return res.status(404).json({ error: 'Not found' })
  const parsed = mistakeSchema.pick({ said: true, correct: true }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'What the student said is needed' })
  const { said, correct } = parsed.data
  const topics = await topicsFor(said, correct)
  const mistake = await prisma.lessonMistake.update({ where: { id: existing.id }, data: { said, correct, topics, prompt: null } })
  res.json({ mistake: view(mistake) })
  promptFor(mistake).catch(() => {})
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
  // Nothing to drill on one that's still missing its correction.
  const mistakes = (await prisma.lessonMistake.findMany({ where: { studentId: req.user.id } })).filter((m) => m.correct)
  mistakes.sort((a, b) => (a.lastPracticedAt?.getTime() ?? 0) - (b.lastPracticedAt?.getTime() ?? 0) || b.createdAt - a.createdAt)
  const units = await unitsForTopics(req.user.schoolId, mistakes.flatMap((m) => m.topics))
  let drafted = 0
  const exercises = []
  for (const m of mistakes) {
    let prompt = m.prompt
    if (!prompt && drafted < 8) { prompt = await promptFor(m); drafted++ }
    exercises.push({
      id: m.id,
      said: m.said,
      prompt,
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
      const verdict = await judgeAnswer({ said: mistake.said, correct: mistake.correct, answer, topic: mistake.topics.map(topicLabel).join(', '), prompt: mistake.prompt })
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

// "Practice similar": a few new sentences on the same grammar point, made by
// the AI once per mistake and kept, then checked like the mistake itself.
mistakesRouter.get('/practice/:id/similar', async (req, res) => {
  const mistake = await prisma.lessonMistake.findFirst({ where: { id: req.params.id, studentId: req.user.id } })
  if (!mistake) return res.status(404).json({ error: 'Not found' })
  let items = Array.isArray(mistake.similar) ? mistake.similar : null
  if (!items?.length) {
    if (!assistantEnabled()) return res.status(503).json({ error: 'Similar sentences need the AI assistant, which is not set up' })
    try {
      items = await draftSimilarDrills({ said: mistake.said, correct: mistake.correct, topic: mistake.topics.map(topicLabel).join(', ') })
    } catch (error) {
      console.error('Similar drills failed:', error.message)
    }
    if (!items?.length) return res.status(502).json({ error: 'Could not make sentences right now, try again in a minute' })
    await prisma.lessonMistake.update({ where: { id: mistake.id }, data: { similar: items } })
  }
  res.json({ items: items.map((i, index) => ({ index, prompt: i.prompt })), labels: mistake.topics.map(topicLabel) })
})

mistakesRouter.post('/practice/:id/similar/:index/attempt', async (req, res) => {
  const mistake = await prisma.lessonMistake.findFirst({ where: { id: req.params.id, studentId: req.user.id } })
  const item = Array.isArray(mistake?.similar) ? mistake.similar[Number(req.params.index)] : null
  if (!item) return res.status(404).json({ error: 'Not found' })
  const answer = typeof req.body?.answer === 'string' ? req.body.answer.slice(0, 500) : ''
  let result = checkAnswer(answer, [item.answer], { prompt: item.prompt })
  let feedback = ''
  if (!result.correct && assistantEnabled() && answer.trim()) {
    try {
      const verdict = await judgeAnswer({ said: `(a new sentence on the same grammar point as the learner's earlier mistake: ${mistake.said})`, correct: item.answer, answer, topic: mistake.topics.map(topicLabel).join(', '), prompt: item.prompt })
      if (verdict) { result = { correct: verdict.correct }; feedback = verdict.feedback }
    } catch (error) {
      console.error('Similar judge failed:', error.message)
    }
  }
  res.json({ correct: result.correct, expected: item.answer, feedback })
})
