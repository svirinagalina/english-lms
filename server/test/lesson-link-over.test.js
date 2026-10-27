// After the lesson the lesson link opens the cabinet instead of waiting for
// the teacher (Galina, 2026-10-27: Kristina's link kept saying the teacher
// would start the lesson, with no way to the report and the payment).
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { migrate, seed, startServer, client, prisma } from './helpers.js'

let server, school, anon
const MIN = 60000

before(async () => {
  migrate()
  school = await seed()
  server = await startServer()
  anon = client(server.base)
})

after(async () => {
  await server?.stop()
  await prisma.$disconnect()
})

let n = 0
const lesson = async (startsAt, extra = {}) => {
  n += 1
  const row = await prisma.adventLesson.create({
    data: {
      adventId: `over-${n}`, kind: 'trial', title: 'Trial', startsAt, durationMin: 40, status: 'scheduled',
      teacherId: school.people.teacher.id, studentUserId: school.people.student.id,
      classroomId: school.rooms.student.id, studentToken: `over-student-${n}`, teacherToken: `over-teacher-${n}`, ...extra
    }
  })
  return row.studentToken
}
const call = (extra = {}) => prisma.call.create({
  data: { token: `over-call-${++n}`, hostId: school.people.teacher.id, schoolId: school.schoolA.id, classroomId: school.rooms.student.id, kind: 'TRIAL', ...extra }
})
const info = async (token) => {
  const res = await anon.get(`/api/lesson-link/${token}`)
  assert.equal(res.status, 200, JSON.stringify(res.body))
  return res.body
}

test('a lesson still ahead keeps the waiting room', async () => {
  const token = await lesson(new Date(Date.now() + 60 * MIN))
  assert.equal((await info(token)).over, false)
})

test('the lesson\'s call has ended: the link leads to the cabinet', async () => {
  const ended = await call({ endedAt: new Date() })
  const token = await lesson(new Date(Date.now() - 50 * MIN), { callId: ended.id })
  const body = await info(token)
  assert.equal(body.callToken, null)
  assert.equal(body.over, true)
})

test('a call on right now is not over, even past the lesson\'s time', async () => {
  const live = await call()
  const token = await lesson(new Date(Date.now() - 3 * 60 * MIN), { callId: live.id })
  const body = await info(token)
  assert.equal(body.callToken, live.token)
  assert.equal(body.over, false)
  await prisma.call.update({ where: { id: live.id }, data: { endedAt: new Date() } })
})

test('long past with no call: over too', async () => {
  const token = await lesson(new Date(Date.now() - 2 * 60 * MIN))
  assert.equal((await info(token)).over, true)
})
