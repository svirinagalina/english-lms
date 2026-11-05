import { Router } from 'express'
import express from 'express'
import path from 'path'
import { mkdir, open, readFile, readdir, rename, rm, stat, statfs, unlink, writeFile } from 'fs/promises'
import { randomBytes } from 'crypto'
import { fileURLToPath } from 'url'
import { prisma } from '../db.js'
import { requireAuth, requireRole, isAdmin, requirePaid } from '../auth.js'

// Textbooks: PDFs and their audio that a teacher uploads once and opens during
// lessons. The files are copyrighted material, so they are never served as
// plain static files — only to the teacher who owns them and the school's
// administrators, streamed here.
export const textbooksRouter = Router()
textbooksRouter.use(requireAuth)
// Not part of the free tier.
textbooksRouter.use(requirePaid)

const UPLOAD_ROOT = process.env.UPLOAD_DIR ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads')
const INCOMING_DIR = path.join(UPLOAD_ROOT, 'textbook-incoming')
const MAX_FILE_BYTES = 500 * 1024 * 1024
// A file goes up in pieces: Caddy refuses a request over 105 MB, a slow line
// would hit the 5-minute request limit, and a dropped connection costs one
// piece instead of the whole book. 8 MB is what was measured through Maxim's
// relay on 2026-11-05; this stays well under it.
const CHUNK_BYTES = 4 * 1024 * 1024
const ABANDONED_AFTER_MS = 24 * 60 * 60_000
// The disk is shared with Postgres and every other service on srv3, so one
// school cannot fill it, and uploads stop while there is still room to run.
const SCHOOL_QUOTA_BYTES = Number(process.env.TEXTBOOK_QUOTA_BYTES ?? 10 * 1024 ** 3)
const DISK_RESERVE_BYTES = Number(process.env.TEXTBOOK_DISK_RESERVE_BYTES ?? 5 * 1024 ** 3)
const CONTENT_TYPE_BY_EXT = { mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', flac: 'audio/flac' }

const view = (t, uploader) => ({ id: t.id, title: t.title, bytes: t.bytes, pages: t.pages, createdAt: t.createdAt, uploadedById: t.uploadedById, uploadedBy: uploader?.name ?? null, audioCount: t._count?.audio ?? 0 })
const audioView = (a) => ({ id: a.id, title: a.title, bytes: a.bytes, position: a.position, createdAt: a.createdAt })

// Each teacher keeps their own books; the administrator sees every book of
// the school with the teacher's name, and may delete any of them. For anyone
// else — a student, another teacher, another school — a book does not exist.
const mine = (user) => (isAdmin(user) ? { schoolId: user.schoolId } : { schoolId: user.schoolId, uploadedById: user.id })
const ownBook = (req, include) => prisma.textbook.findFirst({ where: { id: req.params.id, ...mine(req.user) }, include })

async function schoolBytes(schoolId) {
  const [books, tracks] = await Promise.all([
    prisma.textbook.aggregate({ where: { schoolId }, _sum: { bytes: true } }),
    prisma.textbookAudio.aggregate({ where: { textbook: { schoolId } }, _sum: { bytes: true } })
  ])
  return (books._sum.bytes ?? 0) + (tracks._sum.bytes ?? 0)
}

async function freeDiskBytes() {
  const { bavail, bsize } = await statfs(UPLOAD_ROOT)
  return Number(bavail) * Number(bsize)
}

// What a file really is, by its first bytes: browsers name the same audio
// differently, or not at all.
function audioExtension(head) {
  const text = (from, to) => head.toString('latin1', from, to)
  if (text(0, 3) === 'ID3') return 'mp3'
  if (text(0, 4) === 'OggS') return 'ogg'
  if (text(0, 4) === 'fLaC') return 'flac'
  if (text(0, 4) === 'RIFF' && text(8, 12) === 'WAVE') return 'wav'
  if (text(4, 8) === 'ftyp') return 'm4a'
  if (head[0] === 0xff && (head[1] & 0xe0) === 0xe0) return (head[1] & 0x06) === 0 ? 'aac' : 'mp3'
  return null
}

// sendFile answers Range requests: Safari will not play audio without them,
// and pdf.js reads only the pages it needs from a large book.
function sendStored(res, file, headers) {
  res.sendFile(file, { root: UPLOAD_ROOT, cacheControl: false, headers: { 'Cache-Control': 'private, max-age=86400', ...headers } }, (error) => {
    if (error && !res.headersSent) res.status(404).json({ error: 'The file is missing on the server' })
  })
}

textbooksRouter.get('/', async (req, res) => {
  const textbooks = await prisma.textbook.findMany({ where: mine(req.user), orderBy: { title: 'asc' }, include: { _count: { select: { audio: true } } } })
  const ids = [...new Set(textbooks.map((t) => t.uploadedById).filter(Boolean))]
  const people = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : []
  const byId = Object.fromEntries(people.map((p) => [p.id, p]))
  res.json({
    textbooks: textbooks.map((t) => view(t, byId[t.uploadedById])),
    storage: { usedBytes: await schoolBytes(req.user.schoolId), limitBytes: SCHOOL_QUOTA_BYTES, maxFileBytes: MAX_FILE_BYTES }
  })
})

// --- Uploads, one piece at a time ---
// What is known about an upload sits beside its bytes in the uploads volume,
// so a deploy in the middle of a long upload does not lose it.

const partPath = (id) => path.join(INCOMING_DIR, `${id}.part`)
const notePath = (id) => path.join(INCOMING_DIR, `${id}.json`)
const receivedBytes = async (id) => (await stat(partPath(id))).size
const discard = (id) => Promise.all([rm(partPath(id), { force: true }), rm(notePath(id), { force: true })])

// An upload belongs to the person who started it.
async function loadUpload(req, res, next) {
  const id = req.params.uploadId
  let upload = null
  if (/^[0-9a-f]{24}$/.test(id)) {
    try { upload = JSON.parse(await readFile(notePath(id), 'utf8')) } catch { /* unknown or swept */ }
  }
  if (!upload || upload.userId !== req.user.id) return res.status(404).json({ error: 'Upload not found' })
  req.upload = upload
  next()
}

// JSON { kind: 'pdf', title, size, pages } or { kind: 'audio', textbookId, title, size }.
textbooksRouter.post('/uploads', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const { kind, textbookId } = req.body ?? {}
  if (kind !== 'pdf' && kind !== 'audio') return res.status(400).json({ error: 'Choose a PDF or an audio file' })
  const size = Number(req.body?.size)
  if (!Number.isSafeInteger(size) || size < 100) return res.status(400).json({ error: 'This file is empty' })
  if (size > MAX_FILE_BYTES) return res.status(413).json({ error: 'The file is larger than 500 MB' })
  if (kind === 'audio') {
    const textbook = await prisma.textbook.findFirst({ where: { id: String(textbookId ?? ''), ...mine(req.user) } })
    if (!textbook) return res.status(404).json({ error: 'Textbook not found' })
  }

  await mkdir(INCOMING_DIR, { recursive: true })
  if (await schoolBytes(req.user.schoolId) + size > SCHOOL_QUOTA_BYTES) {
    return res.status(507).json({ error: 'The school\'s textbook storage is full. Delete something you no longer use.' })
  }
  if (await freeDiskBytes() - size < DISK_RESERVE_BYTES) {
    return res.status(507).json({ error: 'The server is running out of disk space. Please tell the administrator.' })
  }

  const pages = Number.parseInt(req.body?.pages, 10)
  const upload = {
    id: randomBytes(12).toString('hex'),
    kind,
    size,
    title: String(req.body?.title ?? '').trim().slice(0, 200) || (kind === 'pdf' ? 'Textbook' : 'Track'),
    pages: Number.isFinite(pages) ? pages : null,
    textbookId: kind === 'audio' ? String(textbookId) : null,
    userId: req.user.id,
    schoolId: req.user.schoolId
  }
  await writeFile(partPath(upload.id), '')
  await writeFile(notePath(upload.id), JSON.stringify(upload))
  res.status(201).json({ upload: { id: upload.id, received: 0, chunkBytes: CHUNK_BYTES } })
})

// How much has arrived: where to carry on after a dropped connection.
textbooksRouter.get('/uploads/:uploadId', requireRole('OWNER', 'TEACHER'), loadUpload, async (req, res) => {
  res.json({ received: req.upload.done ? req.upload.size : await receivedBytes(req.upload.id) })
})

// One piece, as raw bytes, at ?offset=N. A piece may start before the end of
// what has arrived — it is sent again when its answer got lost — but never
// after it.
textbooksRouter.put('/uploads/:uploadId', requireRole('OWNER', 'TEACHER'), loadUpload, express.raw({ type: () => true, limit: CHUNK_BYTES }), async (req, res) => {
  const { upload, body: bytes } = req
  if (upload.done) return res.json({ received: upload.size })
  if (!Buffer.isBuffer(bytes) || !bytes.length) return res.status(400).json({ error: 'Send a piece of the file' })
  const received = await receivedBytes(upload.id)
  const offset = Number(req.query.offset)
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > received) return res.status(409).json({ error: 'This piece is out of order', received })
  if (offset + bytes.length > upload.size) return res.status(400).json({ error: 'The file is larger than announced' })
  if (await freeDiskBytes() - bytes.length < DISK_RESERVE_BYTES) {
    return res.status(507).json({ error: 'The server is running out of disk space. Please tell the administrator.' })
  }
  const file = await open(partPath(upload.id), 'r+')
  try {
    await file.write(bytes, 0, bytes.length, offset)
    await file.truncate(offset + bytes.length)
  } finally {
    await file.close()
  }
  res.json({ received: offset + bytes.length })
})

// Everything has arrived: check what it is and put it on the shelf.
textbooksRouter.post('/uploads/:uploadId/finish', requireRole('OWNER', 'TEACHER'), loadUpload, async (req, res) => {
  const { upload } = req
  // The answer to this call can get lost too: asked again, it is the same.
  if (upload.done) return res.status(201).json(upload.done)
  const received = await receivedBytes(upload.id)
  if (received !== upload.size) return res.status(409).json({ error: 'Part of the file has not arrived', received })

  const head = Buffer.alloc(1024)
  const file = await open(partPath(upload.id), 'r')
  try { await file.read(head, 0, head.length, 0) } finally { await file.close() }
  const ext = upload.kind === 'pdf' ? (head.includes('%PDF-') ? 'pdf' : null) : audioExtension(head)
  if (!ext) {
    await discard(upload.id)
    return res.status(400).json({ error: upload.kind === 'pdf' ? 'This file is not a PDF' : 'This is not an audio file we can play: use MP3, M4A, WAV, OGG, AAC or FLAC' })
  }
  // The book may have been deleted while its audio was on the way.
  if (upload.kind === 'audio' && !(await prisma.textbook.findFirst({ where: { id: upload.textbookId, schoolId: upload.schoolId } }))) {
    await discard(upload.id)
    return res.status(404).json({ error: 'Textbook not found' })
  }

  const folder = upload.kind === 'pdf' ? 'textbooks' : 'textbook-audio'
  await mkdir(path.join(UPLOAD_ROOT, folder), { recursive: true })
  const stored = `${folder}/${randomBytes(12).toString('hex')}.${ext}`
  await rename(partPath(upload.id), path.join(UPLOAD_ROOT, stored))

  const fields = { title: upload.title, file: stored, bytes: upload.size }
  let answer
  try {
    if (upload.kind === 'pdf') {
      const textbook = await prisma.textbook.create({ data: { ...fields, pages: upload.pages, schoolId: upload.schoolId, uploadedById: upload.userId } })
      answer = { textbook: view(textbook) }
    } else {
      const position = await prisma.textbookAudio.count({ where: { textbookId: upload.textbookId } })
      answer = { audio: audioView(await prisma.textbookAudio.create({ data: { ...fields, position, textbookId: upload.textbookId } })) }
    }
  } catch (error) {
    await rm(path.join(UPLOAD_ROOT, stored), { force: true })
    await rm(notePath(upload.id), { force: true })
    throw error
  }
  await writeFile(notePath(upload.id), JSON.stringify({ ...upload, done: answer }))
  res.status(201).json(answer)
})

textbooksRouter.delete('/uploads/:uploadId', requireRole('OWNER', 'TEACHER'), loadUpload, async (req, res) => {
  await discard(req.upload.id)
  res.json({ ok: true })
})

// --- A book ---

textbooksRouter.patch('/:id', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const textbook = await ownBook(req)
  if (!textbook) return res.status(404).json({ error: 'Textbook not found' })
  const title = String(req.body?.title ?? '').trim().slice(0, 200)
  if (!title) return res.status(400).json({ error: 'A title is needed' })
  const updated = await prisma.textbook.update({ where: { id: textbook.id }, data: { title } })
  res.json({ textbook: view(updated) })
})

textbooksRouter.get('/:id/file', async (req, res) => {
  const textbook = await ownBook(req)
  if (!textbook) return res.status(404).json({ error: 'Textbook not found' })
  sendStored(res, textbook.file, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(textbook.title)}.pdf`
  })
})

textbooksRouter.delete('/:id', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const textbook = await ownBook(req, { audio: true })
  if (!textbook) return res.status(404).json({ error: 'Textbook not found' })
  await prisma.textbook.delete({ where: { id: textbook.id } })
  for (const { file } of [textbook, ...textbook.audio]) unlink(path.join(UPLOAD_ROOT, file)).catch(() => {})
  res.json({ ok: true })
})

// --- Audio tracks attached to a textbook (e.g. listening-test recordings) ---

textbooksRouter.get('/:id/audio', async (req, res) => {
  const textbook = await ownBook(req)
  if (!textbook) return res.status(404).json({ error: 'Textbook not found' })
  const tracks = await prisma.textbookAudio.findMany({ where: { textbookId: textbook.id }, orderBy: { position: 'asc' } })
  res.json({ audio: tracks.map(audioView) })
})

textbooksRouter.get('/:id/audio/:audioId/file', async (req, res) => {
  const textbook = await ownBook(req)
  if (!textbook) return res.status(404).json({ error: 'Textbook not found' })
  const track = await prisma.textbookAudio.findFirst({ where: { id: req.params.audioId, textbookId: textbook.id } })
  if (!track) return res.status(404).json({ error: 'Track not found' })
  sendStored(res, track.file, { 'Content-Type': CONTENT_TYPE_BY_EXT[path.extname(track.file).slice(1)] ?? 'application/octet-stream' })
})

textbooksRouter.delete('/:id/audio/:audioId', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const textbook = await ownBook(req)
  if (!textbook) return res.status(404).json({ error: 'Textbook not found' })
  const track = await prisma.textbookAudio.findFirst({ where: { id: req.params.audioId, textbookId: textbook.id } })
  if (!track) return res.status(404).json({ error: 'Track not found' })
  await prisma.textbookAudio.delete({ where: { id: track.id } })
  unlink(path.join(UPLOAD_ROOT, track.file)).catch(() => {})
  res.json({ ok: true })
})

// A piece cut off half-way (a dropped connection, Cancel) is routine, not a
// server failure: without this it would reach the owner as an error alert.
textbooksRouter.use((error, req, res, next) => {
  if (!error.status || error.status >= 500) return next(error)
  if (!res.headersSent) res.status(error.status).json({ error: error.status === 413 ? 'This piece of the file is too large' : 'The upload was interrupted' })
})

// Uploads nobody finished: the tab was closed, the laptop went to sleep.
export function startTextbookUploadSweep() {
  const sweep = async () => {
    for (const name of await readdir(INCOMING_DIR).catch(() => [])) {
      const file = path.join(INCOMING_DIR, name)
      const info = await stat(file).catch(() => null)
      if (info && Date.now() - info.mtimeMs > ABANDONED_AFTER_MS) await rm(file, { force: true }).catch(() => {})
    }
  }
  sweep()
  setInterval(sweep, 60 * 60_000).unref()
}
