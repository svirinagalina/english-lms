// Errors told to the owner in Telegram: a page that crashed on someone's
// device, a request the server failed, a promise it dropped — and not the
// noise (wallet extensions, a dropped connection), and not twice in a row.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { migrate, seed, startServer, prisma, signedIn, DATABASE_URL } from './helpers.js'

let server, school, fake, alerts

// A fake Telegram: hands the server queued updates, records what it sends.
function fakeTelegram() {
  const queue = []
  const sent = []
  let nextId = 1
  const srv = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      const method = req.url.split('/').pop()
      const data = body ? JSON.parse(body) : {}
      const ok = (result) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ ok: true, result })) }
      if (method === 'getMe') return ok({ username: 'test_school_bot' })
      if (method === 'sendMessage') { sent.push(data); return ok({ message_id: sent.length }) }
      // An edited step counts as the bot's answer too.
      if (method === 'editMessageText') { sent.push({ ...data, edited: true }); return ok(true) }
      if (method === 'getUpdates') {
        const give = () => ok(queue.splice(0).filter((u) => u.update_id >= (data.offset ?? 0)))
        return queue.length ? give() : setTimeout(give, 100)
      }
      ok(true)
    })
  }).listen(0)
  return {
    url: () => `http://127.0.0.1:${srv.address().port}`,
    sent,
    close: () => srv.close(),
  }
}

const OWNER_CHAT = 5550001

before(async () => {
  migrate()
  school = await seed()
  await prisma.user.update({ where: { id: school.people.owner.id }, data: { telegramChatId: String(OWNER_CHAT) } })
  fake = fakeTelegram()
  server = await startServer({ TELEGRAM_BOT_TOKEN: 'test-token', TELEGRAM_API_URL: fake.url() })
  // The same module in this process, for the server-side sources.
  Object.assign(process.env, { DATABASE_URL, TELEGRAM_BOT_TOKEN: 'test-token', TELEGRAM_API_URL: fake.url() })
  alerts = await import('../src/alerts.js')
})

after(async () => {
  await server?.stop()
  fake?.close()
  await prisma.$disconnect()
  const { prisma: appPrisma } = await import('../src/db.js')
  await appPrisma.$disconnect()
})

const toOwner = () => fake.sent.filter((m) => String(m.chat_id) === String(OWNER_CHAT))
const settle = () => new Promise((resolve) => setTimeout(resolve, 600))
const report = async (who, body) => {
  const res = await (await signedIn(server.base, school.people[who])).post('/api/diag', { device: 'Mozilla/5.0 (iPhone) · 390x844', ...body })
  assert.equal(res.status, 200)
}

test("a page that crashed on a student's phone is told to the owner", async () => {
  await report('student', { kind: 'page.crash', message: "Cannot read properties of undefined (reading 'boards')", details: { path: '/classroom/x' } })
  await settle()
  const [message] = toOwner()
  assert.ok(message, 'nothing reached the owner')
  assert.match(message.text, /не открылась страница/)
  assert.match(message.text, /student \(STUDENT\)/)
  assert.match(message.text, /\/classroom\/x/)
  assert.match(message.text, /reading 'boards'/)
})

test('the same error again is not told again', async () => {
  const before = toOwner().length
  await report('student2', { kind: 'page.crash', message: "Cannot read properties of undefined (reading 'boards')", details: { path: '/classroom/y' } })
  await settle()
  assert.equal(toOwner().length, before)
})

test('noise is kept in the log only: wallet extensions, a dropped connection, other kinds', async () => {
  const before = toOwner().length
  await report('teacher', { kind: 'page.rejection', message: 'Failed to connect to MetaMask', details: { path: '/' } })
  await report('teacher', { kind: 'page.error', message: 'TypeError: Failed to fetch', details: { path: '/call/x' } })
  await report('teacher', { kind: 'page.error', message: 'boom', details: { path: '/', stack: 'at chrome-extension://abc/inpage.js:1' } })
  await report('teacher', { kind: 'blur.perf', message: 'slow', details: { fps: 3 } })
  await settle()
  assert.equal(toOwner().length, before)
})

test("another school's errors go to that school, not to this owner", async () => {
  const before = toOwner().length
  await report('studentB', { kind: 'page.crash', message: 'Only in school B', details: { path: '/' } })
  await settle()
  assert.equal(toOwner().length, before)
})

test('a request the server failed, and a dropped promise, are told too', async () => {
  const before = toOwner().length
  await alerts.serverError({ method: 'POST', path: '/units/1/attempt', originalUrl: '/api/units/1/attempt?x=1', route: { path: '/:id/attempt' }, user: { role: 'STUDENT', schoolId: school.schoolA.id } }, new Error('database is down'))
  await alerts.droppedError(new Error('lost in a timer'))
  const told = toOwner().slice(before).map((m) => m.text)
  assert.equal(told.length, 2)
  assert.match(told[0], /Сервер не смог выполнить запрос[\s\S]*POST \/api\/units\/1\/attempt[\s\S]*database is down/)
  assert.doesNotMatch(told[0], /x=1/)
  assert.match(told[1], /lost in a timer/)
})

test('at most ten messages an hour', async () => {
  const before = toOwner().length
  for (let i = 0; i < 14; i++) await alerts.droppedError(new Error(`distinct error ${i}`))
  const told = toOwner().length - before
  assert.ok(told <= 10, `${told} messages in an hour`)
  assert.ok(told >= 7, `only ${told} messages`)
})
