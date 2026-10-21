// Students added without an invitation, only to count lessons held elsewhere:
// the teacher marks lessons by hand and they use up the package like calls.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { migrate, seed, startServer, signedIn, prisma } from './helpers.js'

let server, school, as

const HOUR = 3_600_000

before(async () => {
  migrate()
  school = await seed()
  server = await startServer()
  as = {}
  for (const key of ['owner', 'teacher', 'teacher2', 'student', 'teacherB']) as[key] = await signedIn(server.base, school.people[key])
})

after(async () => {
  await server?.stop()
  await prisma.$disconnect()
})

const addOffline = async (who, body) => {
  const res = await as[who].post('/api/users/offline-students', body)
  assert.equal(res.status, 201, JSON.stringify(res.body))
  return res.body
}

test('a teacher adds a student without an invitation, linked to them, with a cabinet', async () => {
  const { student, classroomId } = await addOffline('teacher', { name: 'Zoom Student' })
  const user = await prisma.user.findUnique({ where: { id: student.id } })
  assert.equal(user.offline, true)
  assert.match(user.email, /@offline\.invalid$/)
  assert.ok(await prisma.teacherStudent.findFirst({ where: { teacherId: school.people.teacher.id, studentId: student.id } }))
  const room = (await as.teacher.get(`/api/classrooms/${classroomId}`)).body.classroom
  assert.equal(room.student.offline, true)
  // Another teacher of the school, and another school, cannot open it.
  assert.equal((await as.teacher2.get(`/api/classrooms/${classroomId}`)).status, 404)
  assert.equal((await as.teacherB.get(`/api/classrooms/${classroomId}`)).status, 404)
})

test('a teacher cannot add a student for another teacher; the owner can', async () => {
  assert.equal((await as.teacher.post('/api/users/offline-students', { name: 'Someone', teacherId: school.people.teacher2.id })).status, 403)
  const { student } = await addOffline('owner', { name: 'For Teacher Two', teacherId: school.people.teacher2.id })
  assert.ok(await prisma.teacherStudent.findFirst({ where: { teacherId: school.people.teacher2.id, studentId: student.id } }))
  assert.equal((await as.student.post('/api/users/offline-students', { name: 'Nope' })).status, 403)
})

test('lessons marked by hand use up the package', async () => {
  const { student, classroomId } = await addOffline('teacher', { name: 'Package Student' })
  await prisma.user.update({ where: { id: student.id }, data: { lessonsPaid: 4, packageStartedAt: new Date(Date.now() - 10 * 24 * HOUR) } })
  for (const daysAgo of [3, 1]) {
    const res = await as.teacher.post(`/api/classrooms/${classroomId}/sessions`, { startedAt: new Date(Date.now() - daysAgo * 24 * HOUR).toISOString(), minutes: 60, note: 'Zoom' })
    assert.equal(res.status, 201)
  }
  const room = (await as.teacher.get(`/api/classrooms/${classroomId}`)).body.classroom
  assert.equal(room.progress.held, 2)
  assert.equal(room.progress.remaining, 2)
  assert.equal(room.sessions[0].manual, true)
  assert.equal(room.sessions[0].minutes, 60)
  assert.equal(room.sessions[0].note, 'Zoom')
  const pkg = (await as.teacher.get(`/api/billing/students/${student.id}`)).body.student.package
  assert.equal(pkg.held, 2)
  // Removing a wrongly marked lesson gives it back.
  await as.teacher.delete(`/api/classrooms/${classroomId}/sessions/${room.sessions[0].id}`)
  assert.equal((await as.teacher.get(`/api/classrooms/${classroomId}`)).body.classroom.progress.held, 1)
})

test('a lesson cannot be marked ahead of time, or in someone else\'s cabinet', async () => {
  const { classroomId } = await addOffline('teacher', { name: 'Future Student' })
  const tomorrow = new Date(Date.now() + 24 * HOUR).toISOString()
  assert.equal((await as.teacher.post(`/api/classrooms/${classroomId}/sessions`, { startedAt: tomorrow, minutes: 60 })).status, 400)
  const now = new Date().toISOString()
  assert.equal((await as.teacher2.post(`/api/classrooms/${classroomId}/sessions`, { startedAt: now, minutes: 60 })).status, 404)
  assert.equal((await as.student.post(`/api/classrooms/${school.rooms.student.id}/sessions`, { startedAt: now, minutes: 60 })).status, 403)
})

test('inviting the student later turns the same account into a real one', async () => {
  const { student } = await addOffline('teacher', { name: 'Later Invited' })
  const res = await as.teacher.post('/api/invites', { name: 'Later Invited', email: 'later.invited@test.com', role: 'STUDENT', userId: student.id })
  assert.equal(res.status, 201, JSON.stringify(res.body))
  const invite = await prisma.invite.findFirst({ where: { email: 'later.invited@test.com' } })
  assert.equal(invite.userId, student.id)
})
