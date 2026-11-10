// Google Drive mirror for the teacher's PDFs and audio.
//
// The server disk stays the place the lesson reads from (textbooks are served
// only through /api/textbooks, never as static files). Every new PDF or audio
// file is also copied into one folder of Google Drive, and a copy is trashed
// there when the file is deleted in the LMS. It is one-way: LMS → Drive. Files
// that someone drops into the Drive folder by hand are not imported.
//
// Config (server/.env): GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET,
// GOOGLE_DRIVE_REFRESH_TOKEN and GOOGLE_DRIVE_FOLDER_ID (both printed by
// scripts/google-drive-auth.js, which creates the folder). Without them nothing
// here runs. The scope drive.file lets the app write copies; drive.readonly
// (added 2026-11-10) lets the platform show the files the teacher puts into the
// folder herself — the «Google Drive» panel (routes/drive.js). Only the folder
// and what is inside it is ever listed or served.
import path from 'path'
import { openAsBlob } from 'fs'
import { fileURLToPath } from 'url'
import { prisma } from './db.js'

const UPLOAD_ROOT = process.env.UPLOAD_DIR ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../uploads')
// GOOGLE_DRIVE_TEST_API: a fake Google for the route tests (test/driveBrowse).
const FAKE = process.env.NODE_ENV === 'test' ? process.env.GOOGLE_DRIVE_TEST_API : null
const TOKEN_URL = FAKE ? `${FAKE}/token` : 'https://oauth2.googleapis.com/token'
const FILES_URL = FAKE ? `${FAKE}/drive/v3/files` : 'https://www.googleapis.com/drive/v3/files'
const UPLOAD_URL = FAKE ? `${FAKE}/upload?uploadType=resumable&fields=id` : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id'
const MIME_BY_EXT = { pdf: 'application/pdf', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', flac: 'audio/flac' }
const RETRY_EVERY_MS = 10 * 60_000

let fetchImpl = (...args) => fetch(...args)
// Tests replace the network with a fake.
export function setFetchForTests(fn) {
  fetchImpl = fn ?? ((...args) => fetch(...args))
  cachedToken = null
}

export function driveConfigured() {
  return ['GOOGLE_DRIVE_CLIENT_ID', 'GOOGLE_DRIVE_CLIENT_SECRET', 'GOOGLE_DRIVE_REFRESH_TOKEN', 'GOOGLE_DRIVE_FOLDER_ID'].every((k) => process.env[k])
}

let cachedToken = null
async function accessToken() {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) return cachedToken.value
  const res = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_DRIVE_CLIENT_ID,
      client_secret: process.env.GOOGLE_DRIVE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN,
      grant_type: 'refresh_token'
    })
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.access_token) throw driveError(`Drive sign-in failed (${res.status}${json.error ? ` ${json.error}` : ''})`, res.status)
  cachedToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000, scope: json.scope ?? '' }
  return cachedToken.value
}

function driveError(message, status) {
  const err = new Error(message)
  err.status = status
  return err
}

async function driveCall(url, init = {}) {
  const token = await accessToken()
  const res = await fetchImpl(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw driveError(`Drive ${init.method ?? 'GET'} failed (${res.status}): ${text.slice(0, 200)}`, res.status)
  }
  return res
}

// Resumable upload: one session, one PUT of the whole file. Works for a 150 MB
// recording the same as for a 2 MB PDF.
export async function uploadToDrive({ name, mimeType, file }) {
  const blob = await openAsBlob(file, { type: mimeType })
  const session = await driveCall(UPLOAD_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': mimeType, 'X-Upload-Content-Length': String(blob.size) },
    body: JSON.stringify({ name, mimeType, parents: [process.env.GOOGLE_DRIVE_FOLDER_ID] })
  })
  const location = session.headers.get('location')
  if (!location) throw driveError('Drive did not open an upload session')
  const res = await fetchImpl(location, { method: 'PUT', headers: { 'Content-Type': mimeType }, body: blob })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.id) throw driveError(`Drive upload failed (${res.status})`, res.status)
  return json.id
}

// Moves a copy to the Drive trash (recoverable for 30 days) — never a hard delete.
export async function trashInDrive(fileId) {
  try {
    await driveCall(`${FILES_URL}/${encodeURIComponent(fileId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true })
    })
  } catch (err) {
    if (err.status !== 404) throw err // already gone in Drive: nothing to do
  }
}

// One pass over everything not yet copied: textbooks, then audio tracks.
// Stops at the first Drive failure, so an outage does not hammer it with requests.
let running = null
export function syncToDrive() {
  if (!driveConfigured()) return Promise.resolve(0)
  if (!running) running = runSync().finally(() => { running = null })
  return running
}

async function runSync() {
  let copied = 0
  const books = await prisma.textbook.findMany({ where: { driveFileId: null }, orderBy: { createdAt: 'asc' }, take: 100 })
  const tracks = await prisma.textbookAudio.findMany({ where: { driveFileId: null }, include: { textbook: { select: { title: true } } }, orderBy: { createdAt: 'asc' }, take: 100 })
  const jobs = [
    ...books.map((b) => ({ table: 'textbook', row: b, name: b.title, file: b.file })),
    ...tracks.map((t) => ({ table: 'textbookAudio', row: t, name: `${t.textbook.title} — ${t.title}`, file: t.file }))
  ]
  for (const job of jobs) {
    try {
      const ext = path.extname(job.file).slice(1).toLowerCase()
      const driveFileId = await uploadToDrive({
        name: `${job.name}.${ext}`,
        mimeType: MIME_BY_EXT[ext] ?? 'application/octet-stream',
        file: path.join(UPLOAD_ROOT, job.file)
      })
      await prisma[job.table].update({ where: { id: job.row.id }, data: { driveFileId, driveSyncedAt: new Date() } })
      copied++
    } catch (err) {
      console.error(`[drive] ${job.table} ${job.row.id} not copied: ${err.message}`)
      // A file missing from the disk must not hold up the rest of the queue.
      if (err.code !== 'ENOENT') break
    }
  }
  return copied
}

// Trash the Drive copy of a deleted file. Errors are logged, never thrown:
// the LMS delete has already happened.
export async function removeFromDrive(fileId) {
  if (!fileId || !driveConfigured()) return
  try { await trashInDrive(fileId) } catch (err) { console.error(`[drive] copy ${fileId} not trashed: ${err.message}`) }
}

// Retries every few minutes, so files that failed (or were uploaded while
// Drive was down) get copied later without anyone pressing anything.
export function startDriveSync() {
  if (!driveConfigured()) return
  const tick = () => syncToDrive().catch((err) => console.error(`[drive] sync stopped: ${err.message}`))
  tick()
  setInterval(tick, RETRY_EVERY_MS).unref()
}

// --- Reading the folder (the «Google Drive» panel) ---

const READ_SCOPES = ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/drive']
// Without drive.readonly the app sees only its own copies, not what she adds.
export async function driveCanRead() {
  await accessToken()
  return cachedToken.scope.split(' ').some((s) => READ_SCOPES.includes(s))
}

export function kindOf(mimeType, name = '') {
  if (mimeType === 'application/vnd.google-apps.folder') return 'folder'
  if (mimeType === 'application/pdf' || /\.pdf$/i.test(name)) return 'pdf'
  if (mimeType?.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(name)) return 'audio'
  return null
}

const FIELDS = 'id,name,mimeType,size,modifiedTime,parents'
// A short memory of what Drive said: the folder is opened again and again in a
// lesson, and Drive allows only so many calls.
const LIST_TTL_MS = 30_000
const listCache = new Map() // folderId → { at, items }
const parentOf = new Map() // fileId → { parents, name, mimeType, size }

export function forgetDriveCacheForTests() { listCache.clear(); parentOf.clear() }

export async function listFolder(folderId) {
  const hit = listCache.get(folderId)
  if (hit && Date.now() - hit.at < LIST_TTL_MS) return hit.items
  const items = []
  let pageToken = ''
  do {
    const params = new URLSearchParams({
      q: `'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false`,
      fields: `nextPageToken,files(${FIELDS})`,
      orderBy: 'folder,name_natural',
      pageSize: '1000',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true'
    })
    if (pageToken) params.set('pageToken', pageToken)
    const json = await (await driveCall(`${FILES_URL}?${params}`)).json()
    for (const f of json.files ?? []) {
      parentOf.set(f.id, f)
      const kind = kindOf(f.mimeType, f.name)
      if (kind) items.push({ id: f.id, name: f.name, kind, size: f.size ? Number(f.size) : null, modifiedTime: f.modifiedTime })
    }
    pageToken = json.nextPageToken ?? ''
  } while (pageToken && items.length < 5000)
  listCache.set(folderId, { at: Date.now(), items })
  return items
}

async function fileMeta(id) {
  if (parentOf.has(id)) return parentOf.get(id)
  const params = new URLSearchParams({ fields: FIELDS, supportsAllDrives: 'true' })
  const meta = await (await driveCall(`${FILES_URL}/${encodeURIComponent(id)}?${params}`)).json()
  parentOf.set(id, meta)
  return meta
}

// The way from the LMS folder down to this file or folder, or null when it is
// somewhere else in the Drive: the platform never serves anything outside.
export async function pathInside(id) {
  const root = process.env.GOOGLE_DRIVE_FOLDER_ID
  const chain = []
  let current = id
  for (let depth = 0; depth < 12; depth++) {
    if (current === root) return chain.reverse()
    let meta
    try { meta = await fileMeta(current) } catch (err) { if (err.status === 404) return null; throw err }
    chain.push({ id: meta.id, name: meta.name, mimeType: meta.mimeType, size: meta.size ? Number(meta.size) : null })
    current = meta.parents?.[0]
    if (!current) return null
  }
  return null
}

// Every PDF and audio file in the folder and its subfolders (for the board's
// textbook picker), with the folder names on the way.
export async function listAll(kinds = ['pdf', 'audio']) {
  const found = []
  const walk = async (folderId, where, depth) => {
    if (depth > 6 || found.length > 2000) return
    for (const item of await listFolder(folderId)) {
      if (item.kind === 'folder') await walk(item.id, [...where, item.name], depth + 1)
      else if (kinds.includes(item.kind)) found.push({ ...item, folder: where.join(' / ') })
    }
  }
  await walk(process.env.GOOGLE_DRIVE_FOLDER_ID, [], 0)
  return found
}

// The bytes of one file, as Drive sends them; a Range is passed through, so
// pdf.js reads only the pages it needs and Safari can seek in audio.
export async function openDriveFile(id, { range, signal } = {}) {
  const token = await accessToken()
  const url = `${FILES_URL}/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`
  const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}`, ...(range ? { Range: range } : {}) }, signal })
  if (!res.ok && res.status !== 206) {
    const text = await res.text().catch(() => '')
    throw driveError(`Drive file failed (${res.status}): ${text.slice(0, 200)}`, res.status)
  }
  return res
}
