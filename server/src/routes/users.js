import { Router } from 'express'
import { randomBytes } from 'crypto'
import { z } from 'zod'
import { prisma } from '../db.js'
import { hashPassword, requireAuth, requireRole } from '../auth.js'

export const usersRouter = Router()

usersRouter.use(requireAuth)

const createUserSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  role: z.enum(['TEACHER', 'STUDENT'])
})

const generateTempPassword = () => randomBytes(9).toString('base64url')

usersRouter.get('/', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const users = await prisma.user.findMany({
    where: { schoolId: req.user.schoolId },
    select: {
      id: true, name: true, email: true, role: true, createdAt: true,
      priceAmount: true, priceCurrency: true, paymentLink: true, paidUntil: true
    },
    orderBy: { createdAt: 'asc' }
  })
  res.json({ users })
})

usersRouter.post('/', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid data', details: parsed.error.flatten().fieldErrors })
  }

  const { name, email, role } = parsed.data

  if (role === 'TEACHER' && req.user.role !== 'OWNER') {
    return res.status(403).json({ error: 'Only the school owner can add teachers' })
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return res.status(409).json({ error: 'Email already registered' })

  const tempPassword = generateTempPassword()
  const user = await prisma.user.create({
    data: {
      name,
      email,
      role,
      passwordHash: await hashPassword(tempPassword),
      schoolId: req.user.schoolId
    },
    select: { id: true, name: true, email: true, role: true }
  })

  res.status(201).json({ user, tempPassword })
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
