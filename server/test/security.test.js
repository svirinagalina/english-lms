// Files in the uploads volume that must never be served: diagnostics (names,
// devices, camera thumbnails) and copyrighted textbooks. Board images are.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { migrate, seed, startServer, signedIn, prisma } from './helpers.js'
import { generateApiToken } from '../src/auth.js'

let server, school
const uploads = mkdtempSync(path.join(tmpdir(), 'lms-security-uploads-'))
const diag = mkdtempSync(path.join(tmpdir(), 'lms-security-diag-'))

before(async () => {
  migrate()
  school = await seed()
  for (const [dir, file] of [['diag', 'diag-2026-10.log'], ['textbooks', 'book.pdf'], ['boards', 'picture.png']]) {
    mkdirSync(path.join(uploads, dir), { recursive: true })
    writeFileSync(path.join(uploads, dir, file), 'secret')
  }
  server = await startServer({ UPLOAD_DIR: uploads, DIAG_DIR: diag })
})

after(async () => {
  await server?.stop()
  await prisma.$disconnect()
})

test('diagnostic logs are not served, whatever the spelling of the path', async () => {
  for (const url of ['/uploads/diag/diag-2026-10.log', '/uploads/diag/', '/uploads//diag/diag-2026-10.log', '/uploads/DIAG/diag-2026-10.log', '/uploads/%64iag/diag-2026-10.log', '/uploads/./diag/diag-2026-10.log', '/uploads/%2fdiag/diag-2026-10.log']) {
    const res = await fetch(server.base + url)
    assert.notEqual(await res.text(), 'secret', url)
  }
})

test('textbooks are not served from uploads, whatever the spelling of the path', async () => {
  for (const url of ['/uploads/textbooks/book.pdf', '/uploads//textbooks/book.pdf', '/uploads/%74extbooks/book.pdf', '/uploads/./textbooks/book.pdf']) {
    const res = await fetch(server.base + url)
    assert.notEqual(await res.text(), 'secret', url)
  }
})

test('board pictures open for someone signed in, and for nobody else', async () => {
  const cookie = await cookieOf(school.people.student)
  assert.equal(await (await fetch(`${server.base}/uploads/boards/picture.png`, { headers: { cookie } })).text(), 'secret')
  for (const url of ['/uploads/boards/picture.png', '/uploads//boards/picture.png', '/uploads/%62oards/picture.png']) {
    const res = await fetch(server.base + url)
    assert.equal(res.status, 404, url)
    assert.notEqual(await res.text(), 'secret', url)
  }
  assert.equal((await fetch(`${server.base}/uploads/boards/picture.png`, { headers: { cookie: 'lms_token=forged' } })).status, 404)
})

test('an API token (the Content tools) opens files too', async () => {
  const { token, hash, prefix } = generateApiToken()
  await prisma.apiToken.create({ data: { name: 'test', tokenHash: hash, prefix, userId: school.people.owner.id, schoolId: school.schoolA.id } })
  const res = await fetch(`${server.base}/uploads/boards/picture.png`, { headers: { authorization: `Bearer ${token}` } })
  assert.equal(res.status, 200)
})

test('the bare /uploads/ address still answers (a monitor polls it)', async () => {
  assert.notEqual((await fetch(`${server.base}/uploads/`)).status, 500)
})

test('board pictures are kept by the browser only, not by a shared cache', async () => {
  const res = await fetch(`${server.base}/uploads/boards/picture.png`, { headers: { cookie: await cookieOf(school.people.student) } })
  const cache = res.headers.get('cache-control')
  assert.match(cache, /\bprivate\b/)
  assert.doesNotMatch(cache, /\bpublic\b|immutable/)
})

test('a diagnostic report is written outside the uploads folder', async () => {
  const student = await signedIn(server.base, school.people.student)
  assert.equal((await student.post('/api/diag', { kind: 'test.event', message: 'hello' })).status, 200)
  // The line is appended a moment after the answer.
  const written = () => readdirSync(diag).find((name) => readFileSync(path.join(diag, name), 'utf8').includes('test.event: hello'))
  const deadline = Date.now() + 3000
  while (!written() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50))
  const file = written()
  assert.match(file ?? '', /^diag-\d{4}-\d{2}\.log$/)
  const publicCopy = path.join(uploads, 'diag', file)
  assert.ok(!existsSync(publicCopy) || !readFileSync(publicCopy, 'utf8').includes('test.event'))
})

// --- Requests from other sites (CSRF) -------------------------------------------

async function cookieOf(person) {
  const res = await fetch(`${server.base}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: person.email, password: 'test-password-1' })
  })
  return res.headers.get('set-cookie').split(';')[0]
}
const report = (cookie, headers = {}) => fetch(`${server.base}/api/activity`, {
  method: 'POST', headers: { 'content-type': 'application/json', cookie, ...headers }, body: JSON.stringify({ section: 'board' })
})

test("a signed-in change sent from another site's page is refused", async () => {
  const cookie = await cookieOf(school.people.teacher)
  assert.equal((await report(cookie, { origin: 'https://evil.example' })).status, 403)
  assert.equal((await report(cookie, { 'sec-fetch-site': 'cross-site' })).status, 403)
})

test("the platform's own pages, and callers that are not browsers, still work", async () => {
  const cookie = await cookieOf(school.people.teacher)
  assert.notEqual((await report(cookie, { origin: 'http://localhost:5173' })).status, 403)
  assert.notEqual((await report(cookie, { 'sec-fetch-site': 'same-origin' })).status, 403)
  assert.notEqual((await report(cookie)).status, 403)
  // No cookie at all: nothing to forge, the normal sign-in answer.
  assert.equal((await fetch(`${server.base}/api/activity`, { method: 'POST', headers: { origin: 'https://evil.example' } })).status, 401)
})

// --- Content uploads ----------------------------------------------------------------

test("an uploaded file is stored under the extension of its checked type, not the sender's name", async () => {
  const owner = await signedIn(server.base, school.people.owner)
  const item = (await owner.post('/api/content/items', { title: 'Post' })).body.item
  const upload = await fetch(`${server.base}/api/content/items/${item.id}/files`, {
    method: 'POST',
    headers: { cookie: await cookieOf(school.people.owner), 'content-type': 'text/plain', 'x-file-name': 'payload.html' },
    body: '<script>alert(1)</script>'
  })
  assert.equal(upload.status, 201)
  const { file } = await upload.json()
  const row = await prisma.contentFile.findUnique({ where: { id: file.id } })
  assert.match(row.path, /-payload\.txt$/)
  const served = await fetch(server.base + row.path, { headers: { cookie: await cookieOf(school.people.owner) } })
  assert.doesNotMatch(served.headers.get('content-type') ?? '', /html/)
})

test('no other site may frame the platform; links out carry only the origin', async () => {
  for (const url of ['/api/health', '/api/auth/me']) {
    const res = await fetch(server.base + url)
    assert.equal(res.headers.get('content-security-policy'), "frame-ancestors 'self'", url)
    assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN', url)
    assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin', url)
  }
})
