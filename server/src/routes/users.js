import { Router } from 'express'
import { prisma } from '../db.js'
import { requireAuth, requireRole, isAdmin } from '../auth.js'
import { enrollStudent, moveStudent, unenrollStudent } from '../advent.js'

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
  // Signed up in the app, no teacher yet (see freeTier.js).
  free: user.free,
  trialRequestedAt: user.trialRequestedAt,
  trialRequestNote: user.trialRequestNote,
  plan: user.plan && user.planUntil && new Date(user.planUntil) > new Date() ? { id: user.plan, until: user.planUntil, source: user.planSource } : null,
  contact: [user.messenger, user.phone].filter(Boolean).join(' · ') || null,
  teachers: user.studentLinks?.map((link) => ({ id: link.teacher.id, name: link.teacher.name })),
  students: user.teacherLinks?.map((link) => ({ id: link.student.id, name: link.student.name })),
  // A student's cabinets (one per teacher), for "Open cabinet" in People.
  classrooms: user.studentClassrooms?.map((c) => ({ id: c.id, teacherId: c.teacherId }))
})

const SELECT = {
  id: true, name: true, email: true, role: true, createdAt: true,
  priceAmount: true, priceCurrency: true, paymentLink: true, paidUntil: true,
  free: true, trialRequestedAt: true, trialRequestNote: true, messenger: true, phone: true,
  studentLinks: { include: { teacher: { select: { id: true, name: true } } } },
  teacherLinks: { include: { student: { select: { id: true, name: true } } } },
  studentClassrooms: { select: { id: true, teacherId: true } }
}

// Everyone sees a different slice: the owner sees the school, a teacher sees
// their own students, a student sees their teachers.
usersRouter.get('/', async (req, res) => {
  if (isAdmin(req.user)) {
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
    where: { schoolId: req.user.schoolId, role: { in: ['OWNER', 'PARTNER', 'TEACHER'] } },
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
      where: { id: teacherId, schoolId: req.user.schoolId, role: { in: ['OWNER', 'PARTNER', 'TEACHER'] } }
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
  // A free app user with a teacher is a student: everything opens, and the
  // trainer gets full access like every other student's.
  if (student.free) {
    await prisma.user.update({ where: { id: student.id }, data: { free: false } })
    enrollStudent(student.email, student.name)
  }

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

// Only the owner hands out roles; a partner cannot promote or demote anyone.
// Takes effect on the person's next request — no re-login needed.
const ASSIGNABLE_ROLES = ['TEACHER', 'STUDENT', 'PARTNER']

usersRouter.patch('/:id/role', async (req, res) => {
  if (req.user.role !== 'OWNER') return res.status(403).json({ error: 'Only the administrator can change roles' })
  const { role } = req.body ?? {}
  if (!ASSIGNABLE_ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' })

  const target = await prisma.user.findFirst({
    where: { id: req.params.id, schoolId: req.user.schoolId }
  })
  if (!target) return res.status(404).json({ error: 'User not found' })
  if (target.id === req.user.id) return res.status(400).json({ error: 'Cannot change your own role' })

  // Staff are never on the free tier.
  await prisma.user.update({ where: { id: target.id }, data: { role, ...(role !== 'STUDENT' ? { free: false } : {}) } })
  res.json({ ok: true })
})

// Name and email of a student or teacher can be corrected by an admin.
// The owner edits anyone's name and email; a teacher, the name of one of
// their own students (a typo, a surname added after a trial lesson).
usersRouter.patch('/:id', requireRole('OWNER', 'TEACHER', 'PARTNER'), async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : undefined
  let email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : undefined
  if (req.user.role !== 'OWNER') {
    const own = await prisma.teacherStudent.findFirst({ where: { teacherId: req.user.id, studentId: req.params.id } })
    if (!own) return res.status(403).json({ error: 'You can only rename your own students' })
    email = undefined
  }
  if (name !== undefined && (name.length < 2 || name.length > 80)) return res.status(400).json({ error: 'Name must be 2–80 characters' })
  if (email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email' })

  const target = await prisma.user.findFirst({ where: { id: req.params.id, schoolId: req.user.schoolId } })
  if (!target) return res.status(404).json({ error: 'User not found' })
  if (req.user.role !== 'OWNER' && isAdmin(target) && target.id !== req.user.id) {
    return res.status(403).json({ error: 'Only the administrator can edit an administrator or partner' })
  }
  if (email && email !== target.email && await prisma.user.findUnique({ where: { email } })) {
    return res.status(409).json({ error: 'An account with this email already exists' })
  }

  await prisma.user.update({ where: { id: target.id }, data: { ...(name !== undefined ? { name } : {}), ...(email !== undefined ? { email } : {}) } })
  if (target.role === 'STUDENT' && email && email !== target.email) moveStudent(target.email, email, name ?? target.name)
  res.json({ ok: true })
})

usersRouter.delete('/:id', requireRole('OWNER'), async (req, res) => {
  const target = await prisma.user.findFirst({
    where: { id: req.params.id, schoolId: req.user.schoolId }
  })
  if (!target) return res.status(404).json({ error: 'User not found' })
  if (target.id === req.user.id) return res.status(400).json({ error: 'Cannot remove yourself' })
  if (req.user.role !== 'OWNER' && isAdmin(target)) {
    return res.status(403).json({ error: 'Only the administrator can remove an administrator or partner' })
  }

  await prisma.user.delete({ where: { id: target.id } })
  if (target.role === 'STUDENT') unenrollStudent(target.email)
  res.json({ ok: true })
})
