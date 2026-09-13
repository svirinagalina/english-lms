import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db.js'
import { requireAuth, requireRole } from '../auth.js'
import { checkAnswer, diffWords } from '../answerCheck.js'

export const unitsRouter = Router()

unitsRouter.use(requireAuth)

const FOLLOW_UP_COUNT = 3

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
      solved: solvedPerUnit[unit.id] ?? 0
    }))
  })
})

unitsRouter.get('/:id', async (req, res) => {
  const unit = await prisma.unit.findFirst({
    where: { id: req.params.id, schoolId: req.user.schoolId },
    include: { exercises: { orderBy: { position: 'asc' } } }
  })
  if (!unit) return res.status(404).json({ error: 'Unit not found' })

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
    where: { id: req.params.id, unit: { schoolId: req.user.schoolId } }
  })
  if (!exercise) return res.status(404).json({ error: 'Exercise not found' })

  const result = checkAnswer(parsed.data.answer, exercise.answers)

  await prisma.attempt.create({
    data: {
      exerciseId: exercise.id,
      studentId: req.user.id,
      answer: parsed.data.answer,
      correct: result.correct
    }
  })

  if (result.correct) {
    return res.json({ correct: true, accepted: result.matched })
  }

  // Wrong answer: pull extra drills on the same grammar topic that the student
  // has not already got right, so the mistake gets practised immediately.
  const alreadyCorrect = await prisma.attempt.findMany({
    where: { studentId: req.user.id, correct: true },
    select: { exerciseId: true },
    distinct: ['exerciseId']
  })

  const followUps = exercise.tags.length
    ? await prisma.exercise.findMany({
        where: {
          id: { notIn: [exercise.id, ...alreadyCorrect.map((a) => a.exerciseId)] },
          tags: { hasSome: exercise.tags },
          unit: { schoolId: req.user.schoolId }
        },
        take: FOLLOW_UP_COUNT,
        orderBy: { position: 'asc' }
      })
    : []

  res.json({
    correct: false,
    expected: exercise.answers[0],
    alternatives: exercise.answers.slice(1),
    diff: diffWords(parsed.data.answer, exercise.answers[0]),
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
