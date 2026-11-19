import { Router } from 'express'
import { Readable } from 'stream'
import { randomBytes } from 'crypto'
import { mkdir, writeFile, unlink } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { mayUseBoard } from '../boardAccess.js'
import { prisma } from '../db.js'
import { requireAuth, requireRole, requirePaid } from '../auth.js'
import { driveConfigured, driveCanRead, listFolder, listAll, pathInside, openDriveFile, kindOf } from '../drive.js'

// The «Google Drive» panel: the PDFs and audio the teacher keeps in the Drive
// folder «English LMS» (and its subfolders), opened and played on the platform.
// The Drive is one school's (see driveSchool); for everyone else the
// panel does not exist. Students never see it: the files go out only to staff,
// streamed through here, never as a Drive link.
export const driveRouter = Router()
driveRouter.use(requireAuth)
driveRouter.use(requirePaid)
driveRouter.use(requireRole('OWNER', 'TEACHER'))

// Without GOOGLE_DRIVE_SCHOOL_ID: the one school whose textbooks are copied
// into this Drive (none, or several, and the panel stays hidden).
let derived = null
async function driveSchool() {
  if (process.env.GOOGLE_DRIVE_SCHOOL_ID) return process.env.GOOGLE_DRIVE_SCHOOL_ID
  if (!derived || Date.now() - derived.at > 10 * 60_000) {
    const schools = await prisma.textbook.findMany({ where: { driveFileId: { not: null } }, distinct: ['schoolId'], select: { schoolId: true }, take: 2 })
    derived = { at: Date.now(), id: schools.length === 1 ? schools[0].schoolId : null }
  }
  return derived.id
}
const ourSchool = async (user) => driveConfigured() && user.schoolId === await driveSchool()

// The copies the LMS made of its own textbooks are already under «Textbooks»;
// they are left out here (and a teacher's private book stays hers).
async function mirroredIds() {
  const [books, tracks] = await Promise.all([
    prisma.textbook.findMany({ where: { driveFileId: { not: null } }, select: { driveFileId: true } }),
    prisma.textbookAudio.findMany({ where: { driveFileId: { not: null } }, select: { driveFileId: true } })
  ])
  return new Set([...books, ...tracks].map((r) => r.driveFileId))
}

const failed = (res, err) => {
  console.error(`[drive] ${err.message}`)
  res.status(502).json({ error: 'Google Drive did not answer. Try again in a minute.' })
}

// ?folder=<id> (the LMS folder when absent) → its folders, PDFs and audio.
driveRouter.get('/', async (req, res) => {
  if (!(await ourSchool(req.user))) return res.json({ available: false })
  try {
    if (!(await driveCanRead())) return res.json({ available: true, needsAccess: true, items: [], path: [] })
    const root = process.env.GOOGLE_DRIVE_FOLDER_ID
    const folder = String(req.query.folder ?? '') || root
    const trail = folder === root ? [] : await pathInside(folder)
    if (!trail || (trail.length && trail[trail.length - 1].mimeType !== 'application/vnd.google-apps.folder')) return res.status(404).json({ error: 'Folder not found' })
    const hidden = await mirroredIds()
    const items = (await listFolder(folder)).filter((i) => !hidden.has(i.id))
    res.json({ available: true, folder, path: trail.map(({ id, name }) => ({ id, name })), items })
  } catch (err) { failed(res, err) }
})

// Every PDF (?kind=audio: audio; ?kind=any: folders, PDFs and audio — the
// panel's search) in the folder tree, with the folders on the way.
driveRouter.get('/all', async (req, res) => {
  if (!(await ourSchool(req.user))) return res.json({ available: false, items: [] })
  try {
    if (!(await driveCanRead())) return res.json({ available: true, needsAccess: true, items: [] })
    const kinds = req.query.kind === 'any' ? ['folder', 'pdf', 'audio'] : [req.query.kind === 'audio' ? 'audio' : 'pdf']
    const hidden = await mirroredIds()
    res.json({ available: true, items: (await listAll(kinds, { fresh: req.query.fresh === '1' })).filter((i) => !hidden.has(i.id)) })
  } catch (err) { failed(res, err) }
})

const TYPES = { pdf: 'application/pdf', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', flac: 'audio/flac' }

driveRouter.get('/files/:id', async (req, res) => {
  if (!(await ourSchool(req.user))) return res.status(404).json({ error: 'File not found' })
  const abort = new AbortController()
  res.on('close', () => abort.abort())
  try {
    const trail = await pathInside(req.params.id)
    const file = trail?.[trail.length - 1]
    const kind = file && kindOf(file.mimeType, file.name)
    if (!file || (kind !== 'pdf' && kind !== 'audio')) return res.status(404).json({ error: 'File not found' })
    const range = /^bytes=\d*-\d*$/.test(req.headers.range ?? '') ? req.headers.range : undefined
    const drive = await openDriveFile(file.id, { range, signal: abort.signal })
    const ext = file.name.split('.').pop()?.toLowerCase()
    res.status(drive.status === 206 ? 206 : 200)
    res.setHeader('Content-Type', kind === 'pdf' ? 'application/pdf' : (TYPES[ext] ?? file.mimeType))
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`)
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Cache-Control', 'private, max-age=3600')
    for (const h of ['content-length', 'content-range']) if (drive.headers.get(h)) res.setHeader(h, drive.headers.get(h))
    if (req.method === 'HEAD' || !drive.body) return res.end()
    Readable.fromWeb(drive.body).on('error', () => res.destroy()).pipe(res)
  } catch (err) {
    if (abort.signal.aborted) return
    if (err.status === 416) return res.status(416).end()
    if (res.headersSent) return res.destroy()
    failed(res, err)
  }
})

// An audio file from the Drive put on a board as a player card. It is copied
// next to the board's pictures (uploads/<board>/), so everyone on the board —
// students included, who never reach the Drive routes — plays it from there,
// with seeking, and it keeps playing even if the Drive file is moved later.
const UPLOAD_ROOT = process.env.UPLOAD_DIR ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads')
const MAX_BOARD_AUDIO = 80 * 1024 * 1024
const AUDIO_EXT = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/ogg': 'ogg', 'audio/flac': 'flac' }

driveRouter.post('/files/:id/board', async (req, res) => {
  if (!(await ourSchool(req.user))) return res.status(404).json({ error: 'File not found' })
  const board = await mayUseBoard(req.user, req.body?.boardId)
  if (!board) return res.status(404).json({ error: 'Board not found' })
  let target
  try {
    const trail = await pathInside(req.params.id)
    const file = trail?.[trail.length - 1]
    if (!file || kindOf(file.mimeType, file.name) !== 'audio') return res.status(404).json({ error: 'File not found' })
    const fromName = file.name.split('.').pop()?.toLowerCase()
    const ext = TYPES[fromName] && fromName !== 'pdf' ? fromName : (AUDIO_EXT[file.mimeType] ?? 'mp3')
    const drive = await openDriveFile(file.id)
    if (Number(drive.headers.get('content-length')) > MAX_BOARD_AUDIO) return res.status(413).json({ error: 'The recording is larger than 80 MB' })
    const bytes = Buffer.from(await drive.arrayBuffer())
    if (bytes.length > MAX_BOARD_AUDIO) return res.status(413).json({ error: 'The recording is larger than 80 MB' })
    const directory = path.join(UPLOAD_ROOT, board.id.toLowerCase())
    await mkdir(directory, { recursive: true })
    target = path.join(directory, `${randomBytes(12).toString('hex')}.${ext}`)
    await writeFile(target, bytes)
    res.status(201).json({ src: `/uploads/${board.id.toLowerCase()}/${path.basename(target)}`, name: file.name })
  } catch (err) {
    if (target) unlink(target).catch(() => {})
    failed(res, err)
  }
})
