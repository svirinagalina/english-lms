// When a call counts as a held lesson (and uses one up from the package):
// only once the student is there, once per lesson however often someone's
// connection drops, a new lesson after a 15-minute gap, never for a trial.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { io } from 'socket.io-client'
import { migrate, seed, startServer, prisma, PASSWORD } from './helpers.js'

let server, school, cookies

before(async () => {
  migrate()
  school = await seed()
  server = await startServer()
  cookies = {}
  for (const who of ['teacher', 'student']) {
    const res = await fetch(`${server.base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: school.people[who].email, password: PASSWORD }) })
    cookies[who] = res.headers.get('set-cookie').split(';')[0]
  }
})

after(async () => {
  await server?.stop()
  await prisma.$disconnect()
})

let calls = 0
const newCall = (kind = 'LESSON') => prisma.call.create({
  data: { token: `count-${++calls}`, kind, hostId: school.people.teacher.id, schoolId: school.schoolA.id, classroomId: school.rooms.student.id }
})

// One browser on the call page: connects and joins, like Call.jsx does.
async function join(who, call) {
  const socket = io(server.base, { transports: ['websocket'], extraHeaders: { cookie: cookies[who] }, reconnection: false })
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject) })
  const answer = await new Promise((resolve) => socket.emit('join-call', call.token, resolve))
  assert.ok(!answer?.error, JSON.stringify(answer))
  return socket
}
async function leave(socket) {
  socket.close()
  await new Promise((resolve) => setTimeout(resolve, 400))
}
const lessons = () => prisma.session.findMany({ where: { classroomId: school.rooms.student.id }, orderBy: { startedAt: 'asc' } })
const counted = async () => (await lessons()).filter((s) => s.counted).length

test('a teacher waiting alone on the call is not a lesson', async () => {
  const teacher = await join('teacher', await newCall())
  await new Promise((resolve) => setTimeout(resolve, 300))
  assert.equal((await lessons()).length, 0)
  await leave(teacher)
})

test('the student comes: one lesson, however often their connection drops', async () => {
  await prisma.session.deleteMany({ where: { classroomId: school.rooms.student.id } })
  const call = await newCall()
  const teacher = await join('teacher', call)
  let student = await join('student', call)
  for (let drop = 0; drop < 3; drop++) {
    await leave(student)
    student = await join('student', call)
  }
  const [only, ...rest] = await lessons()
  assert.equal(rest.length, 0, 'a dropped connection started a second lesson')
  assert.equal(only.counted, true)
  assert.equal(only.endedAt, null)

  // Both gone: the lesson is over.
  await leave(student)
  await leave(teacher)
  assert.notEqual((await lessons())[0].endedAt, null)
})

test('everyone back within 15 minutes: the same lesson goes on', async () => {
  const call = await prisma.call.findFirst({ where: { token: `count-${calls}` } })
  const teacher = await join('teacher', call)
  const student = await join('student', call)
  const all = await lessons()
  assert.equal(all.length, 1, 'a reconnect after a short break was counted as a new lesson')
  assert.equal(all[0].endedAt, null)
  await leave(student)
  await leave(teacher)
})

test('back after more than 15 minutes: a new lesson', async () => {
  const [first] = await lessons()
  await prisma.session.update({ where: { id: first.id }, data: { endedAt: new Date(Date.now() - 20 * 60_000) } })
  const call = await prisma.call.findFirst({ where: { token: `count-${calls}` } })
  const teacher = await join('teacher', call)
  const student = await join('student', call)
  assert.equal(await counted(), 2)
  await leave(student)
  await leave(teacher)
})

test('a trial is held but never counted, and never merges into a paid lesson', async () => {
  await prisma.session.deleteMany({ where: { classroomId: school.rooms.student.id } })
  const trial = await newCall('TRIAL')
  let teacher = await join('teacher', trial)
  let student = await join('student', trial)
  await leave(student)
  await leave(teacher)
  assert.deepEqual((await lessons()).map((s) => s.counted), [false])

  // A paid lesson right after the trial is a lesson of its own.
  const lesson = await newCall()
  teacher = await join('teacher', lesson)
  student = await join('student', lesson)
  assert.deepEqual((await lessons()).map((s) => s.counted), [false, true])
  await leave(student)
  await leave(teacher)
})
