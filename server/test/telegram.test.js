// Connecting the school's Telegram bot from Telegram itself: email → code by
// mail → connected. Runs the real server against a fake Telegram API.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { migrate, seed, startServer, prisma, client, signedIn } from './helpers.js'

let server, school, fake

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
    // Sends a text from a chat and waits for the bot's answer.
    async say(chatId, text) {
      const before = sent.filter((m) => String(m.chat_id) === String(chatId)).length
      queue.push({ update_id: nextId++, message: { message_id: nextId, chat: { id: chatId, type: 'private' }, from: { id: chatId, username: `user${chatId}` }, text } })
      const deadline = Date.now() + 5000
      while (Date.now() < deadline) {
        const mine = sent.filter((m) => String(m.chat_id) === String(chatId))
        if (mine.length > before) return mine[mine.length - 1].text
        await new Promise((r) => setTimeout(r, 30))
      }
      throw new Error(`No answer to "${text}"`)
    },
    // The last full message (text + buttons) the bot sent to this chat.
    last(chatId) {
      const mine = sent.filter((m) => String(m.chat_id) === String(chatId))
      return mine[mine.length - 1]
    }
  }
}

const codeFor = (email) => {
  const all = [...server.output().matchAll(new RegExp(`\\[telegram\\] code for ${email.replace('.', '\\.')}: (\\d{6})`, 'g'))]
  return all.length ? all[all.length - 1][1] : null
}

before(async () => {
  migrate()
  school = await seed()
  fake = fakeTelegram()
  server = await startServer({ TELEGRAM_BOT_TOKEN: 'test-token', TELEGRAM_API_URL: fake.url() })
})

after(async () => {
  await server?.stop()
  fake?.close()
  await prisma.$disconnect()
})

test('Start without a link explains how to connect by email', async () => {
  const answer = await fake.say(1001, '/start')
  assert.match(answer, /напишите почту/)
})

test('email → code → connected', async () => {
  const answer = await fake.say(1002, 'Student@Test.com')
  assert.match(answer, /пришло письмо с кодом/)
  const code = codeFor('student@test.com')
  assert.ok(code, 'a code was made')

  assert.match(await fake.say(1002, code), /Готово, student/)
  const user = await prisma.user.findUnique({ where: { id: school.people.student.id } })
  assert.equal(user.telegramChatId, '1002')
  assert.equal(user.telegramName, '@user1002')
  // Once used, the code is gone.
  assert.doesNotMatch(await fake.say(1002, code), /Готово/)
})

test('an unknown email gets the same answer and no code', async () => {
  const answer = await fake.say(1003, 'nobody@test.com')
  assert.match(answer, /Если <b>nobody@test.com<\/b> есть на платформе/)
  assert.equal(codeFor('nobody@test.com'), null)
})

test("a wrong code connects nothing; five wrong ones end the attempt", async () => {
  await fake.say(1004, 'teacher@test.com')
  const code = codeFor('teacher@test.com')
  const wrong = code === '000000' ? '111111' : '000000'
  assert.match(await fake.say(1004, wrong), /не подошёл/)
  for (let i = 0; i < 3; i++) await fake.say(1004, wrong)
  assert.match(await fake.say(1004, wrong), /несколько раз/)
  // The right code no longer works either: a new one is needed.
  assert.doesNotMatch(await fake.say(1004, code), /Готово/)
  const teacher = await prisma.user.findUnique({ where: { id: school.people.teacher.id } })
  assert.equal(teacher.telegramChatId, null)
})

test('a code only works in the chat it was asked from', async () => {
  await fake.say(1005, 'teacher2@test.com')
  const code = codeFor('teacher2@test.com')
  assert.doesNotMatch(await fake.say(1006, code), /Готово/)
  assert.match(await fake.say(1005, code), /Готово, teacher2/)
})

test('at most 3 codes an hour for one address', async () => {
  for (let i = 0; i < 3; i++) await fake.say(1007 + i, 'student2@test.com')
  assert.match(await fake.say(1010, 'student2@test.com'), /Слишком много попыток/)
})

// --- Signing in from the bot ----------------------------------------------------

const loginTokenOf = (message) => message.reply_markup.inline_keyboard[0][0].url.split('/tg-login/')[1]

test('/login signs a connected student in with a one-time link', async () => {
  // student@test.com connected chat 1002 by email code above.
  await fake.say(1002, '/login')
  const message = fake.last(1002)
  assert.equal(message.reply_markup.inline_keyboard[0][0].text, 'Войти на платформу')
  const token = loginTokenOf(message)
  const browser = client(server.base)
  assert.equal((await browser.post(`/api/auth/telegram-login/${token}`)).status, 200)
  assert.equal((await browser.get('/api/auth/me')).body.user.id, school.people.student.id)
  assert.equal((await client(server.base).post(`/api/auth/telegram-login/${token}`)).status, 410, 'once only')
})

test('two children on one Telegram: a button for each', async () => {
  await prisma.user.updateMany({ where: { id: { in: [school.people.student.id, school.people.student2.id] } }, data: { telegramChatId: '2101' } })
  await fake.say(2101, '/login')
  const buttons = fake.last(2101).reply_markup.inline_keyboard.map((row) => row[0].text)
  assert.deepEqual(buttons.sort(), ['Войти как student', 'Войти как student2'])
})

test('/login on a Telegram with no student explains what to do', async () => {
  assert.match(await fake.say(2201, '/login'), /не привязан ни один ученик/)
})

test('staff cannot sign in through the bot', async () => {
  await prisma.user.update({ where: { id: school.people.owner.id }, data: { telegramChatId: '2301' } })
  assert.match(await fake.say(2301, '/login'), /не привязан ни один ученик/)
})

test('a forged login link signs nobody in', async () => {
  assert.equal((await client(server.base).post('/api/auth/telegram-login/forged-token')).status, 410)
})

// --- A parent sees the children's lessons ------------------------------------

test('a parent connects two children by their links and sees both in «Мои уроки»', async () => {
  const { student, student2, teacher } = school.people
  const owner = await signedIn(server.base, school.people.owner)
  const linkFor = async (who) => (await owner.get(`/api/billing/students/${who.id}/telegram-link`)).body.link

  const first = await linkFor(student)
  assert.match(first, /^https:\/\/t\.me\/test_school_bot\?start=u_/)
  // A teacher gets the link only for their own students.
  const asTeacher = await signedIn(server.base, teacher)
  assert.equal((await asTeacher.get(`/api/billing/students/${student.id}/telegram-link`)).status, 200)
  assert.equal((await asTeacher.get(`/api/billing/students/${student2.id}/telegram-link`)).status, 404)

  assert.match(await fake.say(2401, `/start ${first.split('start=')[1]}`), /Готово, student!/)
  await fake.say(2401, `/start ${(await linkFor(student2)).split('start=')[1]}`)

  await prisma.user.update({ where: { id: student.id }, data: { lessonsPaid: 8, heldAdjust: 3, packageStartedAt: null } })
  await prisma.user.update({ where: { id: student2.id }, data: { lessonsPaid: 4, heldAdjust: 5, packageStartedAt: null } })
  const answer = await fake.say(2401, '/lessons')
  assert.match(answer, /<b>student<\/b>: проведено 3 из 8 — осталось <b>5<\/b>/)
  assert.match(answer, /<b>student2<\/b>: проведено 5 из 4 — долг 1 урок/)
  assert.match(await fake.say(2401, 'Мои уроки'), /Уроки/)
})

test('«Мои уроки» on a Telegram with no student', async () => {
  assert.match(await fake.say(2501, '/lessons'), /не привязан ни один ученик/)
})
