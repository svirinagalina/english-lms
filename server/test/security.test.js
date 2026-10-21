// Files in the uploads volume that must never be served: diagnostics (names,
// devices, camera thumbnails) and copyrighted textbooks. Board images are.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { migrate, seed, startServer, signedIn, prisma } from './helpers.js'

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

test('board pictures are still served', async () => {
  const res = await fetch(`${server.base}/uploads/boards/picture.png`)
  assert.equal(res.status, 200)
})

test('board pictures are kept by the browser only, not by a shared cache', async () => {
  const res = await fetch(`${server.base}/uploads/boards/picture.png`)
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
