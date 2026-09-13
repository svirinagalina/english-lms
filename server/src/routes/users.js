import { Router } from 'express'
import { prisma } from '../db.js'
import { requireAuth, requireRole } from '../auth.js'

export const usersRouter = Router()

usersRouter.use(requireAuth)

const personView = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  createdAt: user.createdAt,
  priceAmount: user.priceAmount,
  priceCurrency: user.priceCurrency,
  paymentLink: user.paymentLink,
  paidUntil: user.paidUntil,
  teachers: user.studentLinks?.map((link) => ({ id: link.teacher.id, name: link.teacher.name })),
  students: user.teacherLinks?.map((link) => ({ id: link.student.id, name: link.student.name }))
})

const SELECT = {
  id: true, name: true, email: true, role: true, createdAt: true,
  priceAmount: true, priceCurrency: true, paymentLink: true, paidUntil: true,
  studentLinks: { include: { teacher: { select: { id: true, name: true } } } },
  teacherLinks: { include: { student: { select: { id: true, name: true } } } }
}

// Everyone sees a different slice: the owner sees the school, a teacher sees
// their own students, a student sees their teachers.
usersRouter.get('/', async (req, res) => {
  if (req.user.role === 'OWNER') {
    const users = await prisma.user.findMany({
      where: { schoolId: req.user.schoolId },
      select: SELECT,
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }]
    })
    return res.json({ people: users.map(personView) })
  }

  if (req.user.role === 'TEACHER') {
    const links = await prisma.teacherStudent.findMany({
      where: { teacherId: req.user.id },
      include: { student: { select: SELECT } }
    })
    return res.json({ people: links.map((link) => personView(link.student)) })
  }

  const links = await prisma.teacherStudent.findMany({
    where: { studentId: req.user.id },
    include: { teacher: { select: { id: true, name: true, email: true, role: true, createdAt: true } } }
  })
  res.json({ people: links.map((link) => personView(link.teacher)) })
})

usersRouter.get('/teachers', requireRole('OWNER'), async (req, res) => {
  const teachers = await prisma.user.findMany({
    where: { schoolId: req.user.schoolId, role: { in: ['OWNER', 'TEACHER'] } },
    select: { id: true, name: true, role: true },
    orderBy: { createdAt: 'asc' }
  })
  res.json({ teachers })
})

usersRouter.post('/links', requireRole('OWNER'), async (req, res) => {
  const { teacherId, studentId } = req.body ?? {}
  if (typeof teacherId !== 'string' || typeof studentId !== 'string') {
    return res.status(400).json({ error: 'teacherId and studentId are required' })
  }

  const [teacher, student] = await Promise.all([
    prisma.user.findFirst({
      where: { id: teacherId, schoolId: req.user.schoolId, role: { in: ['OWNER', 'TEACHER'] } }
    }),
    prisma.user.findFirst({
      where: { id: studentId, schoolId: req.user.schoolId, role: 'STUDENT' }
    })
  ])

  if (!teacher) return res.status(404).json({ error: 'Teacher not found' })
  if (!student) return res.status(404).json({ error: 'Student not found' })

  await prisma.teacherStudent.upsert({
    where: { teacherId_studentId: { teacherId, studentId } },
    create: { teacherId, studentId },
    update: {}
  })

  res.status(201).json({ ok: true })
})

usersRouter.delete('/links/:teacherId/:studentId', requireRole('OWNER'), async (req, res) => {
  const { teacherId, studentId } = req.params

  const teacher = await prisma.user.findFirst({
    where: { id: teacherId, schoolId: req.user.schoolId }
  })
  if (!teacher) return res.status(404).json({ error: 'Teacher not found' })

  await prisma.teacherStudent.deleteMany({ where: { teacherId, studentId } })
  res.json({ ok: true })
})

usersRouter.delete('/:id', requireRole('OWNER'), async (req, res) => {
  const target = await prisma.user.findFirst({
    where: { id: req.params.id, schoolId: req.user.schoolId }
  })
  if (!target) return res.status(404).json({ error: 'User not found' })
  if (target.id === req.user.id) return res.status(400).json({ error: 'Cannot remove yourself' })

  await prisma.user.delete({ where: { id: target.id } })
  res.json({ ok: true })
})
