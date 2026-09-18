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

// Failed sign-ins are counted per address and per account; too many in a
// row and the next attempts wait, so a password cannot be guessed by force.
const LOGIN_WINDOW_MS = 15 * 60 * 1000
// One account: 10 tries. One address: 40, since a whole school may share it.
const LOGIN_MAX_FAILURES = { email: 10, ip: 40 }
const loginFailures = new Map()
const failuresFor = (key) => {
  const now = Date.now()
  const recent = (loginFailures.get(key) ?? []).filter((at) => now - at < LOGIN_WINDOW_MS)
  if (recent.length) loginFailures.set(key, recent)
  else loginFailures.delete(key)
  return recent
}

authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid data' })

  const { email, password } = parsed.data
  const keys = [`ip:${req.ip}`, `email:${email.toLowerCase()}`]
  if (keys.some((key) => failuresFor(key).length >= LOGIN_MAX_FAILURES[key.split(':')[0]])) {
    return res.status(429).json({ error: 'Too many attempts. Please wait 15 minutes and try again.' })
  }

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    for (const key of keys) loginFailures.set(key, [...failuresFor(key), Date.now()])
    return res.status(401).json({ error: 'Invalid email or password' })
  }
  for (const key of keys) loginFailures.delete(key)

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

  // Every visit extends the sign-in by a week, so people who use the
  // platform regularly are never logged out in the middle of a lesson.
  issueToken(res, user)
  res.json({ user: { ...publicUser(user), schoolName: user.school.name } })
})
