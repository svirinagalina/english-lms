// Google Drive copy: the HTTP side only, with a fake Google. Runs without a
// database or network.
import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { driveConfigured, uploadToDrive, trashInDrive, setFetchForTests } from '../src/drive.js'

const ENV = { GOOGLE_DRIVE_CLIENT_ID: 'cid', GOOGLE_DRIVE_CLIENT_SECRET: 'csecret', GOOGLE_DRIVE_REFRESH_TOKEN: 'rtoken', GOOGLE_DRIVE_FOLDER_ID: 'folder1' }
const dir = mkdtempSync(path.join(tmpdir(), 'drive-test-'))
const pdf = path.join(dir, 'book.pdf')
writeFileSync(pdf, Buffer.from('%PDF-1.4 test body'))

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })

beforeEach(() => { Object.assign(process.env, ENV) })
after(() => setFetchForTests(null))

test('driveConfigured needs all four settings', () => {
  assert.equal(driveConfigured(), true)
  delete process.env.GOOGLE_DRIVE_FOLDER_ID
  assert.equal(driveConfigured(), false)
  process.env.GOOGLE_DRIVE_FOLDER_ID = 'folder1'
})

test('uploads a file: sign-in, resumable session, then the bytes into the folder', async () => {
  const calls = []
  setFetchForTests(async (url, init = {}) => {
    calls.push({ url: String(url), init })
    if (String(url).startsWith('https://oauth2.googleapis.com/token')) return json({ access_token: 'at1', expires_in: 3600 })
    if (String(url).includes('uploadType=resumable')) return new Response(null, { status: 200, headers: { Location: 'https://upload.example/session/1' } })
    if (String(url) === 'https://upload.example/session/1') return json({ id: 'drive-file-9' })
    throw new Error('unexpected ' + url)
  })
  const id = await uploadToDrive({ name: 'Unit 1.pdf', mimeType: 'application/pdf', file: pdf })
  assert.equal(id, 'drive-file-9')
  const init = calls.find((c) => c.url.includes('uploadType=resumable'))
  assert.equal(init.init.headers.Authorization, 'Bearer at1')
  assert.equal(init.init.headers['X-Upload-Content-Type'], 'application/pdf')
  assert.deepEqual(JSON.parse(init.init.body), { name: 'Unit 1.pdf', mimeType: 'application/pdf', parents: ['folder1'] })
  assert.equal(calls.filter((c) => c.url.startsWith('https://oauth2')).length, 1)
})

test('a failed sign-in stops the upload with a readable error', async () => {
  setFetchForTests(async () => json({ error: 'invalid_grant' }, 400))
  await assert.rejects(uploadToDrive({ name: 'x.pdf', mimeType: 'application/pdf', file: pdf }), /Drive sign-in failed \(400 invalid_grant\)/)
})

test('trashing a copy marks it trashed, and a copy already gone is not an error', async () => {
  const seen = []
  setFetchForTests(async (url, init = {}) => {
    if (String(url).startsWith('https://oauth2')) return json({ access_token: 'at2', expires_in: 3600 })
    seen.push({ url: String(url), method: init.method, body: init.body })
    return seen.length === 1 ? json({}) : json({ error: 'notFound' }, 404)
  })
  await trashInDrive('abc')
  await trashInDrive('gone')
  assert.equal(seen[0].method, 'PATCH')
  assert.match(seen[0].url, /\/drive\/v3\/files\/abc$/)
  assert.deepEqual(JSON.parse(seen[0].body), { trashed: true })
})
