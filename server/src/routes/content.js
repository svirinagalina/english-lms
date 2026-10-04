import { Router } from 'express'
import express from 'express'
import { z } from 'zod'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { randomBytes } from 'crypto'
import { prisma } from '../db.js'
import { requireAuthOrToken, requireRole, generateApiToken } from '../auth.js'

// Marketing content pipeline: sources → editing → ready. Owner and partner
// only; reachable with the session cookie or a personal API token.
export const contentRouter = Router()

contentRouter.use(requireAuthOrToken, requireRole('OWNER', 'PARTNER'))

const UPLOAD_ROOT = process.env.UPLOAD_DIR
  ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads')
// Cloudflare (in front of the site) refuses request bodies over 100 MB.
const MAX_FILE = 100 * 1024 * 1024
const ALLOWED_MIME = /^(image\/(png|jpeg|gif|webp|heic|heif)|video\/(mp4|quicktime|webm)|audio\/(mpeg|mp4|m4a|x-m4a|wav)|application\/pdf|text\/plain)$/

const STAGES = ['SOURCE', 'EDITING', 'READY']
const unique = (list) => [...new Set(list ?? [])]

const itemSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().max(20000).nullable().optional(),
  networks: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  formats: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  stage: z.enum(STAGES).optional(),
  sourceId: z.string().nullable().optional()
})

const INCLUDE = {
  author: { select: { id: true, name: true } },
  source: { select: { id: true, title: true, stage: true } },
  files: { orderBy: { createdAt: 'asc' } }
}

const fileView = (file) => ({
  id: file.id,
  name: file.name,
  url: encodeURI(file.path),
  mime: file.mime,
  size: file.size,
  createdAt: file.createdAt
})

const itemView = (item) => ({
  id: item.id,
  stage: item.stage,
  title: item.title,
  body: item.body,
  networks: item.networks,
  formats: item.formats,
  author: item.author,
  source: item.source,
  files: item.files.map(fileView),
  createdAt: item.createdAt,
  updatedAt: item.updatedAt
})

const findItem = (req, id) =>
  prisma.contentItem.findFirst({ where: { id, schoolId: req.user.schoolId }, include: INCLUDE })

contentRouter.get('/items', async (req, res) => {
  const stage = STAGES.includes(req.query.stage) ? req.query.stage : undefined
  const items = await prisma.contentItem.findMany({
    where: { schoolId: req.user.schoolId, ...(stage ? { stage } : {}) },
    include: INCLUDE,
    orderBy: { updatedAt: 'desc' }
  })
  res.json({ items: items.map(itemView) })
})

contentRouter.get('/items/:id', async (req, res) => {
  const item = await findItem(req, req.params.id)
  if (!item) return res.status(404).json({ error: 'Not found' })
  res.json({ item: itemView(item) })
})

// A source must belong to the same school; anything else is rejected.
async function resolveSource(req, sourceId) {
  if (!sourceId) return null
  const source = await prisma.contentItem.findFirst({
    where: { id: sourceId, schoolId: req.user.schoolId },
    select: { id: true }
  })
  return source?.id ?? undefined
}

contentRouter.post('/items', async (req, res) => {
  const parsed = itemSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid data' })

  const sourceId = await resolveSource(req, parsed.data.sourceId)
  if (sourceId === undefined) return res.status(404).json({ error: 'Source not found' })

  const item = await prisma.contentItem.create({
    data: {
      title: parsed.data.title,
      body: parsed.data.body ?? null,
      networks: unique(parsed.data.networks),
      formats: unique(parsed.data.formats),
      stage: parsed.data.stage ?? 'SOURCE',
      sourceId,
      schoolId: req.user.schoolId,
      authorId: req.user.id
    },
    include: INCLUDE
  })
  res.status(201).json({ item: itemView(item) })
})

contentRouter.patch('/items/:id', async (req, res) => {
  const parsed = itemSchema.partial().safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid data' })

  const existing = await findItem(req, req.params.id)
  if (!existing) return res.status(404).json({ error: 'Not found' })

  const data = { ...parsed.data }
  if ('sourceId' in data) {
    if (data.sourceId === existing.id) return res.status(400).json({ error: 'An item cannot be its own source' })
    const sourceId = await resolveSource(req, data.sourceId)
    if (sourceId === undefined) return res.status(404).json({ error: 'Source not found' })
    data.sourceId = sourceId
  }
  if ('networks' in data) data.networks = unique(data.networks)
  if ('formats' in data) data.formats = unique(data.formats)

  const item = await prisma.contentItem.update({ where: { id: existing.id }, data, include: INCLUDE })
  res.json({ item: itemView(item) })
})

contentRouter.delete('/items/:id', async (req, res) => {
  const existing = await findItem(req, req.params.id)
  if (!existing) return res.status(404).json({ error: 'Not found' })

  await prisma.contentItem.delete({ where: { id: existing.id } })
  await fs.rm(path.join(UPLOAD_ROOT, 'content', existing.id), { recursive: true, force: true })
  res.json({ ok: true })
})

// --- Files ---------------------------------------------------------------------
// The body is the file itself; the name comes in the X-File-Name header
// (URL-encoded) and the type in Content-Type.

const rawBody = express.raw({ type: () => true, limit: MAX_FILE })

contentRouter.post('/items/:id/files', rawBody, async (req, res) => {
  const existing = await findItem(req, req.params.id)
  if (!existing) return res.status(404).json({ error: 'Not found' })

  const mime = (req.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (!ALLOWED_MIME.test(mime)) return res.status(400).json({ error: 'Unsupported file type' })
  if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Empty file' })

  let name = 'file'
  try { name = decodeURIComponent(req.get('x-file-name') ?? 'file') } catch { /* keep default */ }
  name = path.basename(name).replace(/[^\p{L}\p{N}.\-() ]+/gu, '_').slice(0, 120) || 'file'

  const dir = path.join(UPLOAD_ROOT, 'content', existing.id)
  await fs.mkdir(dir, { recursive: true })
  const stored = `${randomBytes(6).toString('hex')}-${name}`
  await fs.writeFile(path.join(dir, stored), req.body)

  const file = await prisma.contentFile.create({
    data: {
      itemId: existing.id,
      name,
      path: `/uploads/content/${existing.id}/${stored}`,
      mime,
      size: req.body.length
    }
  })
  await prisma.contentItem.update({ where: { id: existing.id }, data: { updatedAt: new Date() } })
  res.status(201).json({ file: fileView(file) })
})

contentRouter.delete('/items/:id/files/:fileId', async (req, res) => {
  const file = await prisma.contentFile.findFirst({
    where: { id: req.params.fileId, item: { id: req.params.id, schoolId: req.user.schoolId } }
  })
  if (!file) return res.status(404).json({ error: 'Not found' })

  await prisma.contentFile.delete({ where: { id: file.id } })
  await fs.rm(path.join(UPLOAD_ROOT, file.path.replace(/^\/uploads\//, '')), { force: true })
  res.json({ ok: true })
})

// --- Personal API tokens ---------------------------------------------------------
// Managed from the browser only; a token cannot mint more tokens.

const tokenView = (row) => ({
  id: row.id,
  name: row.name,
  prefix: row.prefix,
  createdAt: row.createdAt,
  lastUsedAt: row.lastUsedAt
})

const sessionOnly = (req, res, next) =>
  req.user.viaToken ? res.status(403).json({ error: 'Sign in to manage tokens' }) : next()

contentRouter.get('/tokens', sessionOnly, async (req, res) => {
  const rows = await prisma.apiToken.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' }
  })
  res.json({ tokens: rows.map(tokenView) })
})

contentRouter.post('/tokens', sessionOnly, async (req, res) => {
  const name = String(req.body?.name ?? '').trim().slice(0, 60) || 'API token'
  const { token, hash, prefix } = generateApiToken()
  const row = await prisma.apiToken.create({
    data: { name, tokenHash: hash, prefix, userId: req.user.id, schoolId: req.user.schoolId }
  })
  // The only time the token itself leaves the server.
  res.status(201).json({ token, item: tokenView(row) })
})

contentRouter.delete('/tokens/:id', sessionOnly, async (req, res) => {
  const row = await prisma.apiToken.findFirst({ where: { id: req.params.id, userId: req.user.id } })
  if (!row) return res.status(404).json({ error: 'Not found' })
  await prisma.apiToken.delete({ where: { id: row.id } })
  res.json({ ok: true })
})

// Lets a script check that its token works.
contentRouter.get('/me', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { id: true, name: true, role: true }
  })
  res.json({ user, viaToken: Boolean(req.user.viaToken) })
})
