// People → «Пробные уроки с сайта» → «Сделать студентом» (Galina, 2026-10-27):
// the trial limit goes for good, and an invitation lands on the same account
// with the trial's teacher, not the owner who sent it.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { migrate, seed, startServer, signedIn, client, prisma, PASSWORD } from './helpers.js'

let server, school, owner, teacher, trialStudent, token

before(async () => {
  migrate()
  school = await seed()
  server = await startServer()
  owner = await signedIn(server.base, school.people.owner)
  teacher = await signedIn(server.base, school.people.teacher)
  trialStudent = await prisma.user.create({
    data: {
      email: 'advent-full@trial.invalid', name: 'Kristina', role: 'STUDENT', schoolId: school.schoolA.id, viaLink: true,
      trialAccessUntil: new Date(Date.now() - 86400000), passwordHash: 'x'
    }
  })
  await prisma.teacherStudent.create({ data: { teacherId: school.people.teacher.id, studentId: trialStudent.id } })
  token = 'full-student-token'
  await prisma.adventLesson.create({
    data: {
      adventId: 'full-1', kind: 'trial', title: 'Trial', startsAt: new Date(Date.now() - 2 * 86400000), durationMin: 40, status: 'scheduled',
      teacherId: school.people.teacher.id, studentUserId: trialStudent.id, studentToken: token, teacherToken: 'full-teacher-token', studentEmail: 'kristina@example.com'
    }
  })
})

after(async () => {
  await server?.stop()
  await prisma.$disconnect()
})

test('the funnel offers the booking\'s email', async () => {
  const res = await owner.get('/api/activity/trial-funnel')
  const row = res.body.trials.find((t) => t.student.id === trialStudent.id)
  assert.equal(row.email, 'kristina@example.com')
})

test('only the owner makes a full student', async () => {
  const res = await teacher.post(`/api/users/${trialStudent.id}/full-student`)
  assert.equal(res.status, 403)
})

test('a full student keeps access: the lesson link does not bring the limit back', async () => {
  const res = await owner.post(`/api/users/${trialStudent.id}/full-student`)
  assert.equal(res.status, 200, JSON.stringify(res.body))
  let u = await prisma.user.findUnique({ where: { id: trialStudent.id } })
  assert.equal(u.trialAccessUntil, null)
  assert.ok(u.fullStudentAt)

  const enter = await client(server.base).post(`/api/lesson-link/${token}/enter`, { name: 'Kristina' })
  assert.equal(enter.status, 200, JSON.stringify(enter.body))
  u = await prisma.user.findUnique({ where: { id: trialStudent.id } })
  assert.equal(u.trialAccessUntil, null)

  const funnel = await owner.get('/api/activity/trial-funnel')
  assert.ok(!funnel.body.trials.some((t) => t.student.id === trialStudent.id), 'moved on to Students')
})

test('the invitation goes to the same account, under the trial\'s teacher', async () => {
  const res = await owner.post('/api/invites', { name: 'Kristina', email: 'kristina@example.com', role: 'STUDENT', userId: trialStudent.id, teacherId: school.people.teacher.id })
  assert.equal(res.status, 201, JSON.stringify(res.body))
  const invite = await prisma.invite.findFirst({ where: { userId: trialStudent.id } })
  assert.equal(invite.invitedById, school.people.teacher.id)
  const accept = await client(server.base).post(`/api/invites/token/${invite.token}/accept`, { password: PASSWORD })
  assert.equal(accept.status, 201, JSON.stringify(accept.body))
  const u = await prisma.user.findUnique({ where: { id: trialStudent.id } })
  assert.equal(u.viaLink, false)
  assert.equal(u.email, 'kristina@example.com')
  const links = await prisma.teacherStudent.findMany({ where: { studentId: trialStudent.id } })
  assert.deepEqual(links.map((l) => l.teacherId), [school.people.teacher.id])
})
