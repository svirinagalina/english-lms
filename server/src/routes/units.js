import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db.js'
import { requireAuth, requireRole, lockedFor as planLocked } from '../auth.js'
import { entitlements, aiChecksLeft, useAiCheck } from '../plans.js'
import { openUnitIds } from '../freeTier.js'
import { checkAnswer, normalise } from '../answerCheck.js'
import { assistantEnabled, judgeExerciseAnswer } from '../assistant.js'
import { classifyMistake, topicLabel } from '../errorAnalysis.js'

export const unitsRouter = Router()

unitsRouter.use(requireAuth)

// A free user opens only the first units of the book (see freeTier.js).
// Practice (a plan, or a teacher) opens all of them.
const lockedFor = async (user, unitId) => !entitlements(user).practice && !(await openUnitIds(user.schoolId)).includes(unitId)
const LOCKED = planLocked('practice')

const FOLLOW_UP_COUNT = 3

// AI verdicts on answers that didn't match the key: the same answer to the
// same exercise is judged once, not on every attempt by every student.
const verdicts = new Map()
const AI_TYPES = new Set(['TRANSLATE', 'FILL_BLANK'])
const AI_TIMEOUT_MS = 20000

async function aiVerdict(exercise, answer) {
  const key = `${exercise.id}\u0000${normalise(answer)}`
  if (verdicts.has(key)) return verdicts.get(key)
  const verdict = await Promise.race([
    judgeExerciseAnswer({ chapter: exercise.unit.title, type: exercise.type, prompt: exercise.prompt, accepted: exercise.answers, answer }),
    new Promise((resolve) => setTimeout(() => resolve(null), AI_TIMEOUT_MS))
  ])
  if (verdict) {
    if (verdicts.size > 5000) verdicts.clear()
    verdicts.set(key, verdict)
  }
  return verdict
}
const NO_DRILL_TOPICS = new Set(['vocabulary', 'word-order', 'spelling'])

// Students must never receive the answers with the exercise list.
const publicExercise = (exercise) => ({
  id: exercise.id,
  type: exercise.type,
  prompt: exercise.prompt,
  tags: exercise.tags,
  position: exercise.position,
  payload: exercise.payload
})

unitsRouter.get('/', async (req, res) => {
  const units = await prisma.unit.findMany({
    where: { schoolId: req.user.schoolId },
    orderBy: { position: 'asc' },
    select: {
      id: true,
      title: true,
      position: true,
      _count: { select: { exercises: true } }
    }
  })

  const attempts = await prisma.attempt.groupBy({
    by: ['exerciseId'],
    where: { studentId: req.user.id, correct: true }
  })
  const solved = new Set(attempts.map((a) => a.exerciseId))

  const exercises = await prisma.exercise.findMany({
    where: { unit: { schoolId: req.user.schoolId } },
    select: { id: true, unitId: true }
  })

  const open = entitlements(req.user).practice ? null : new Set(await openUnitIds(req.user.schoolId))
  const solvedPerUnit = {}
  for (const exercise of exercises) {
    if (solved.has(exercise.id)) {
      solvedPerUnit[exercise.unitId] = (solvedPerUnit[exercise.unitId] ?? 0) + 1
    }
  }

  res.json({
    units: units.map((unit) => ({
      id: unit.id,
      title: unit.title,
      position: unit.position,
      total: unit._count.exercises,
      solved: solvedPerUnit[unit.id] ?? 0,
      ...(open && !open.has(unit.id) ? { locked: true } : {})
    }))
  })
})

unitsRouter.get('/:id', async (req, res) => {
  const unit = await prisma.unit.findFirst({
    where: { id: req.params.id, schoolId: req.user.schoolId },
    include: { exercises: { orderBy: { position: 'asc' } } }
  })
  if (!unit) return res.status(404).json({ error: 'Unit not found' })
  if (await lockedFor(req.user, unit.id)) return res.status(403).json(LOCKED)

  const solved = await prisma.attempt.findMany({
    where: { studentId: req.user.id, correct: true, exercise: { unitId: unit.id } },
    select: { exerciseId: true },
    distinct: ['exerciseId']
  })

  res.json({
    unit: {
      id: unit.id,
      title: unit.title,
      theory: unit.theory,
      exercises: unit.exercises.map(publicExercise),
      solvedIds: solved.map((s) => s.exerciseId)
    }
  })
})

const attemptSchema = z.object({ answer: z.string().max(1000) })

unitsRouter.post('/exercises/:id/attempt', async (req, res) => {
  const parsed = attemptSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid data' })

  const exercise = await prisma.exercise.findFirst({
    where: { id: req.params.id, unit: { schoolId: req.user.schoolId } },
    include: { unit: { select: { position: true, title: true } } }
  })
  if (!exercise) return res.status(404).json({ error: 'Exercise not found' })
  if (await lockedFor(req.user, exercise.unitId)) return res.status(403).json(LOCKED)

  // The key first (free and instant); an answer it doesn't cover goes to the
  // AI configured in Settings, which accepts any correct variant in context.
  let result = checkAnswer(parsed.data.answer, exercise.answers, { prompt: exercise.prompt })
  let feedback = ''
  // The free tier has a daily allowance of AI checks; the key check always runs.
  let aiLimited = false
  if (!result.correct && assistantEnabled() && AI_TYPES.has(exercise.type) && parsed.data.answer.trim() && aiChecksLeft(req.user) <= 0) aiLimited = true
  else if (!result.correct && assistantEnabled() && AI_TYPES.has(exercise.type) && parsed.data.answer.trim()) {
    useAiCheck(req.user)
    try {
      const verdict = await aiVerdict(exercise, parsed.data.answer)
      if (verdict) {
        feedback = verdict.feedback
        if (verdict.correct) result = { correct: true, matched: parsed.data.answer, byAi: true }
      }
    } catch (error) {
      console.error('Exercise judge failed:', error.message)
    }
  }

  // Classify against the reference answer so the follow-up drills target the
  // actual slip (a missing article, a wrong tense) rather than the chapter.
  const analysis = result.correct
    ? { topics: [], missing: [], extra: [] }
    : classifyMistake(parsed.data.answer, exercise.answers[0])

  await prisma.attempt.create({
    data: {
      exerciseId: exercise.id,
      studentId: req.user.id,
      answer: parsed.data.answer,
      correct: result.correct,
      errorTopics: analysis.topics
    }
  })

  if (result.correct) {
    // Accepted by the AI: also show what the book has, for comparison.
    return res.json({ correct: true, accepted: result.matched, feedback, expected: result.byAi ? exercise.answers[0] : undefined })
  }

  const alreadyCorrect = await prisma.attempt.findMany({
    where: { studentId: req.user.id, correct: true },
    select: { exerciseId: true },
    distinct: ['exerciseId']
  })
  const exclude = [exercise.id, ...alreadyCorrect.map((a) => a.exerciseId)]

  // Drills target the grammar behind the slip. A typo, a different word or
  // a word-order slip gets no extra sentences: there is nothing to drill.
  // Sentences come only from chapters up to the current one, nearest first,
  // so a beginner in chapter 1 is never handed conditionals.
  const drillTopics = analysis.topics.filter((topic) => !NO_DRILL_TOPICS.has(topic))

  const reachable = { schoolId: req.user.schoolId, position: { lte: exercise.unit.position } }
  // A handful of candidates from the nearest chapters, a few of them at
  // random, so the same slip does not bring the same three sentences every time.
  const pickDrills = async (tags, notIn) => {
    const candidates = await prisma.exercise.findMany({
      where: { id: { notIn }, tags: { hasSome: tags }, unit: reachable },
      take: FOLLOW_UP_COUNT * 4,
      orderBy: [{ unit: { position: 'desc' } }, { position: 'asc' }]
    })
    return candidates.sort(() => Math.random() - 0.5).slice(0, FOLLOW_UP_COUNT)
  }

  let followUps = drillTopics.length ? await pickDrills(drillTopics, exclude) : []

  // No tagged sentences for that topic yet (early chapters): drill the
  // chapter's own topic instead.
  if (drillTopics.length && !followUps.length && exercise.tags.length) {
    followUps = await pickDrills(exercise.tags, exclude)
  }

  res.json({
    correct: false,
    feedback,
    aiLimited,
    expected: exercise.answers[0],
    alternatives: exercise.answers.slice(1),
    diff: { missing: analysis.missing, extra: analysis.extra },
    mistake: {
      topics: analysis.topics,
      labels: analysis.topics.map(topicLabel)
    },
    followUps: followUps.map(publicExercise)
  })
})

// Teacher view: who is struggling with what.
unitsRouter.get('/:id/progress', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const unit = await prisma.unit.findFirst({
    where: { id: req.params.id, schoolId: req.user.schoolId },
    select: { id: true }
  })
  if (!unit) return res.status(404).json({ error: 'Unit not found' })

  const attempts = await prisma.attempt.findMany({
    where: { exercise: { unitId: unit.id } },
    include: {
      student: { select: { id: true, name: true } },
      exercise: { select: { prompt: true, answers: true } }
    },
    orderBy: { createdAt: 'desc' },
    take: 200
  })

  res.json({
    attempts: attempts.map((attempt) => ({
      id: attempt.id,
      student: attempt.student,
      prompt: attempt.exercise.prompt,
      expected: attempt.exercise.answers[0],
      answer: attempt.answer,
      correct: attempt.correct,
      createdAt: attempt.createdAt
    }))
  })
})
