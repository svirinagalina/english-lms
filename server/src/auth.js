import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { createHash, randomBytes } from 'crypto'
import { prisma } from './db.js'

const TOKEN_COOKIE = 'lms_token'
const TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000

export const hashPassword = (password) => bcrypt.hash(password, 12)
export const verifyPassword = (password, hash) => bcrypt.compare(password, hash)

export function issueToken(res, user) {
  const token = jwt.sign(
    // sv: the password generation it was made in (sessionVersion).
    { sub: user.id, role: user.role, schoolId: user.schoolId, sv: user.sessionVersion ?? 0 },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  )

  res.cookie(TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: TOKEN_MAX_AGE
  })
}

export function clearToken(res) {
  res.clearCookie(TOKEN_COOKIE)
}

// The role comes from the database, not the cookie, so changing someone's
// role or removing them takes effect on their next request.
export async function userFromCookie(req) {
  const token = req.cookies[TOKEN_COOKIE]
  if (!token) return null
  let payload
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET)
  } catch {
    return null
  }
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, role: true, schoolId: true, free: true, plan: true, planUntil: true, viaLink: true, trialAccessUntil: true, lessonsPaid: true, sessionVersion: true }
  })
  return user && sameSession(payload, user) ? user : null
}

// A cookie made before the last password change no longer signs anyone in
// (cookies from before sessionVersion existed carry none and count as 0).
export const sameSession = (payload, user) => (payload.sv ?? 0) === user.sessionVersion

// A trial-link account (no email/password of its own) that now has paid
// lessons: it becomes a real student — everything waits for the email and the
// password, except finding out who one is (Galina, 2026-10-13: sign-up only
// for those who pay).
export const mustSignUp = (user) => Boolean(user?.viaLink && (user.lessonsPaid > 0 || (user.plan && user.planUntil && user.planUntil > new Date())))
export const SIGN_UP_NEEDED = { error: 'Чтобы продолжить заниматься, придумайте почту и пароль', needsSignup: true }

// Everyone who came through a trial lesson has the platform for three days
// (Galina, 2026-10-13); after that, without paid lessons, only the trial
// report and the Payment page stay open, so they can still pay.
export const trialOver = (user) => Boolean(user?.role === 'STUDENT' && user.trialAccessUntil && user.trialAccessUntil < new Date() && !(user.lessonsPaid > 0))
export const TRIAL_OVER = { error: 'Пробный доступ закончился. Чтобы продолжить, оплатите занятия.', trialOver: true }
const OPEN_AFTER_TRIAL = (req) => req.baseUrl === '/api/auth' || req.baseUrl === '/api/billing' || (req.baseUrl === '/api/trials' && req.method === 'GET') || req.baseUrl === '/api/plans'

export async function requireAuth(req, res, next) {
  const user = await userFromCookie(req)
  if (!user) return res.status(401).json({ error: 'Not authenticated' })
  if (mustSignUp(user) && !(req.baseUrl === '/api/auth')) return res.status(403).json(SIGN_UP_NEEDED)
  if (trialOver(user) && !OPEN_AFTER_TRIAL(req)) return res.status(403).json(TRIAL_OVER)
  req.user = user
  next()
}

// Gives a trial-link account its own email and password: it becomes an
// ordinary account (the board, words and mistakes are the same).
export async function completeSignup(userId, { email, password, name }) {
  email = String(email ?? '').trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.endsWith('.invalid')) throw Object.assign(new Error('Проверьте почту'), { status: 400 })
  if (String(password ?? '').length < 8) throw Object.assign(new Error('Пароль — не короче 8 символов'), { status: 400 })
  const taken = await prisma.user.findUnique({ where: { email } })
  if (taken && taken.id !== userId) throw Object.assign(new Error('С этой почтой уже есть аккаунт — войдите в него'), { status: 409 })
  return prisma.user.update({
    where: { id: userId },
    data: { email, passwordHash: await hashPassword(password), viaLink: false, ...(name ? { name: String(name).trim().slice(0, 80) } : {}) }
  })
}

// --- Personal API tokens (content API only) -----------------------------------

const TOKEN_PREFIX = 'lms_'
export const hashApiToken = (token) => createHash('sha256').update(token).digest('hex')

export function generateApiToken() {
  const token = TOKEN_PREFIX + randomBytes(24).toString('base64url')
  return { token, hash: hashApiToken(token), prefix: token.slice(0, 10) }
}

export async function userFromBearer(req) {
  const header = req.get('authorization') ?? ''
  if (!header.startsWith('Bearer ' + TOKEN_PREFIX)) return null
  const token = header.slice('Bearer '.length).trim()
  const row = await prisma.apiToken.findUnique({
    where: { tokenHash: hashApiToken(token) },
    include: { user: { select: { id: true, role: true, schoolId: true, free: true } } }
  })
  if (!row) return null
  prisma.apiToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {})
  return { ...row.user, viaToken: true }
}

// Cookie session or a personal token, whichever is present.
export async function requireAuthOrToken(req, res, next) {
  const user = (await userFromCookie(req)) ?? (await userFromBearer(req))
  if (!user) return res.status(401).json({ error: 'Not authenticated' })
  req.user = user
  next()
}

// The free tier (self-signed-up, no teacher yet) stops here: lessons, calls,
// courses and textbooks are for students with a teacher. `locked` tells the
// page to show the "request a trial lesson" offer instead of an error.
export const LOCKED = { error: 'This is for students with a teacher. Request a trial lesson to unlock it.', locked: true }
// Open with a plan: the page offers the plans (and a trial lesson).
export const lockedFor = (feature) => ({ error: feature === 'calls' ? 'Hosting calls is in the Calls plan.' : 'This is in the Practice plan.', locked: true, feature })
export function requirePaid(req, res, next) {
  if (req.user.free) return res.status(403).json(LOCKED)
  next()
}

// A partner sees what the owner sees.
export const isAdmin = (user) => user.role === 'OWNER' || user.role === 'PARTNER'

// …but changes nothing (Galina, 2026-10-16: «Максиму на платформе только
// просмотр»). Every API write from a partner is refused here, before any
// router, whatever the route says; the sockets refuse board/Writing edits the
// same way (signaling.js). Only his own account stays his: sign-in/out, his
// profile, his phone's push and Telegram link, and the page-visit/diagnostic
// reports the client sends on its own.
const PARTNER_MAY_WRITE = ['/api/auth/', '/api/profile', '/api/push/', '/api/telegram/me', '/api/activity', '/api/diag']
export const PARTNER_READ_ONLY = { error: 'Partner access is view-only — ask the administrator to make this change', readOnly: true }

export async function partnerReadOnly(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next()
  if (PARTNER_MAY_WRITE.some((prefix) => req.originalUrl.startsWith(prefix))) return next()
  const user = (await userFromCookie(req)) ?? (await userFromBearer(req))
  if (user?.role === 'PARTNER') return res.status(403).json(PARTNER_READ_ONLY)
  next()
}

export function requireRole(...roles) {
  return (req, res, next) => {
    const allowed = roles.includes(req.user.role) || (roles.includes('OWNER') && req.user.role === 'PARTNER')
    if (!allowed) {
      return res.status(403).json({ error: 'Not allowed' })
    }
    next()
  }
}
