import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db.js'
import { requireAuth, requireRole, isAdmin } from '../auth.js'

export const billingRouter = Router()

billingRouter.use(requireAuth)

// Only https links are accepted: a javascript: or data: URL here would be shown
// to every student of the school and could run in their browser.
const httpsUrl = z
  .string()
  .url()
  .refine((value) => value.startsWith('https://'), { message: 'Link must start with https://' })

// Payment is per lesson: a price, and a package of paid lessons that every
// call with the student uses up. Nothing is tied to the calendar.
const billingSchema = z.object({
  priceAmount: z.number().int().min(0).max(100_000_000).nullable(),
  priceCurrency: z.enum(['RUB', 'USD', 'EUR']),
  paymentLink: httpsUrl.nullable(),
  lessonsPaid: z.number().int().min(0).max(500).nullable(),
  // Count lessons from now on (a new package), instead of continuing the old count.
  resetCounter: z.boolean()
})

const detailsSchema = z.object({
  paymentDetails: z.string().max(2000).nullable()
})

const STUDENT_SELECT = {
  id: true, name: true, email: true,
  priceAmount: true, priceCurrency: true, paymentLink: true,
  lessonsPaid: true, packageStartedAt: true
}

// Lessons held since the package started, across every classroom of the
// student (a call that reaches the student counts, wherever it was started).
async function withPackage(student) {
  const held = await prisma.session.count({
    where: {
      classroom: { studentId: student.id },
      counted: true,
      ...(student.packageStartedAt ? { startedAt: { gte: student.packageStartedAt } } : {})
    }
  })
  const { packageStartedAt, ...rest } = student
  return {
    ...rest,
    package: {
      lessonsPaid: student.lessonsPaid,
      held,
      remaining: student.lessonsPaid == null ? null : student.lessonsPaid - held,
      startedAt: packageStartedAt
    }
  }
}

// A teacher deals with their own students; the owner and partner with everyone.
async function reachableStudent(user, id) {
  return prisma.user.findFirst({
    where: {
      id,
      schoolId: user.schoolId,
      role: 'STUDENT',
      ...(isAdmin(user) ? {} : { studentLinks: { some: { teacherId: user.id } } })
    },
    select: STUDENT_SELECT
  })
}

// What the signed-in student needs in order to pay.
billingRouter.get('/me', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { ...STUDENT_SELECT, school: { select: { paymentDetails: true, name: true } } }
  })
  if (!user) return res.status(401).json({ error: 'Not authenticated' })

  const { school, ...student } = user
  const view = await withPackage(student)
  res.json({
    billing: {
      priceAmount: view.priceAmount,
      priceCurrency: view.priceCurrency,
      paymentLink: view.paymentLink,
      package: view.package,
      paymentDetails: school.paymentDetails,
      schoolName: school.name
    }
  })
})

billingRouter.get('/students', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const students = await prisma.user.findMany({
    where: {
      schoolId: req.user.schoolId,
      role: 'STUDENT',
      ...(isAdmin(req.user) ? {} : { studentLinks: { some: { teacherId: req.user.id } } })
    },
    select: STUDENT_SELECT,
    orderBy: { name: 'asc' }
  })
  res.json({ students: await Promise.all(students.map(withPackage)) })
})

billingRouter.patch('/students/:id', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const parsed = billingSchema.partial().safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid data', details: parsed.error.flatten().fieldErrors })
  }

  const student = await reachableStudent(req.user, req.params.id)
  if (!student) return res.status(404).json({ error: 'Student not found' })

  const { resetCounter, ...data } = parsed.data
  if (resetCounter) data.packageStartedAt = new Date()

  const updated = await prisma.user.update({ where: { id: student.id }, data, select: STUDENT_SELECT })
  res.json({ student: await withPackage(updated) })
})

billingRouter.patch('/school', requireRole('OWNER'), async (req, res) => {
  const parsed = detailsSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid data' })

  await prisma.school.update({
    where: { id: req.user.schoolId },
    data: { paymentDetails: parsed.data.paymentDetails }
  })

  res.json({ ok: true })
})

billingRouter.get('/school', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const school = await prisma.school.findUnique({
    where: { id: req.user.schoolId },
    select: { paymentDetails: true }
  })
  res.json({ paymentDetails: school?.paymentDetails ?? null })
})
