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
    { sub: user.id, role: user.role, schoolId: user.schoolId },
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
async function userFromCookie(req) {
  const token = req.cookies[TOKEN_COOKIE]
  if (!token) return null
  let payload
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET)
  } catch {
    return null
  }
  return prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, role: true, schoolId: true }
  })
}

export async function requireAuth(req, res, next) {
  const user = await userFromCookie(req)
  if (!user) return res.status(401).json({ error: 'Not authenticated' })
  req.user = user
  next()
}

// --- Personal API tokens (content API only) -----------------------------------

const TOKEN_PREFIX = 'lms_'
export const hashApiToken = (token) => createHash('sha256').update(token).digest('hex')

export function generateApiToken() {
  const token = TOKEN_PREFIX + randomBytes(24).toString('base64url')
  return { token, hash: hashApiToken(token), prefix: token.slice(0, 10) }
}

async function userFromBearer(req) {
  const header = req.get('authorization') ?? ''
  if (!header.startsWith('Bearer ' + TOKEN_PREFIX)) return null
  const token = header.slice('Bearer '.length).trim()
  const row = await prisma.apiToken.findUnique({
    where: { tokenHash: hashApiToken(token) },
    include: { user: { select: { id: true, role: true, schoolId: true } } }
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

// A partner has the owner's access everywhere except role management.
export const isAdmin = (user) => user.role === 'OWNER' || user.role === 'PARTNER'

export function requireRole(...roles) {
  return (req, res, next) => {
    const allowed = roles.includes(req.user.role) || (roles.includes('OWNER') && req.user.role === 'PARTNER')
    if (!allowed) {
      return res.status(403).json({ error: 'Not allowed' })
    }
    next()
  }
}
