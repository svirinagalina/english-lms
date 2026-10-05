import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db.js'
import { planView } from '../plans.js'
import { logSignup } from './diag.js'
import { createHash, randomBytes } from 'crypto'
import { hashPassword, verifyPassword, issueToken, clearToken, requireAuth } from '../auth.js'
import { mailEnabled, sendPasswordResetEmail, sendVerifyEmail } from '../mailer.js'

export const authRouter = Router()

const registerSchema = z.object({
  schoolName: z.string().min(2).max(100),
  name: z.string().min(2).max(100),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200)
})

const signupSchema = z.object({
  name: z.string().trim().min(2).max(100),
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
  avatar: user.avatar ?? null,
  // The free tier (see freeTier.js); the page shows what is locked.
  free: user.free,
  trialRequestedAt: user.trialRequestedAt ?? null,
  // The self-service plan and what it opens (plans.js).
  access: planView(user)
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

// --- Free accounts -------------------------------------------------------------
// Anyone who downloads the app (or opens /signup) can make an account: a
// student with no teacher, on the free tier, in the school the app belongs to
// (PUBLIC_SCHOOL_ID, else the oldest school). FREE_SIGNUP=false turns it off.
const SIGNUPS_PER_HOUR = 5
const signupsByIp = new Map()

async function publicSchool() {
  if (process.env.FREE_SIGNUP === 'false') return null
  if (process.env.PUBLIC_SCHOOL_ID) return prisma.school.findUnique({ where: { id: process.env.PUBLIC_SCHOOL_ID } })
  return prisma.school.findFirst({ orderBy: { createdAt: 'asc' } })
}

authRouter.get('/signup-status', async (req, res) => {
  if (req.query.from === 'signup') logSignup(req, 'page-opened')
  res.json({ open: Boolean(await publicSchool()) })
})

authRouter.post('/signup', async (req, res) => {
  const school = await publicSchool()
  if (!school) { logSignup(req, 'closed'); return res.status(403).json({ error: 'Sign-up is closed. Ask your teacher for an invitation.' }) }

  const parsed = signupSchema.safeParse(req.body)
  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors
    logSignup(req, `invalid:${Object.keys(fields).join('+')}`, req.body?.email)
    const error = fields.password ? 'Пароль — не меньше 8 символов' : fields.email ? 'Проверьте адрес почты' : 'Введите имя'
    return res.status(400).json({ error })
  }

  const now = Date.now()
  const recent = (signupsByIp.get(req.ip) ?? []).filter((at) => now - at < 60 * 60 * 1000)
  if (recent.length >= SIGNUPS_PER_HOUR) { logSignup(req, 'rate-limited', req.body?.email); return res.status(429).json({ error: 'Too many new accounts from here. Please try again later.' }) }

  const { name, email, password } = parsed.data
  if (await prisma.user.findUnique({ where: { email } })) {
    logSignup(req, 'email-taken', email)
    return res.status(409).json({ error: 'С этой почтой уже есть аккаунт — войдите.' })
  }

  // With mail set up, the address is confirmed by a link before the first
  // sign-in (no made-up addresses, and "Forgot password" always reaches them).
  const verify = mailEnabled()
  const user = await prisma.user.create({
    data: { email, name, passwordHash: await hashPassword(password), role: 'STUDENT', free: true, schoolId: school.id, emailVerified: !verify }
  })
  signupsByIp.set(req.ip, [...recent, now])
  logSignup(req, verify ? 'created-awaiting-email' : 'created', email)

  if (verify) {
    try {
      await sendVerification(req, user)
    } catch (error) {
      console.error('Verification email failed:', error.message)
    }
    return res.status(201).json({ verify: true, email: user.email })
  }
  issueToken(res, user)
  res.status(201).json({ user: publicUser(user) })
})

const VERIFY_WINDOW_MS = 3 * 24 * 60 * 60 * 1000
async function sendVerification(req, user) {
  const token = randomBytes(32).toString('base64url')
  await prisma.emailVerification.create({ data: { tokenHash: hashToken(token), userId: user.id, expiresAt: new Date(Date.now() + VERIFY_WINDOW_MS) } })
  const origin = process.env.CLIENT_ORIGIN ?? `${req.protocol}://${req.get('host')}`
  await sendVerifyEmail({ to: user.email, name: user.name, link: `${origin}/verify/${token}` })
}

// The link from the letter: the account is confirmed and signed in.
authRouter.post('/verify/:token', async (req, res) => {
  const record = await prisma.emailVerification.findUnique({ where: { tokenHash: hashToken(req.params.token) } })
  if (!record || record.expiresAt < new Date()) return res.status(410).json({ error: 'Срок ссылки истёк. Войдите, чтобы получить новое письмо.' })
  const user = await prisma.user.update({ where: { id: record.userId }, data: { emailVerified: true } })
  logSignup(req, 'email-confirmed', user.email)
  await prisma.emailVerification.deleteMany({ where: { userId: user.id } })
  issueToken(res, user)
  res.json({ user: publicUser(user) })
})

// Another letter, at most one a minute per address.
const resentAt = new Map()
authRouter.post('/verify-resend', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  const last = resentAt.get(email) ?? 0
  if (Date.now() - last < 60 * 1000) return res.status(429).json({ error: 'Письмо только что отправлено — проверьте почту и «Спам» или попробуйте через минуту.' })
  resentAt.set(email, Date.now())
  const user = email && await prisma.user.findUnique({ where: { email } })
  if (user && !user.emailVerified && mailEnabled()) {
    try { await sendVerification(req, user) } catch (error) { console.error('Verification email failed:', error.message) }
  }
  // The same answer either way: this must not tell who has an account.
  res.json({ ok: true })
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
    return res.status(401).json({ error: 'Неверная почта или пароль' })
  }
  for (const key of keys) loginFailures.delete(key)

  if (!user.emailVerified) return res.status(403).json({ error: 'Сначала подтвердите почту — мы отправили вам письмо со ссылкой.', unverified: true, email: user.email })

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
    // The reset link came by email, so the address is confirmed too.
    const updated = await tx.user.update({ where: { id: reset.userId }, data: { passwordHash, emailVerified: true } })
    await tx.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } })
    // Any other outstanding links for this account die with this one.
    await tx.passwordReset.updateMany({ where: { userId: reset.userId, usedAt: null }, data: { usedAt: new Date() } })
    return updated
  })
  issueToken(res, user)
  res.json({ user: publicUser(user) })
})
