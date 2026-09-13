import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

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

export function requireAuth(req, res, next) {
  const token = req.cookies[TOKEN_COOKIE]
  if (!token) return res.status(401).json({ error: 'Not authenticated' })

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    req.user = { id: payload.sub, role: payload.role, schoolId: payload.schoolId }
    next()
  } catch {
    res.status(401).json({ error: 'Invalid session' })
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Not allowed' })
    }
    next()
  }
}
