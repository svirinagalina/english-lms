import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db.js'
import { hashPassword, verifyPassword, issueToken, clearToken, requireAuth } from '../auth.js'

export const authRouter = Router()

const registerSchema = z.object({
  schoolName: z.string().min(2).max(100),
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(200)
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
})

// Registration is open only while the instance has no users at all, so the very
// first visitor can create the school. ALLOW_REGISTRATION overrides this either way.
async function isRegistrationOpen() {
  if (process.env.ALLOW_REGISTRATION === 'true') return true
  if (process.env.ALLOW_REGISTRATION === 'false') return false
  return (await prisma.user.count()) === 0
}

const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  schoolId: user.schoolId
})

authRouter.get('/registration-status', async (req, res) => {
  res.json({ open: await isRegistrationOpen() })
})

authRouter.post('/register', async (req, res) => {
  if (!(await isRegistrationOpen())) {
    return res.status(403).json({ error: 'Registration is closed. Ask your school administrator for an account.' })
  }

  const parsed = registerSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid data', details: parsed.error.flatten().fieldErrors })
  }

  const { schoolName, name, email, password } = parsed.data
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return res.status(409).json({ error: 'Email already registered' })

  const passwordHash = await hashPassword(password)
  const user = await prisma.$transaction(async (tx) => {
    const school = await tx.school.create({ data: { name: schoolName } })
    return tx.user.create({
      data: { email, name, passwordHash, role: 'OWNER', schoolId: school.id }
    })
  })

  issueToken(res, user)
  res.status(201).json({ user: publicUser(user) })
})

authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid data' })

  const { email, password } = parsed.data
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return res.status(401).json({ error: 'Invalid email or password' })
  }

  issueToken(res, user)
  res.json({ user: publicUser(user) })
})

authRouter.post('/logout', (req, res) => {
  clearToken(res)
  res.json({ ok: true })
})

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { school: { select: { name: true } } }
  })
  if (!user) return res.status(401).json({ error: 'Not authenticated' })

  res.json({ user: { ...publicUser(user), schoolName: user.school.name } })
})
