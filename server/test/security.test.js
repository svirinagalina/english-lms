// Files in the uploads volume that must never be served: diagnostics (names,
// devices, camera thumbnails) and copyrighted textbooks. Board images are.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { migrate, startServer, prisma } from './helpers.js'

let server
const uploads = mkdtempSync(path.join(tmpdir(), 'lms-security-uploads-'))

before(async () => {
  migrate()
  for (const [dir, file] of [['diag', 'diag-2026-10.log'], ['textbooks', 'book.pdf'], ['boards', 'picture.png']]) {
    mkdirSync(path.join(uploads, dir), { recursive: true })
    writeFileSync(path.join(uploads, dir, file), 'secret')
  }
  server = await startServer({ UPLOAD_DIR: uploads })
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
