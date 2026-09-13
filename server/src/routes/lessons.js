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
  teacher: lesson.teacher ? { id: lesson.teacher.id, name: lesson.teacher.name } : undefined,
  students: lesson.enrollments?.map((e) => ({ id: e.student.id, name: e.student.name }))
})

async function loadAccessibleLesson(user, lessonId) {
  const lesson = await prisma.lesson.findFirst({
    where: { id: lessonId, schoolId: user.schoolId },
    include: {
      teacher: { select: { id: true, name: true } },
      enrollments: { include: { student: { select: { id: true, name: true } } } }
    }
  })
  if (!lesson) return null

  const isTeacher = lesson.teacherId === user.id
  const isOwner = user.role === 'OWNER'
  const isEnrolled = lesson.enrollments.some((e) => e.studentId === user.id)

  return isTeacher || isOwner || isEnrolled ? lesson : null
}

lessonsRouter.get('/', async (req, res) => {
  const where =
    req.user.role === 'STUDENT'
      ? { schoolId: req.user.schoolId, enrollments: { some: { studentId: req.user.id } } }
      : req.user.role === 'OWNER'
        ? { schoolId: req.user.schoolId }
        : { schoolId: req.user.schoolId, teacherId: req.user.id }

  const lessons = await prisma.lesson.findMany({
    where,
    include: {
      teacher: { select: { id: true, name: true } },
      enrollments: { include: { student: { select: { id: true, name: true } } } }
    },
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
    include: {
      teacher: { select: { id: true, name: true } },
      enrollments: { include: { student: { select: { id: true, name: true } } } }
    }
  })

  res.status(201).json({ lesson: lessonView(lesson) })
})

lessonsRouter.get('/:id', async (req, res) => {
  const lesson = await loadAccessibleLesson(req.user, req.params.id)
  if (!lesson) return res.status(404).json({ error: 'Lesson not found' })
  res.json({ lesson: lessonView(lesson) })
})

lessonsRouter.post('/:id/students', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const { studentId } = req.body
  if (typeof studentId !== 'string') return res.status(400).json({ error: 'studentId required' })

  const lesson = await prisma.lesson.findFirst({
    where: { id: req.params.id, schoolId: req.user.schoolId }
  })
  if (!lesson) return res.status(404).json({ error: 'Lesson not found' })
  if (lesson.teacherId !== req.user.id && req.user.role !== 'OWNER') {
    return res.status(403).json({ error: 'Not your lesson' })
  }

  const student = await prisma.user.findFirst({
    where: { id: studentId, schoolId: req.user.schoolId, role: 'STUDENT' }
  })
  if (!student) return res.status(404).json({ error: 'Student not found' })

  await prisma.enrollment.upsert({
    where: { lessonId_studentId: { lessonId: lesson.id, studentId: student.id } },
    create: { lessonId: lesson.id, studentId: student.id },
    update: {}
  })

  res.status(201).json({ ok: true })
})

lessonsRouter.delete('/:id/students/:studentId', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const lesson = await prisma.lesson.findFirst({
    where: { id: req.params.id, schoolId: req.user.schoolId }
  })
  if (!lesson) return res.status(404).json({ error: 'Lesson not found' })
  if (lesson.teacherId !== req.user.id && req.user.role !== 'OWNER') {
    return res.status(403).json({ error: 'Not your lesson' })
  }

  await prisma.enrollment.deleteMany({
    where: { lessonId: lesson.id, studentId: req.params.studentId }
  })

  res.json({ ok: true })
})

export { loadAccessibleLesson }
