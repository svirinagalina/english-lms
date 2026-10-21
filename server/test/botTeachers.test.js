// The student's teachers hear in the bot that lessons were paid and that the
// package is used up — once, with the lesson count only. Runs the bot's sweep
// in this process against a fake Telegram API.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { migrate, seed, prisma, DATABASE_URL } from './helpers.js'

let school, fake, runBotOnce
const sent = []
const CHAT = { owner: 7001, teacher: 7002, teacher2: 7003 }
const to = (who) => sent.filter((m) => String(m.chat_id) === String(CHAT[who]))

before(async () => {
  fake = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      if (req.url.endsWith('/sendMessage')) sent.push(JSON.parse(body))
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ ok: true, result: { message_id: sent.length } }))
    })
  }).listen(0)
  migrate()
  school = await seed()
  for (const [who, chat] of Object.entries(CHAT)) await prisma.user.update({ where: { id: school.people[who].id }, data: { telegramChatId: String(chat) } })
  process.env.DATABASE_URL = DATABASE_URL
  process.env.TELEGRAM_BOT_TOKEN = '123:test'
  process.env.TELEGRAM_API_URL = `http://127.0.0.1:${fake.address().port}`
  ;({ runBotOnce } = await import('../src/bot.js'))
  // The first look only remembers what is there.
  await runBotOnce()
  sent.length = 0
})

after(async () => {
  fake?.close()
  await prisma.$disconnect()
  const { prisma: appPrisma } = await import('../src/db.js')
  await appPrisma.$disconnect()
})

test('a new package: the teacher hears «Оплата пришла», another teacher nothing', async () => {
  const { student } = school.people
  await prisma.user.update({ where: { id: student.id }, data: { lessonsPaid: 8, packageStartedAt: new Date(Date.now() - 60_000), heldAdjust: 0 } })
  await runBotOnce()
  const mine = to('teacher')
  assert.equal(mine.length, 1)
  assert.match(mine[0].text, /Оплата пришла: student — уроков в пакете: 8/)
  assert.doesNotMatch(mine[0].text, /₽|€|карт/i)
  assert.match(mine[0].reply_markup.inline_keyboard[0][0].url, new RegExp(`/classroom/${school.rooms.student.id}$`))
  assert.equal(to('owner').length, 1)
  assert.match(to('owner')[0].text, /Оплата засчитана/)
  assert.equal(to('teacher2').length, 0)
  // Nothing new: nothing sent again.
  await runBotOnce()
  assert.equal(to('teacher').length, 1)
})

test('the package used up: the teacher hears it once; an owner who teaches gets one message', async () => {
  const { student, owner } = school.people
  await prisma.teacherStudent.create({ data: { teacherId: owner.id, studentId: student.id } })
  sent.length = 0
  await prisma.user.update({ where: { id: student.id }, data: { lessonsPaid: 1, packageStartedAt: new Date(Date.now() - 60_000), heldAdjust: 0, telegramPaidSeen: null } })
  await runBotOnce() // remembers the package again
  sent.length = 0
  await prisma.session.create({ data: { classroomId: school.rooms.student.id, startedAt: new Date(Date.now() + 60_000), endedAt: new Date(Date.now() + 120_000) } })
  await runBotOnce()
  const mine = to('teacher').filter((m) => /Пакет закончился/.test(m.text))
  assert.equal(mine.length, 1)
  assert.match(mine[0].text, /student — проведено 1 из 1/)
  assert.equal(to('owner').filter((m) => /Пакет закончился/.test(m.text)).length, 1)
  await runBotOnce()
  assert.equal(to('teacher').filter((m) => /Пакет закончился/.test(m.text)).length, 1)
})
