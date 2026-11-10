// The «Google Drive» panel: the school's staff see the folder «English LMS»
// and its subfolders, open PDFs and play audio through the server — and
// nothing outside that folder, nobody else, no student.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { migrate, seed, startServer, signedIn, prisma } from './helpers.js'

const files = {
  root: { id: 'root', name: 'English LMS', mimeType: 'application/vnd.google-apps.folder', parents: ['myDrive'] },
  units: { id: 'units', name: 'Units', mimeType: 'application/vnd.google-apps.folder', parents: ['root'] },
  book: { id: 'book', name: 'Solutions.pdf', mimeType: 'application/pdf', size: '20', parents: ['root'] },
  song: { id: 'song', name: 'Track 01.mp3', mimeType: 'audio/mpeg', size: '20', parents: ['units'] },
  inUnit: { id: 'inUnit', name: 'Unit 2.pdf', mimeType: 'application/pdf', size: '20', parents: ['units'] },
  sheet: { id: 'sheet', name: 'Plan', mimeType: 'application/vnd.google-apps.spreadsheet', parents: ['root'] },
  copy: { id: 'copy', name: 'Mirrored.pdf', mimeType: 'application/pdf', size: '20', parents: ['root'] },
  secret: { id: 'secret', name: 'Taxes.pdf', mimeType: 'application/pdf', size: '20', parents: ['myDrive'] }
}
const BYTES = Buffer.from('%PDF-1.4 0123456789x')
let fake, server, school, scope = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly'
const seenRanges = []

before(async () => {
  fake = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x')
    const send = (body, status = 200) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)) }
    if (url.pathname === '/token') return send({ access_token: 'at', expires_in: 3600, scope })
    const m = /^\/drive\/v3\/files(?:\/([^/]+))?$/.exec(url.pathname)
    if (!m) return send({ error: 'nope' }, 404)
    if (!m[1]) {
      const parent = /'([^']+)' in parents/.exec(url.searchParams.get('q'))[1]
      return send({ files: Object.values(files).filter((f) => f.parents[0] === parent) })
    }
    const f = files[decodeURIComponent(m[1])]
    if (!f) return send({ error: 'notFound' }, 404)
    if (url.searchParams.get('alt') !== 'media') return send(f)
    const range = /bytes=(\d+)-(\d+)/.exec(req.headers.range ?? '')
    seenRanges.push(req.headers.range ?? null)
    if (range) {
      const [from, to] = [Number(range[1]), Number(range[2])]
      res.writeHead(206, { 'content-length': to - from + 1, 'content-range': `bytes ${from}-${to}/${BYTES.length}` })
      return res.end(BYTES.subarray(from, to + 1))
    }
    res.writeHead(200, { 'content-length': BYTES.length })
    res.end(BYTES)
  }).listen(0)
  migrate()
  school = await seed()
  await prisma.textbook.create({ data: { title: 'Mirrored', file: 'textbooks/x.pdf', bytes: 20, schoolId: school.schoolA.id, uploadedById: school.people.teacher.id, driveFileId: 'copy' } })
  server = await startServer({
    GOOGLE_DRIVE_TEST_API: `http://127.0.0.1:${fake.address().port}`,
    GOOGLE_DRIVE_CLIENT_ID: 'c', GOOGLE_DRIVE_CLIENT_SECRET: 's', GOOGLE_DRIVE_REFRESH_TOKEN: 'r',
    GOOGLE_DRIVE_FOLDER_ID: 'root',
    GOOGLE_DRIVE_SCHOOL_ID: school.schoolA.id
  })
})

after(async () => {
  await server?.stop?.()
  fake?.closeAllConnections?.()
  fake?.close()
  await prisma.$disconnect()
})

test('a teacher sees the folder: subfolders, PDFs and audio; not Google Sheets, not the LMS\'s own copies', async () => {
  const teacher = await signedIn(server.base, school.people.teacher)
  const res = await teacher.get('/api/drive')
  assert.equal(res.status, 200)
  assert.equal(res.body.available, true)
  assert.deepEqual(res.body.items.map((i) => [i.name, i.kind]).sort(), [['Solutions.pdf', 'pdf'], ['Units', 'folder']])
  const units = await teacher.get('/api/drive?folder=units')
  assert.deepEqual(units.body.path, [{ id: 'units', name: 'Units' }])
  assert.deepEqual(units.body.items.map((i) => i.kind).sort(), ['audio', 'pdf'])
})

test('the board\'s picker gets every PDF of the tree with its folder', async () => {
  const teacher = await signedIn(server.base, school.people.teacher)
  const res = await teacher.get('/api/drive/all?kind=pdf')
  assert.deepEqual(res.body.items.map((i) => `${i.folder}|${i.name}`).sort(), ['Units|Unit 2.pdf', '|Solutions.pdf'].sort())
})

test('a file is served in ranges; anything outside the folder is not found', async () => {
  const teacher = await signedIn(server.base, school.people.teacher)
  const cookie = teacher.cookie ?? (await (await fetch(`${server.base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: school.people.teacher.email, password: 'test-password-1' }) })).headers.get('set-cookie').split(';')[0])
  const whole = await fetch(`${server.base}/api/drive/files/book`, { headers: { cookie } })
  assert.equal(whole.status, 200)
  assert.equal(whole.headers.get('content-type'), 'application/pdf')
  assert.equal(whole.headers.get('accept-ranges'), 'bytes')
  assert.deepEqual(Buffer.from(await whole.arrayBuffer()), BYTES)
  const part = await fetch(`${server.base}/api/drive/files/song`, { headers: { cookie, range: 'bytes=2-5' } })
  assert.equal(part.status, 206)
  assert.equal(part.headers.get('content-type'), 'audio/mpeg')
  assert.equal(part.headers.get('content-range'), `bytes 2-5/${BYTES.length}`)
  assert.equal(Buffer.from(await part.arrayBuffer()).toString(), 'DF-1')
  assert.ok(seenRanges.includes('bytes=2-5'))
  for (const id of ['secret', 'units', 'sheet', 'nothing']) {
    const res = await fetch(`${server.base}/api/drive/files/${id}`, { headers: { cookie } })
    assert.equal(res.status, 404, id)
  }
  const outside = await teacher.get('/api/drive?folder=myDrive')
  assert.equal(outside.status, 404)
})

test('a student is refused; another school does not have the panel', async () => {
  const student = await signedIn(server.base, school.people.student)
  assert.equal((await student.get('/api/drive')).status, 403)
  const other = await signedIn(server.base, school.people.teacherB)
  assert.deepEqual((await other.get('/api/drive')).body, { available: false })
})
