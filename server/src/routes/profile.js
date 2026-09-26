import { Router } from 'express'
import { z } from 'zod'
import path from 'path'
import { mkdir, writeFile, unlink } from 'fs/promises'
import { randomBytes } from 'crypto'
import { fileURLToPath } from 'url'
import { prisma } from '../db.js'
import { requireAuth, hashPassword, verifyPassword } from '../auth.js'
import { moveStudent } from '../advent.js'

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
