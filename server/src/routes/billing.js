import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db.js'
import { requireAuth, requireRole } from '../auth.js'

export const billingRouter = Router()

billingRouter.use(requireAuth)

// Only https links are accepted: a javascript: or data: URL here would be shown
// to every student of the school and could run in their browser.
const httpsUrl = z
  .string()
  .url()
  .refine((value) => value.startsWith('https://'), { message: 'Link must start with https://' })

const billingSchema = z.object({
  priceAmount: z.number().int().min(0).max(100_000_000).nullable(),
  priceCurrency: z.enum(['RUB', 'USD', 'EUR']),
  paymentLink: httpsUrl.nullable(),
  paidUntil: z.string().datetime().nullable()
})

const detailsSchema = z.object({
  paymentDetails: z.string().max(2000).nullable()
})

// What the signed-in student needs in order to pay.
billingRouter.get('/me', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { school: { select: { paymentDetails: true, name: true } } }
  })
  if (!user) return res.status(401).json({ error: 'Not authenticated' })

  res.json({
    billing: {
      priceAmount: user.priceAmount,
      priceCurrency: user.priceCurrency,
      paymentLink: user.paymentLink,
      paidUntil: user.paidUntil,
      paymentDetails: user.school.paymentDetails,
      schoolName: user.school.name
    }
  })
})

billingRouter.patch('/students/:id', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const parsed = billingSchema.partial().safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid data', details: parsed.error.flatten().fieldErrors })
  }

  const student = await prisma.user.findFirst({
    where: { id: req.params.id, schoolId: req.user.schoolId, role: 'STUDENT' }
  })
  if (!student) return res.status(404).json({ error: 'Student not found' })

  const data = { ...parsed.data }
  if (data.paidUntil !== undefined) {
    data.paidUntil = data.paidUntil ? new Date(data.paidUntil) : null
  }

  const updated = await prisma.user.update({
    where: { id: student.id },
    data,
    select: {
      id: true,
      priceAmount: true,
      priceCurrency: true,
      paymentLink: true,
      paidUntil: true
    }
  })

  res.json({ student: updated })
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
