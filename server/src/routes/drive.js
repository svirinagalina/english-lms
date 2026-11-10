import { Router } from 'express'
import { Readable } from 'stream'
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

// Every PDF (or ?kind=audio) in the folder tree, for the board's picker.
driveRouter.get('/all', async (req, res) => {
  if (!(await ourSchool(req.user))) return res.json({ available: false, items: [] })
  try {
    if (!(await driveCanRead())) return res.json({ available: true, needsAccess: true, items: [] })
    const kind = req.query.kind === 'audio' ? 'audio' : 'pdf'
    const hidden = await mirroredIds()
    res.json({ available: true, items: (await listAll([kind])).filter((i) => !hidden.has(i.id)) })
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
