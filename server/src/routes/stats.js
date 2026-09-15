import { Router } from 'express'
import { prisma } from '../db.js'
import { requireAuth, requireRole, isAdmin } from '../auth.js'
import { topicLabel } from '../errorAnalysis.js'

export const statsRouter = Router()

statsRouter.use(requireAuth)

const RECENT_DAYS = 30

// Which students a teacher may look at: all of the school for the owner, only
// linked students for a teacher.
async function visibleStudentIds(user) {
  if (isAdmin(user)) {
    const students = await prisma.user.findMany({
      where: { schoolId: user.schoolId, role: 'STUDENT' },
      select: { id: true }
    })
    return students.map((s) => s.id)
  }
  const links = await prisma.teacherStudent.findMany({
    where: { teacherId: user.id },
    select: { studentId: true }
  })
  return links.map((l) => l.studentId)
}

// Turns raw attempts into the picture a teacher needs: accuracy, the topics
// that keep going wrong, and which chapters drill those topics.
async function analyse(attempts, schoolId) {
  const total = attempts.length
  const correct = attempts.filter((a) => a.correct).length
  const since = new Date(Date.now() - RECENT_DAYS * 86400000)

  const topicErrors = new Map()
  for (const attempt of attempts) {
    if (attempt.correct) continue
    const recent = attempt.createdAt >= since
    for (const topic of attempt.errorTopics) {
      const entry = topicErrors.get(topic) ?? { topic, count: 0, recent: 0 }
      entry.count++
      if (recent) entry.recent++
      topicErrors.set(topic, entry)
    }
  }

  // How often a topic *could* have gone wrong, so a topic met 40 times with 4
  // slips is not ranked above one met 5 times with 4 slips.
  const topicExposure = new Map()
  for (const attempt of attempts) {
    for (const tag of attempt.exercise.tags) {
      topicExposure.set(tag, (topicExposure.get(tag) ?? 0) + 1)
    }
  }

  const weakTopics = [...topicErrors.values()]
    .filter((entry) => entry.topic !== 'vocabulary')
    .map((entry) => {
      const exposure = topicExposure.get(entry.topic) ?? entry.count
      return {
        ...entry,
        label: topicLabel(entry.topic),
        errorRate: Math.round((entry.count / Math.max(exposure, entry.count)) * 100),
        exposure
      }
    })
    // Recent mistakes weigh more: a topic fixed last month should drop away.
    .sort((a, b) => b.recent * 2 + b.count - (a.recent * 2 + a.count))
    .slice(0, 5)

  // Chapters whose exercises carry the weak topics, for "what to revisit".
  const suggestions = []
  if (weakTopics.length) {
    const units = await prisma.unit.findMany({
      where: { schoolId },
      select: {
        id: true,
        title: true,
        exercises: { select: { tags: true } }
      },
      orderBy: { position: 'asc' }
    })

    for (const weak of weakTopics.slice(0, 3)) {
      const covering = units
        .map((unit) => ({
          id: unit.id,
          title: unit.title,
          hits: unit.exercises.filter((e) => e.tags.includes(weak.topic)).length
        }))
        .filter((unit) => unit.hits >= 5)
        .sort((a, b) => b.hits - a.hits)
        .slice(0, 2)

      if (covering.length) {
        suggestions.push({
          topic: weak.topic,
          label: weak.label,
          units: covering.map(({ id, title, hits }) => ({ id, title, exercises: hits }))
        })
      }
    }
  }

  const recentMistakes = attempts
    .filter((a) => !a.correct)
    .slice(0, 8)
    .map((a) => ({
      prompt: a.exercise.prompt,
      expected: a.exercise.answers[0],
      answer: a.answer,
      topics: a.errorTopics.map(topicLabel),
      at: a.createdAt
    }))

  const lastActive = attempts[0]?.createdAt ?? null

  return {
    total,
    correct,
    accuracy: total ? Math.round((correct / total) * 100) : null,
    recentTotal: attempts.filter((a) => a.createdAt >= since).length,
    lastActive,
    weakTopics,
    suggestions,
    recentMistakes
  }
}

const ATTEMPT_INCLUDE = {
  exercise: { select: { prompt: true, answers: true, tags: true, unitId: true } }
}

statsRouter.get('/students', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const ids = await visibleStudentIds(req.user)

  const students = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' }
  })

  const rows = []
  for (const student of students) {
    const attempts = await prisma.attempt.findMany({
      where: { studentId: student.id },
      include: ATTEMPT_INCLUDE,
      orderBy: { createdAt: 'desc' }
    })
    const summary = await analyse(attempts, req.user.schoolId)
    rows.push({
      id: student.id,
      name: student.name,
      email: student.email,
      total: summary.total,
      accuracy: summary.accuracy,
      recentTotal: summary.recentTotal,
      lastActive: summary.lastActive,
      weakTopics: summary.weakTopics.slice(0, 3).map((t) => t.label)
    })
  }

  res.json({ students: rows })
})

statsRouter.get('/students/:id', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const ids = await visibleStudentIds(req.user)
  if (!ids.includes(req.params.id)) return res.status(404).json({ error: 'Student not found' })

  const student = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: { id: true, name: true, email: true }
  })

  const attempts = await prisma.attempt.findMany({
    where: { studentId: student.id },
    include: ATTEMPT_INCLUDE,
    orderBy: { createdAt: 'desc' }
  })

  // Per-chapter accuracy.
  const units = await prisma.unit.findMany({
    where: { schoolId: req.user.schoolId },
    select: { id: true, title: true, _count: { select: { exercises: true } } },
    orderBy: { position: 'asc' }
  })

  const perUnit = new Map(units.map((u) => [u.id, { id: u.id, title: u.title, total: u._count.exercises, attempts: 0, correct: 0, solved: new Set() }]))
  for (const attempt of attempts) {
    const entry = perUnit.get(attempt.exercise.unitId)
    if (!entry) continue
    entry.attempts++
    if (attempt.correct) {
      entry.correct++
      entry.solved.add(attempt.exerciseId)
    }
  }

  const summary = await analyse(attempts, req.user.schoolId)

  res.json({
    student,
    ...summary,
    units: [...perUnit.values()]
      .filter((u) => u.attempts > 0)
      .map((u) => ({
        id: u.id,
        title: u.title,
        total: u.total,
        solved: u.solved.size,
        attempts: u.attempts,
        accuracy: Math.round((u.correct / u.attempts) * 100)
      }))
  })
})

// A student's own view of where they stand.
statsRouter.get('/me', async (req, res) => {
  const attempts = await prisma.attempt.findMany({
    where: { studentId: req.user.id },
    include: ATTEMPT_INCLUDE,
    orderBy: { createdAt: 'desc' }
  })
  const summary = await analyse(attempts, req.user.schoolId)
  res.json({
    total: summary.total,
    accuracy: summary.accuracy,
    weakTopics: summary.weakTopics.slice(0, 3),
    suggestions: summary.suggestions
  })
})
