// The textbook store: PDFs and their audio go up in pieces, come back in
// ranges, and reach nobody but their teacher and the school's administrators.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import net from 'node:net'
import path from 'node:path'
import { client, migrate, seed, startServer, signedIn, prisma } from './helpers.js'

const CHUNK = 4 * 1024 * 1024
const QUOTA = 30 * 1024 * 1024
const uploads = mkdtempSync(path.join(tmpdir(), 'lms-textbooks-'))
const incoming = path.join(uploads, 'textbook-incoming')
let server, school, as

const pdf = (bytes) => Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(bytes - 9, 'p')])
const mp3 = (bytes) => Buffer.concat([Buffer.from('ID3'), Buffer.alloc(bytes - 3, 'a')])

// The raw request a browser makes: the tiny test client speaks only JSON.
function raw(person, method, url, { body, headers } = {}) {
  return fetch(server.base + url, { method, body, headers: { cookie: person.cookie, ...headers } })
}

async function person(key) {
  const signed = await signedIn(server.base, school.people[key])
  const res = await fetch(`${server.base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: school.people[key].email, password: 'test-password-1' }) })
  return Object.assign(signed, { cookie: res.headers.get('set-cookie').split(';')[0] })
}

const sendPiece = (who, id, offset, bytes) => raw(who, 'PUT', `/api/textbooks/uploads/${id}?offset=${offset}`, { body: bytes, headers: { 'content-type': 'application/octet-stream' } })

async function upload(who, details, bytes) {
  const started = await who.post('/api/textbooks/uploads', { size: bytes.length, ...details })
  assert.equal(started.status, 201, JSON.stringify(started.body))
  const { id, chunkBytes } = started.body.upload
  for (let offset = 0; offset < bytes.length; offset += chunkBytes) {
    const res = await sendPiece(who, id, offset, bytes.subarray(offset, offset + chunkBytes))
    assert.equal(res.status, 200)
  }
  return who.post(`/api/textbooks/uploads/${id}/finish`)
}

const addBook = async (who, title = 'Book', bytes = pdf(1000)) => (await upload(who, { kind: 'pdf', title, pages: 3 }, bytes)).body.textbook
const addTrack = async (who, book, title = 'Track 1', bytes = mp3(1000)) => (await upload(who, { kind: 'audio', textbookId: book.id, title }, bytes)).body.audio

before(async () => {
  migrate()
  school = await seed()
  server = await startServer({ UPLOAD_DIR: uploads, TEXTBOOK_QUOTA_BYTES: String(QUOTA), TEXTBOOK_DISK_RESERVE_BYTES: '1' })
  as = {}
  for (const key of ['owner', 'partner', 'teacher', 'teacher2', 'student', 'teacherB']) as[key] = await person(key)
})

after(async () => {
  await server?.stop()
  await prisma.$disconnect()
})

test('a file larger than one piece arrives whole, and a piece can be sent again', async () => {
  const bytes = pdf(CHUNK * 2 + 12345)
  const started = await as.teacher.post('/api/textbooks/uploads', { kind: 'pdf', title: 'Big book', size: bytes.length, pages: 300 })
  const { id, chunkBytes } = started.body.upload
  assert.equal(chunkBytes, CHUNK)

  assert.equal((await sendPiece(as.teacher, id, 0, bytes.subarray(0, CHUNK))).status, 200)
  // A piece from further on is refused, and the answer says where to carry on.
  const ahead = await sendPiece(as.teacher, id, CHUNK * 2, bytes.subarray(CHUNK * 2))
  assert.equal(ahead.status, 409)
  assert.equal((await ahead.json()).received, CHUNK)
  // Its answer got lost: the same piece again changes nothing.
  assert.equal((await sendPiece(as.teacher, id, 0, bytes.subarray(0, CHUNK))).status, 200)
  assert.equal((await as.teacher.get(`/api/textbooks/uploads/${id}`)).body.received, CHUNK)
  // Finishing before the end is refused.
  assert.equal((await as.teacher.post(`/api/textbooks/uploads/${id}/finish`)).status, 409)

  await sendPiece(as.teacher, id, CHUNK, bytes.subarray(CHUNK, CHUNK * 2))
  await sendPiece(as.teacher, id, CHUNK * 2, bytes.subarray(CHUNK * 2))
  const finished = await as.teacher.post(`/api/textbooks/uploads/${id}/finish`)
  assert.equal(finished.status, 201)
  assert.equal(finished.body.textbook.pages, 300)
  assert.equal(finished.body.textbook.bytes, bytes.length)
  // The answer to finish got lost: asked again, no second book appears.
  const again = await as.teacher.post(`/api/textbooks/uploads/${id}/finish`)
  assert.equal(again.body.textbook.id, finished.body.textbook.id)
  assert.equal(await prisma.textbook.count({ where: { title: 'Big book' } }), 1)

  const stored = await raw(as.teacher, 'GET', `/api/textbooks/${finished.body.textbook.id}/file`)
  assert.equal(stored.headers.get('content-type'), 'application/pdf')
  assert.ok(Buffer.from(await stored.arrayBuffer()).equals(bytes))
  await as.teacher.delete(`/api/textbooks/${finished.body.textbook.id}`)
})

test('files are read in ranges: Safari needs it for audio, pdf.js for a big book', async () => {
  const book = await addBook(as.teacher, 'Ranges')
  const track = await addTrack(as.teacher, book)
  for (const url of [`/api/textbooks/${book.id}/file`, `/api/textbooks/${book.id}/audio/${track.id}/file`]) {
    const res = await raw(as.teacher, 'GET', url, { headers: { range: 'bytes=0-9' } })
    assert.equal(res.status, 206, url)
    assert.equal(res.headers.get('content-range'), 'bytes 0-9/1000')
    assert.equal((await res.arrayBuffer()).byteLength, 10)
    assert.match(res.headers.get('cache-control'), /private/)
  }
})

test('a file that is not what it says stays out', async () => {
  const fake = Buffer.alloc(2000, '<html>')
  const asPdf = await upload(as.teacher, { kind: 'pdf', title: 'Fake' }, fake)
  assert.equal(asPdf.status, 400)
  const book = await addBook(as.teacher, 'Real')
  const asAudio = await upload(as.teacher, { kind: 'audio', textbookId: book.id, title: 'Fake' }, fake)
  assert.equal(asAudio.status, 400)
  assert.equal((await as.teacher.get(`/api/textbooks/${book.id}/audio`)).body.audio.length, 0)
  assert.deepEqual(readdirSync(incoming).filter((name) => name.endsWith('.part')), [])
})

test('the common audio formats are recognised by their first bytes', async () => {
  const book = await addBook(as.teacher, 'Formats')
  const head = { mp3: [0xff, 0xfb, 0x90], aac: [0xff, 0xf1, 0x50], wav: [...Buffer.from('RIFF0000WAVE')], m4a: [0, 0, 0, 32, ...Buffer.from('ftypM4A ')], ogg: [...Buffer.from('OggS')], flac: [...Buffer.from('fLaC')] }
  const types = { mp3: 'audio/mpeg', aac: 'audio/aac', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg', flac: 'audio/flac' }
  for (const [ext, start] of Object.entries(head)) {
    const track = await addTrack(as.teacher, book, ext, Buffer.concat([Buffer.from(start), Buffer.alloc(500)]))
    const res = await raw(as.teacher, 'GET', `/api/textbooks/${book.id}/audio/${track.id}/file`)
    assert.equal(res.headers.get('content-type'), types[ext], ext)
  }
})

test('tracks keep their order and the list says how many a book has', async () => {
  const book = await addBook(as.teacher, 'Order')
  for (const title of ['One', 'Two', 'Three']) await addTrack(as.teacher, book, title)
  assert.deepEqual((await as.teacher.get(`/api/textbooks/${book.id}/audio`)).body.audio.map((t) => t.title), ['One', 'Two', 'Three'])
  const { textbooks } = (await as.teacher.get('/api/textbooks')).body
  assert.equal(textbooks.find((t) => t.id === book.id).audioCount, 3)
})

test('only the teacher and the administrators reach a book; to anyone else it does not exist', async () => {
  const book = await addBook(as.teacher, 'Private')
  const track = await addTrack(as.teacher, book)
  const urls = [`/api/textbooks/${book.id}/file`, `/api/textbooks/${book.id}/audio`, `/api/textbooks/${book.id}/audio/${track.id}/file`]

  for (const url of urls) {
    for (const who of ['teacher', 'owner', 'partner']) assert.equal((await as[who].get(url)).status, 200, `${who} ${url}`)
    for (const who of ['teacher2', 'student', 'teacherB']) assert.equal((await as[who].get(url)).status, 404, `${who} ${url}`)
    assert.equal((await client(server.base).get(url)).status, 401, `signed out ${url}`)
  }
  for (const who of ['teacher2', 'teacherB']) {
    assert.equal((await as[who].delete(`/api/textbooks/${book.id}`)).status, 404)
    assert.equal((await as[who].delete(`/api/textbooks/${book.id}/audio/${track.id}`)).status, 404)
    assert.equal((await as[who].patch(`/api/textbooks/${book.id}`, { title: 'Mine now' })).status, 404)
    assert.equal((await as[who].post('/api/textbooks/uploads', { kind: 'audio', textbookId: book.id, title: 'x', size: 1000 })).status, 404)
  }
  const list = (await as.teacherB.get('/api/textbooks')).body
  assert.equal(list.textbooks.length, 0)
  assert.equal(list.storage.usedBytes, 0)
})

test('the stored files have no address of their own, even for someone signed in', async () => {
  const book = await addBook(as.teacher, 'No address')
  const track = await addTrack(as.teacher, book)
  const { file: pdfFile } = await prisma.textbook.findUnique({ where: { id: book.id } })
  const { file: audioFile } = await prisma.textbookAudio.findUnique({ where: { id: track.id } })
  const started = await as.teacher.post('/api/textbooks/uploads', { kind: 'pdf', title: 'Half', size: 1000 })
  const half = `textbook-incoming/${started.body.upload.id}.part`
  assert.ok(existsSync(path.join(uploads, audioFile)) && existsSync(path.join(uploads, half)))
  for (const file of [pdfFile, audioFile, half]) {
    for (const url of [`/uploads/${file}`, `/uploads//${file}`, `/uploads/./${file}`, `/uploads/${file.replace('t', '%74')}`]) {
      for (const who of ['teacher', 'owner', 'teacherB']) assert.equal((await raw(as[who], 'GET', url)).status, 404, `${who} ${url}`)
    }
  }
})

test('an upload belongs to the person who started it', async () => {
  const started = await as.teacher.post('/api/textbooks/uploads', { kind: 'pdf', title: 'Theirs', size: 1000 })
  const { id } = started.body.upload
  for (const who of ['teacher2', 'teacherB', 'owner']) {
    assert.equal((await sendPiece(as[who], id, 0, pdf(1000))).status, 404, who)
    assert.equal((await as[who].get(`/api/textbooks/uploads/${id}`)).status, 404, who)
    assert.equal((await as[who].post(`/api/textbooks/uploads/${id}/finish`)).status, 404, who)
    assert.equal((await as[who].delete(`/api/textbooks/uploads/${id}`)).status, 404, who)
  }
  assert.equal((await sendPiece(as.teacher, '../../etc/passwd', 0, pdf(1000))).status, 404)
  assert.equal((await as.teacher.delete(`/api/textbooks/uploads/${id}`)).status, 200)
  assert.ok(!existsSync(path.join(incoming, `${id}.part`)))
})

test('students and the view-only partner upload nothing', async () => {
  assert.equal((await as.student.post('/api/textbooks/uploads', { kind: 'pdf', title: 'x', size: 1000 })).status, 403)
  assert.equal((await as.partner.post('/api/textbooks/uploads', { kind: 'pdf', title: 'x', size: 1000 })).status, 403)
})

test('sizes are checked before any bytes travel: per file, per school', async () => {
  const tooBig = await as.teacher.post('/api/textbooks/uploads', { kind: 'pdf', title: 'x', size: 501 * 1024 * 1024 })
  assert.equal(tooBig.status, 413)
  const { storage } = (await as.teacher.get('/api/textbooks')).body
  const overQuota = await as.teacher.post('/api/textbooks/uploads', { kind: 'pdf', title: 'x', size: QUOTA - storage.usedBytes + 1 })
  assert.equal(overQuota.status, 507)
  // Another school's books take nothing from this one's room.
  const elsewhere = await as.teacherB.post('/api/textbooks/uploads', { kind: 'pdf', title: 'x', size: QUOTA - 1 })
  assert.equal(elsewhere.status, 201)
  await as.teacherB.delete(`/api/textbooks/uploads/${elsewhere.body.upload.id}`)
})

test('a piece larger than announced or than a piece may be is refused without an error alert', async () => {
  const started = await as.teacher.post('/api/textbooks/uploads', { kind: 'pdf', title: 'x', size: 1000 })
  const { id } = started.body.upload
  assert.equal((await sendPiece(as.teacher, id, 0, pdf(1001))).status, 400)
  assert.equal((await sendPiece(as.teacher, id, 0, pdf(CHUNK + 1))).status, 413)
  assert.doesNotMatch(server.output(), /uploads\/[0-9a-f]+.* failed/)
  await as.teacher.delete(`/api/textbooks/uploads/${id}`)
})

test('a piece cut off half-way is routine: nothing lands in the error alerts', async () => {
  const started = await as.teacher.post('/api/textbooks/uploads', { kind: 'pdf', title: 'x', size: 1000 })
  const { id } = started.body.upload
  await new Promise((resolve) => {
    const socket = net.connect(Number(new URL(server.base).port), '127.0.0.1', () => {
      socket.write(`PUT /api/textbooks/uploads/${id}?offset=0 HTTP/1.1\r\nHost: x\r\nCookie: ${as.teacher.cookie}\r\nContent-Type: application/octet-stream\r\nContent-Length: 1000\r\n\r\nhalf`)
      setTimeout(() => { socket.destroy(); resolve() }, 200)
    })
  })
  await new Promise((resolve) => setTimeout(resolve, 200))
  assert.doesNotMatch(server.output(), /failed:/)
  assert.equal((await as.teacher.get(`/api/textbooks/uploads/${id}`)).body.received, 0)
  await as.teacher.delete(`/api/textbooks/uploads/${id}`)
})

test('deleting a book removes its audio from the disk too', async () => {
  const book = await addBook(as.teacher, 'Gone')
  const track = await addTrack(as.teacher, book)
  const { file: pdfFile } = await prisma.textbook.findUnique({ where: { id: book.id } })
  const { file: audioFile } = await prisma.textbookAudio.findUnique({ where: { id: track.id } })
  assert.equal((await as.teacher.delete(`/api/textbooks/${book.id}`)).status, 200)
  await new Promise((resolve) => setTimeout(resolve, 100))
  assert.ok(!existsSync(path.join(uploads, pdfFile)))
  assert.ok(!existsSync(path.join(uploads, audioFile)))
})

test('a book deleted while its audio was on the way takes nothing with it', async () => {
  const book = await addBook(as.teacher, 'Short-lived')
  const bytes = mp3(1000)
  const started = await as.teacher.post('/api/textbooks/uploads', { kind: 'audio', textbookId: book.id, title: 'Late', size: bytes.length })
  const { id } = started.body.upload
  await sendPiece(as.teacher, id, 0, bytes)
  await as.teacher.delete(`/api/textbooks/${book.id}`)
  assert.equal((await as.teacher.post(`/api/textbooks/uploads/${id}/finish`)).status, 404)
  assert.ok(!existsSync(path.join(incoming, `${id}.part`)))
})

test('an upload left for a day is swept when the server starts', async () => {
  const old = path.join(incoming, 'abandoned.part')
  writeFileSync(old, 'x')
  const fresh = path.join(incoming, 'fresh.part')
  writeFileSync(fresh, 'x')
  const dayAgo = new Date(Date.now() - 25 * 60 * 60_000)
  utimesSync(old, dayAgo, dayAgo)
  const second = await startServer({ UPLOAD_DIR: uploads })
  await second.stop()
  assert.ok(!existsSync(old))
  assert.ok(statSync(fresh).size === 1)
})
