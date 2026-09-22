import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db.js'
import { createHash, randomBytes } from 'crypto'
import { hashPassword, verifyPassword, issueToken, clearToken, requireAuth } from '../auth.js'
import { mailEnabled, sendPasswordResetEmail } from '../mailer.js'

export const authRouter = Router()

const registerSchema = z.object({
  schoolName: z.string().min(2).max(100),
  name: z.string().min(2).max(100),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200)
})

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
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
  schoolId: user.schoolId,
  avatar: user.avatar ?? null
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

// --- Forgot password ------------------------------------------------------------
// The answer is the same whether or not the address exists, so the form
// cannot be used to find out who has an account.
const hashToken = (token) => createHash('sha256').update(token).digest('hex')
const RESET_WINDOW_MS = 60 * 60 * 1000

authRouter.post('/forgot', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  if (!email) return res.status(400).json({ error: 'Email is required' })
  if (!mailEnabled()) return res.status(503).json({ error: 'Password reset by email is not set up on this server — ask your teacher to set a new password for you.' })
  const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } })
  if (user) {
    // Too many requests for one account in a short time are ignored quietly.
    const recent = await prisma.passwordReset.count({ where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) } } })
    if (recent < 3) {
      const token = randomBytes(24).toString('base64url')
      await prisma.passwordReset.create({ data: { tokenHash: hashToken(token), userId: user.id, expiresAt: new Date(Date.now() + RESET_WINDOW_MS) } })
      const origin = process.env.CLIENT_ORIGIN ?? `${req.protocol}://${req.get('host')}`
      await sendPasswordResetEmail({ to: user.email, name: user.name, link: `${origin}/reset/${token}` })
    }
  }
  res.json({ ok: true })
})

authRouter.get('/reset/:token', async (req, res) => {
  const reset = await prisma.passwordReset.findUnique({ where: { tokenHash: hashToken(req.params.token) }, include: { user: { select: { email: true, name: true } } } })
  if (!reset || reset.usedAt || reset.expiresAt < new Date()) return res.status(410).json({ error: 'This link has expired or was already used. Ask for a new one.' })
  res.json({ email: reset.user.email, name: reset.user.name })
})

authRouter.post('/reset/:token', async (req, res) => {
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  if (password.length < 8 || password.length > 200) return res.status(400).json({ error: 'Password must be at least 8 characters' })
  const reset = await prisma.passwordReset.findUnique({ where: { tokenHash: hashToken(req.params.token) } })
  if (!reset || reset.usedAt || reset.expiresAt < new Date()) return res.status(410).json({ error: 'This link has expired or was already used. Ask for a new one.' })
  const passwordHash = await hashPassword(password)
  const user = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({ where: { id: reset.userId }, data: { passwordHash } })
    await tx.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } })
    // Any other outstanding links for this account die with this one.
    await tx.passwordReset.updateMany({ where: { userId: reset.userId, usedAt: null }, data: { usedAt: new Date() } })
    return updated
  })
  issueToken(res, user)
  res.json({ user: publicUser(user) })
})
