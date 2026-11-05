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
// here runs. The scope is drive.file: the app sees only the files and folders it
// created itself, not the rest of the Drive.
import path from 'path'
import { openAsBlob } from 'fs'
import { fileURLToPath } from 'url'
import { prisma } from './db.js'

const UPLOAD_ROOT = process.env.UPLOAD_DIR ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../uploads')
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const FILES_URL = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id'
const MIME_BY_EXT = { pdf: 'application/pdf', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg' }
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
  cachedToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 }
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
// Stops at the first failure, so a Drive outage does not hammer it with requests.
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
      break
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
