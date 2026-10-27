// After a lesson the student's chat — a parent's, with every child on it —
// gets one report: when, with whom, topics, words, the package. Runs the
// bot's sweep in this process against a fake Telegram API.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { migrate, seed, prisma, DATABASE_URL } from './helpers.js'

let school, fake, runBotOnce
const sent = []
const PARENT = 7101
const MIN = 60_000

before(async () => {
  fake = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      if (req.url.endsWith('/sendMessage')) sent.push(JSON.parse(body))
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ ok: true, result: { message_id: sent.length, username: 'test_bot' } }))
    })
  }).listen(0)
  migrate()
  school = await seed()
  // A parent with two children on one chat, connected three hours ago.
  for (const who of ['student', 'student2']) await prisma.user.update({ where: { id: school.people[who].id }, data: { telegramChatId: String(PARENT), telegramLinkedAt: new Date(Date.now() - 180 * MIN), lessonsPaid: 8 } })
  process.env.DATABASE_URL = DATABASE_URL
  process.env.TELEGRAM_BOT_TOKEN = '123:test'
  process.env.TELEGRAM_API_URL = `http://127.0.0.1:${fake.address().port}`
  ;({ runBotOnce } = await import('../src/bot.js'))
  await runBotOnce()
  sent.length = 0
})

after(async () => {
  fake?.close()
  await prisma.$disconnect()
  const { prisma: appPrisma } = await import('../src/db.js')
  await appPrisma.$disconnect()
})

const reports = () => sent.filter((m) => /Урок проведён/.test(m.text))

test('a lesson over for 16 minutes is reported to the parent once, with the summary', async () => {
  const start = new Date(Date.now() - 80 * MIN)
  const session = await prisma.session.create({ data: { classroomId: school.rooms.student.id, startedAt: start, endedAt: new Date(start.getTime() + 55 * MIN) } })
  await prisma.lessonSummary.create({ data: { sessionId: session.id, classroomId: school.rooms.student.id, studentId: school.people.student.id, topics: ['Present Perfect'], words: [{ word: 'launch' }, { word: 'reliable' }], mistakeIds: ['m1', 'm2'], questions: ['Q?'] } })
  await runBotOnce()
  assert.equal(reports().length, 1)
  const [msg] = reports()
  assert.equal(String(msg.chat_id), String(PARENT))
  assert.match(msg.text, /Урок проведён: <b>student<\/b>/)
  assert.match(msg.text, /55 минут · преподаватель teacher/)
  assert.match(msg.text, /Темы: Present Perfect/)
  assert.match(msg.text, /Новые слова: launch, reliable/)
  assert.match(msg.text, /Разобрано ошибок: 2/)
  assert.match(msg.text, /Пакет: проведено 1 из 8 — осталось 7/)
  await runBotOnce()
  assert.equal(reports().length, 1)
})

test('a lesson that may still resume, and one not counted, are not reported', async () => {
  sent.length = 0
  await prisma.session.create({ data: { classroomId: school.rooms.student2.id, startedAt: new Date(Date.now() - 60 * MIN), endedAt: new Date(Date.now() - 5 * MIN) } })
  await prisma.session.create({ data: { classroomId: school.rooms.student2.id, counted: false, startedAt: new Date(Date.now() - 200 * MIN), endedAt: new Date(Date.now() - 150 * MIN) } })
  await runBotOnce()
  assert.equal(reports().length, 0)
})

test('a lesson from before the chat was connected is not reported', async () => {
  sent.length = 0
  await prisma.session.create({ data: { classroomId: school.rooms.student2.id, startedAt: new Date(Date.now() - 300 * MIN), endedAt: new Date(Date.now() - 240 * MIN) } })
  await runBotOnce()
  assert.equal(reports().length, 0)
})

test('the second child gets their own report on the same chat', async () => {
  sent.length = 0
  await prisma.session.create({ data: { classroomId: school.rooms.student2.id, manual: true, startedAt: new Date(Date.now() - 120 * MIN), endedAt: new Date(Date.now() - 60 * MIN), note: 'Отмечен в Telegram' } })
  await runBotOnce()
  assert.equal(reports().length, 1)
  assert.match(reports()[0].text, /student2/)
  assert.doesNotMatch(reports()[0].text, /минут ·/)
})
