import { Router } from 'express'
import express from 'express'
import path from 'path'
import { createReadStream } from 'fs'
import { mkdir, writeFile, unlink, stat } from 'fs/promises'
import { randomBytes } from 'crypto'
import { fileURLToPath } from 'url'
import { prisma } from '../db.js'
import { requireAuth, requireRole, isAdmin } from '../auth.js'

// Textbooks: PDFs a teacher uploads once and opens on a board during lessons.
// The files are copyrighted material, so they are never served as plain
// static files — only to signed-in people of the school, streamed here.
export const textbooksRouter = Router()
textbooksRouter.use(requireAuth)

const UPLOAD_ROOT = process.env.UPLOAD_DIR ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads')
export const TEXTBOOK_DIR = path.join(UPLOAD_ROOT, 'textbooks')
const AUDIO_DIR = path.join(UPLOAD_ROOT, 'textbook-audio')
const MAX_PDF_BYTES = 80 * 1024 * 1024
const MAX_AUDIO_BYTES = 150 * 1024 * 1024
const AUDIO_EXT = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/ogg': 'ogg' }
const CONTENT_TYPE_BY_EXT = { mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg' }

const view = (t, uploader) => ({ id: t.id, title: t.title, bytes: t.bytes, pages: t.pages, createdAt: t.createdAt, uploadedById: t.uploadedById, uploadedBy: uploader?.name ?? null })
const audioView = (a) => ({ id: a.id, title: a.title, bytes: a.bytes, position: a.position, createdAt: a.createdAt })

// Each teacher keeps their own books; the administrator sees every book of
// the school with the teacher's name, and may delete any of them.
const mine = (user) => (isAdmin(user) ? { schoolId: user.schoolId } : { schoolId: user.schoolId, uploadedById: user.id })
const mayManage = (user, textbook) => isAdmin(user) || textbook.uploadedById === user.id

textbooksRouter.get('/', async (req, res) => {
  const textbooks = await prisma.textbook.findMany({ where: mine(req.user), orderBy: { title: 'asc' } })
  const ids = [...new Set(textbooks.map((t) => t.uploadedById).filter(Boolean))]
  const people = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : []
  const byId = Object.fromEntries(people.map((p) => [p.id, p]))
  res.json({ textbooks: textbooks.map((t) => view(t, byId[t.uploadedById])) })
})

// The PDF itself, as raw bytes: ?title=…&pages=… carry the name and page count.
textbooksRouter.post('/', requireRole('OWNER', 'TEACHER'), express.raw({ type: 'application/pdf', limit: MAX_PDF_BYTES }), async (req, res) => {
  const bytes = req.body
  if (!Buffer.isBuffer(bytes) || bytes.length < 100) return res.status(400).json({ error: 'Send a PDF file' })
  if (bytes.subarray(0, 5).toString() !== '%PDF-') return res.status(400).json({ error: 'This file is not a PDF' })
  const title = String(req.query.title ?? '').trim().slice(0, 200) || 'Textbook'
  const pages = Number.parseInt(req.query.pages, 10)

  await mkdir(TEXTBOOK_DIR, { recursive: true })
  const fileName = `${randomBytes(12).toString('hex')}.pdf`
  await writeFile(path.join(TEXTBOOK_DIR, fileName), bytes)
  const textbook = await prisma.textbook.create({
    data: { title, file: `textbooks/${fileName}`, bytes: bytes.length, pages: Number.isFinite(pages) ? pages : null, schoolId: req.user.schoolId, uploadedById: req.user.id }
  })
  res.status(201).json({ textbook: view(textbook) })
})

textbooksRouter.patch('/:id', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const textbook = await prisma.textbook.findFirst({ where: { id: req.params.id, schoolId: req.user.schoolId } })
  if (!textbook || !mayManage(req.user, textbook)) return res.status(404).json({ error: 'Textbook not found' })
  const title = String(req.body?.title ?? '').trim().slice(0, 200)
  if (!title) return res.status(400).json({ error: 'A title is needed' })
  const updated = await prisma.textbook.update({ where: { id: textbook.id }, data: { title } })
  res.json({ textbook: view(updated) })
})

textbooksRouter.get('/:id/file', async (req, res) => {
  const textbook = await prisma.textbook.findFirst({ where: { id: req.params.id, schoolId: req.user.schoolId } })
  if (!textbook || (req.user.role === 'STUDENT') || !mayManage(req.user, textbook)) return res.status(404).json({ error: 'Textbook not found' })
  const file = path.join(UPLOAD_ROOT, textbook.file)
  let info
  try { info = await stat(file) } catch { return res.status(404).json({ error: 'The file is missing on the server' }) }
  res.set('Content-Type', 'application/pdf')
  res.set('Content-Length', String(info.size))
  res.set('Cache-Control', 'private, max-age=86400')
  res.set('Content-Disposition', `inline; filename="${encodeURIComponent(textbook.title)}.pdf"`)
  createReadStream(file).pipe(res)
})

textbooksRouter.delete('/:id', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const textbook = await prisma.textbook.findFirst({ where: { id: req.params.id, schoolId: req.user.schoolId } })
  if (!textbook || !mayManage(req.user, textbook)) return res.status(404).json({ error: 'Textbook not found' })
  await prisma.textbook.delete({ where: { id: textbook.id } })
  unlink(path.join(UPLOAD_ROOT, textbook.file)).catch(() => {})
  res.json({ ok: true })
})

// --- Audio tracks attached to a textbook (e.g. listening-test recordings) ---

textbooksRouter.get('/:id/audio', async (req, res) => {
  const textbook = await prisma.textbook.findFirst({ where: { id: req.params.id, schoolId: req.user.schoolId } })
  if (!textbook) return res.status(404).json({ error: 'Textbook not found' })
  const tracks = await prisma.textbookAudio.findMany({ where: { textbookId: textbook.id }, orderBy: { position: 'asc' } })
  res.json({ audio: tracks.map(audioView) })
})

textbooksRouter.post('/:id/audio', requireRole('OWNER', 'TEACHER'), express.raw({ type: Object.keys(AUDIO_EXT), limit: MAX_AUDIO_BYTES }), async (req, res) => {
  const textbook = await prisma.textbook.findFirst({ where: { id: req.params.id, schoolId: req.user.schoolId } })
  if (!textbook || !mayManage(req.user, textbook)) return res.status(404).json({ error: 'Textbook not found' })

  const bytes = req.body
  if (!Buffer.isBuffer(bytes) || bytes.length < 100) return res.status(400).json({ error: 'Send an audio file' })
  const ext = AUDIO_EXT[req.get('content-type')]
  if (!ext) return res.status(400).json({ error: 'Unsupported audio type' })
  const title = String(req.query.title ?? '').trim().slice(0, 200) || 'Track'

  await mkdir(AUDIO_DIR, { recursive: true })
  const fileName = `${randomBytes(12).toString('hex')}.${ext}`
  await writeFile(path.join(AUDIO_DIR, fileName), bytes)
  const count = await prisma.textbookAudio.count({ where: { textbookId: textbook.id } })
  const track = await prisma.textbookAudio.create({
    data: { title, file: `textbook-audio/${fileName}`, bytes: bytes.length, position: count, textbookId: textbook.id }
  })
  res.status(201).json({ audio: audioView(track) })
})

textbooksRouter.get('/:id/audio/:audioId/file', async (req, res) => {
  const textbook = await prisma.textbook.findFirst({ where: { id: req.params.id, schoolId: req.user.schoolId } })
  if (!textbook) return res.status(404).json({ error: 'Textbook not found' })
  const track = await prisma.textbookAudio.findFirst({ where: { id: req.params.audioId, textbookId: textbook.id } })
  if (!track) return res.status(404).json({ error: 'Track not found' })

  const file = path.join(UPLOAD_ROOT, track.file)
  let info
  try { info = await stat(file) } catch { return res.status(404).json({ error: 'The file is missing on the server' }) }
  const ext = path.extname(track.file).slice(1)
  res.set('Content-Type', CONTENT_TYPE_BY_EXT[ext] ?? 'application/octet-stream')
  res.set('Content-Length', String(info.size))
  res.set('Accept-Ranges', 'bytes')
  res.set('Cache-Control', 'private, max-age=86400')
  createReadStream(file).pipe(res)
})

textbooksRouter.delete('/:id/audio/:audioId', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const textbook = await prisma.textbook.findFirst({ where: { id: req.params.id, schoolId: req.user.schoolId } })
  if (!textbook || !mayManage(req.user, textbook)) return res.status(404).json({ error: 'Textbook not found' })
  const track = await prisma.textbookAudio.findFirst({ where: { id: req.params.audioId, textbookId: textbook.id } })
  if (!track) return res.status(404).json({ error: 'Track not found' })
  await prisma.textbookAudio.delete({ where: { id: track.id } })
  unlink(path.join(UPLOAD_ROOT, track.file)).catch(() => {})
  res.json({ ok: true })
})
