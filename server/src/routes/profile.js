import { Router } from 'express'
import { z } from 'zod'
import path from 'path'
import { mkdir, writeFile, unlink } from 'fs/promises'
import { randomBytes } from 'crypto'
import { fileURLToPath } from 'url'
import { prisma } from '../db.js'
import { requireAuth, hashPassword, verifyPassword, clearToken } from '../auth.js'
import { moveStudent, unenrollStudent } from '../advent.js'
import { sendTrialRequestEmail } from '../mailer.js'
import { notifyTrialRequest } from '../push.js'

// A person's own profile: name, email, password and a small picture.
export const profileRouter = Router()
profileRouter.use(requireAuth)

const UPLOAD_ROOT = process.env.UPLOAD_DIR ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads')
const MAX_AVATAR_BYTES = 2 * 1024 * 1024
const IMAGE_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().toLowerCase().email().max(200).optional(),
  currentPassword: z.string().max(200).optional(),
  newPassword: z.string().min(8).max(200).optional(),
  // Personal details, all optional; an empty string clears one.
  phone: z.string().trim().max(40).optional(),
  messenger: z.string().trim().max(80).optional(),
  birthday: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
  city: z.string().trim().max(80).optional(),
  timezone: z.string().trim().max(60).optional(),
  about: z.string().trim().max(1000).optional()
})

export const DETAIL_FIELDS = ['phone', 'messenger', 'birthday', 'city', 'timezone', 'about']

const view = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, schoolId: u.schoolId, avatar: u.avatar ?? null })
const details = (u) => Object.fromEntries(DETAIL_FIELDS.map((f) => [f, u[f] ?? '']))

profileRouter.get('/', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } })
  if (!user) return res.status(401).json({ error: 'Not authenticated' })
  res.json({ user: view(user), details: details(user) })
})

profileRouter.patch('/', async (req, res) => {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Check the fields: a valid email, a password of at least 8 characters' })
  const { name, email, currentPassword, newPassword } = parsed.data
  const user = await prisma.user.findUnique({ where: { id: req.user.id } })
  if (!user) return res.status(401).json({ error: 'Not authenticated' })

  // Changing the email or the password needs the current password: a tab
  // left open must not be enough to take an account over.
  const sensitive = (email && email !== user.email) || newPassword
  if (sensitive) {
    if (!currentPassword || !(await verifyPassword(currentPassword, user.passwordHash))) {
      return res.status(403).json({ error: 'The current password is wrong' })
    }
  }
  if (email && email !== user.email) {
    const taken = await prisma.user.findUnique({ where: { email } })
    if (taken) return res.status(409).json({ error: 'This email is already used by another account' })
  }
  const data = {}
  if (name) data.name = name
  if (email) data.email = email
  if (newPassword) data.passwordHash = await hashPassword(newPassword)
  for (const field of DETAIL_FIELDS) {
    if (parsed.data[field] !== undefined) data[field] = parsed.data[field] || null
  }
  const updated = await prisma.user.update({ where: { id: user.id }, data })
  if (user.role === 'STUDENT' && updated.email !== user.email) moveStudent(user.email, updated.email, updated.name)
  res.json({ user: view(updated), details: details(updated) })
})

profileRouter.post('/avatar', async (req, res) => {
  const dataUrl = typeof req.body?.data === 'string' ? req.body.data : ''
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/)
  if (!match) return res.status(400).json({ error: 'Only PNG, JPEG or WebP images are accepted' })
  const bytes = Buffer.from(match[2], 'base64')
  if (bytes.length > MAX_AVATAR_BYTES) return res.status(413).json({ error: 'The picture is larger than 2 MB' })

  const fileName = `${req.user.id}-${randomBytes(6).toString('hex')}.${IMAGE_TYPES[match[1]]}`
  const directory = path.join(UPLOAD_ROOT, 'avatars')
  await mkdir(directory, { recursive: true })
  await writeFile(path.join(directory, fileName), bytes)
  const src = `/uploads/avatars/${fileName}`

  const before = await prisma.user.findUnique({ where: { id: req.user.id }, select: { avatar: true } })
  const updated = await prisma.user.update({ where: { id: req.user.id }, data: { avatar: src } })
  // The old picture is not needed any more.
  if (before?.avatar?.startsWith('/uploads/avatars/')) unlink(path.join(UPLOAD_ROOT, before.avatar.replace('/uploads/', ''))).catch(() => {})
  res.status(201).json({ user: view(updated) })
})

profileRouter.delete('/avatar', async (req, res) => {
  const before = await prisma.user.findUnique({ where: { id: req.user.id }, select: { avatar: true } })
  const updated = await prisma.user.update({ where: { id: req.user.id }, data: { avatar: null } })
  if (before?.avatar?.startsWith('/uploads/avatars/')) unlink(path.join(UPLOAD_ROOT, before.avatar.replace('/uploads/', ''))).catch(() => {})
  res.json({ user: view(updated) })
})

// A free user asks for a trial lesson: how to reach them and a word about
// what they want. The owner gets an email and a push; People shows it.
profileRouter.post('/trial-request', async (req, res) => {
  const contact = String(req.body?.contact ?? '').trim().slice(0, 120)
  const note = String(req.body?.note ?? '').trim().slice(0, 1000)
  const user = await prisma.user.findUnique({ where: { id: req.user.id } })
  if (!user) return res.status(401).json({ error: 'Not authenticated' })
  if (!user.free) return res.status(400).json({ error: 'You already study with a teacher' })

  // A second press within ten minutes updates the request without another letter.
  const repeated = user.trialRequestedAt && Date.now() - user.trialRequestedAt.getTime() < 10 * 60 * 1000
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      trialRequestedAt: new Date(),
      trialRequestNote: [contact, note].filter(Boolean).join(' · ') || null,
      ...(contact && !user.messenger ? { messenger: contact } : {})
    }
  })
  if (!repeated) {
    const origin = process.env.CLIENT_ORIGIN ?? `${req.protocol}://${req.get('host')}`
    const owners = await prisma.user.findMany({ where: { schoolId: user.schoolId, role: 'OWNER' }, select: { email: true } })
    for (const owner of owners) {
      sendTrialRequestEmail({ to: owner.email, name: user.name, email: user.email, contact, note, link: `${origin}/people` })
    }
    notifyTrialRequest(updated)
  }
  res.json({ trialRequestedAt: updated.trialRequestedAt })
})

// Deleting one's own account (Apple requires it in any app where an account
// can be made). Students only — a teacher's account holds their students'
// classrooms, so the administrator removes it. The password confirms it.
profileRouter.delete('/', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } })
  if (!user) return res.status(401).json({ error: 'Not authenticated' })
  if (user.role !== 'STUDENT') return res.status(403).json({ error: 'A staff account is removed by the school administrator' })
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  if (!(await verifyPassword(password, user.passwordHash))) return res.status(403).json({ error: 'The password is wrong' })

  await prisma.user.delete({ where: { id: user.id } })
  if (user.avatar?.startsWith('/uploads/avatars/')) unlink(path.join(UPLOAD_ROOT, user.avatar.replace('/uploads/', ''))).catch(() => {})
  // What the platform granted in the trainer goes too.
  if (!user.free) unenrollStudent(user.email)
  clearToken(res)
  res.json({ ok: true })
})
