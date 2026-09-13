import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db.js'
import { requireAuth, requireRole } from '../auth.js'

export const lessonsRouter = Router()

lessonsRouter.use(requireAuth)

const createLessonSchema = z.object({
  title: z.string().min(2).max(200),
  scheduledAt: z.string().datetime().optional()
})

const lessonView = (lesson) => ({
  id: lesson.id,
  title: lesson.title,
  scheduledAt: lesson.scheduledAt,
  roomId: lesson.roomId,
  teacher: lesson.teacher ? { id: lesson.teacher.id, name: lesson.teacher.name } : undefined
})

const INCLUDE = { teacher: { select: { id: true, name: true } } }

// Teachers a student studies with; their lessons are the student's lessons.
async function teacherIdsFor(studentId) {
  const links = await prisma.teacherStudent.findMany({
    where: { studentId },
    select: { teacherId: true }
  })
  return links.map((link) => link.teacherId)
}

export async function loadAccessibleLesson(user, lessonId) {
  const lesson = await prisma.lesson.findFirst({
    where: { id: lessonId, schoolId: user.schoolId },
    include: INCLUDE
  })
  if (!lesson) return null

  if (user.role === 'OWNER' || lesson.teacherId === user.id) return lesson

  if (user.role === 'STUDENT') {
    const teacherIds = await teacherIdsFor(user.id)
    if (teacherIds.includes(lesson.teacherId)) return lesson
  }

  return null
}

lessonsRouter.get('/', async (req, res) => {
  let where

  if (req.user.role === 'OWNER') {
    where = { schoolId: req.user.schoolId }
  } else if (req.user.role === 'TEACHER') {
    where = { schoolId: req.user.schoolId, teacherId: req.user.id }
  } else {
    const teacherIds = await teacherIdsFor(req.user.id)
    where = { schoolId: req.user.schoolId, teacherId: { in: teacherIds } }
  }

  const lessons = await prisma.lesson.findMany({
    where,
    include: INCLUDE,
    orderBy: { createdAt: 'desc' }
  })

  res.json({ lessons: lessons.map(lessonView) })
})

lessonsRouter.post('/', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const parsed = createLessonSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid data', details: parsed.error.flatten().fieldErrors })
  }

  const lesson = await prisma.lesson.create({
    data: {
      title: parsed.data.title,
      scheduledAt: parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null,
      teacherId: req.user.id,
      schoolId: req.user.schoolId
    },
    include: INCLUDE
  })

  res.status(201).json({ lesson: lessonView(lesson) })
})

lessonsRouter.get('/:id', async (req, res) => {
  const lesson = await loadAccessibleLesson(req.user, req.params.id)
  if (!lesson) return res.status(404).json({ error: 'Lesson not found' })
  res.json({ lesson: lessonView(lesson) })
})

lessonsRouter.delete('/:id', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const lesson = await prisma.lesson.findFirst({
    where: { id: req.params.id, schoolId: req.user.schoolId }
  })
  if (!lesson) return res.status(404).json({ error: 'Lesson not found' })
  if (lesson.teacherId !== req.user.id && req.user.role !== 'OWNER') {
    return res.status(403).json({ error: 'Not your lesson' })
  }

  await prisma.lesson.delete({ where: { id: lesson.id } })
  res.json({ ok: true })
})
