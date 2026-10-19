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

// --- Students without email: invited and signed in through the bot -----------

const loginTokenOf = (message) => {
  const url = message.reply_markup.inline_keyboard[0][0].url
  return url.split('/tg-login/')[1]
}

test('a Telegram invitation makes the account in the bot and signs in by a one-time link', async () => {
  const teacher = await signedIn(server.base, school.people.teacher)
  const created = await teacher.post('/api/invites', { name: 'Маша', role: 'STUDENT', telegram: true })
  assert.equal(created.status, 201)
  assert.match(created.body.invite.link, /^https:\/\/t\.me\/test_school_bot\?start=i_/)
  const token = created.body.invite.link.split('start=i_')[1]

  // The web join page sends people to Telegram instead.
  assert.equal((await client(server.base).get(`/api/invites/token/${token}`)).status, 409)

  assert.match(await fake.say(2001, `/start i_${token}`), /Аккаунт «Маша» создан/)
  const masha = await prisma.user.findFirst({ where: { name: 'Маша' } })
  assert.equal(masha.role, 'STUDENT')
  assert.equal(masha.telegramChatId, '2001')
  assert.match(masha.email, /@telegram\.invalid$/)
  assert.ok(await prisma.teacherStudent.findFirst({ where: { teacherId: school.people.teacher.id, studentId: masha.id } }), 'linked to the teacher')

  const message = fake.last(2001)
  assert.equal(message.reply_markup.inline_keyboard[0][0].text, 'Войти на платформу')
  const loginToken = loginTokenOf(message)

  const browser = client(server.base)
  const login = await browser.post(`/api/auth/telegram-login/${loginToken}`)
  assert.equal(login.status, 200)
  assert.equal(login.body.user.name, 'Маша')
  assert.equal((await browser.get('/api/auth/me')).body.user.id, masha.id)
  // Once only.
  assert.equal((await client(server.base).post(`/api/auth/telegram-login/${loginToken}`)).status, 410)

  // Opening the invitation again does not make a second account.
  assert.match(await fake.say(2001, `/start i_${token}`), /уже создан/)
  assert.equal(await prisma.user.count({ where: { name: 'Маша' } }), 1)
  // …and from someone else's Telegram it is refused.
  assert.match(await fake.say(2002, `/start i_${token}`), /уже использовано/)
})

test('two children on one Telegram: /login gives a button for each', async () => {
  const teacher = await signedIn(server.base, school.people.teacher)
  for (const name of ['Петя', 'Ваня']) {
    const { body } = await teacher.post('/api/invites', { name, role: 'STUDENT', telegram: true })
    await fake.say(2101, `/start ${body.invite.link.split('start=')[1]}`)
  }
  await fake.say(2101, '/login')
  const buttons = fake.last(2101).reply_markup.inline_keyboard.map((row) => row[0].text)
  assert.deepEqual(buttons, ['Войти как Петя', 'Войти как Ваня'])
})

test('/login on a Telegram with no student explains what to do', async () => {
  assert.match(await fake.say(2201, '/login'), /не привязан ни один ученик/)
})

test('a forged or used login link signs nobody in', async () => {
  assert.equal((await client(server.base).post('/api/auth/telegram-login/forged-token')).status, 410)
})

test('only new students can be invited through Telegram', async () => {
  const owner = await signedIn(server.base, school.people.owner)
  assert.equal((await owner.post('/api/invites', { name: 'Новый учитель', role: 'TEACHER', telegram: true })).status, 400)
  assert.equal((await owner.post('/api/invites', { name: 'Без почты', role: 'STUDENT' })).status, 400)
})
