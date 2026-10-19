// The real server against a throwaway database: signing in, roles, and that
// nobody reaches another teacher's or another school's students.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { migrate, seed, startServer, client, signedIn, prisma, PASSWORD } from './helpers.js'

let server, school, as

before(async () => {
  migrate()
  school = await seed()
  server = await startServer()
  as = {}
  for (const [key, person] of Object.entries(school.people)) as[key] = await signedIn(server.base, person)
})

after(async () => {
  await server?.stop()
  await prisma.$disconnect()
})

// --- Signing in ---------------------------------------------------------------

test('sign in with the right password, refused with a wrong one', async () => {
  const c = client(server.base)
  assert.equal((await c.login('teacher@test.com', 'wrong-password')).status, 401)
  assert.equal((await c.login('nobody@test.com')).status, 401)
  const ok = await c.login('teacher@test.com', PASSWORD)
  assert.equal(ok.status, 200)
  assert.equal(ok.body.user.role, 'TEACHER')
  assert.equal(ok.body.user.passwordHash, undefined, 'the password hash must never leave the server')
})

test('no cookie or a forged cookie is not signed in', async () => {
  const c = client(server.base)
  assert.equal((await c.get('/api/auth/me')).status, 401)
  c.setCookie('lms_token=not-a-real-token')
  assert.equal((await c.get('/api/auth/me')).status, 401)
})

test('after logout the session is gone', async () => {
  const c = await signedIn(server.base, school.people.student)
  assert.equal((await c.get('/api/auth/me')).status, 200)
  await c.post('/api/auth/logout')
  assert.equal((await c.get('/api/auth/me')).status, 401)
})

test('a role change takes effect on the next request, not at next sign-in', async () => {
  const { teacher2 } = school.people
  const c = await signedIn(server.base, teacher2)
  assert.equal((await c.get('/api/billing/students')).status, 200)

  assert.equal((await as.owner.patch(`/api/users/${teacher2.id}/role`, { role: 'STUDENT' })).status, 200)
  try {
    assert.equal((await c.get('/api/billing/students')).status, 403)
  } finally {
    await as.owner.patch(`/api/users/${teacher2.id}/role`, { role: 'TEACHER' })
  }
})

test('a deleted account cannot keep using its cookie', async () => {
  const temp = await prisma.user.create({
    data: { email: 'temp@test.com', name: 'temp', role: 'STUDENT', schoolId: school.schoolA.id, passwordHash: (await prisma.user.findUnique({ where: { id: school.people.student.id } })).passwordHash }
  })
  const c = await signedIn(server.base, temp)
  await prisma.user.delete({ where: { id: temp.id } })
  assert.equal((await c.get('/api/auth/me')).status, 401)
})

// --- Cabinets -----------------------------------------------------------------

test('a student opens their own cabinet only', async () => {
  const { rooms } = school
  assert.equal((await as.student.get(`/api/classrooms/${rooms.student.id}`)).status, 200)
  assert.equal((await as.student.get(`/api/classrooms/${rooms.student2.id}`)).status, 404)
})

test("a teacher opens their students' cabinets, not a colleague's", async () => {
  const { rooms } = school
  assert.equal((await as.teacher.get(`/api/classrooms/${rooms.student.id}`)).status, 200)
  assert.equal((await as.teacher.get(`/api/classrooms/${rooms.student2.id}`)).status, 404)
})

test('the owner opens every cabinet of the school', async () => {
  const { rooms } = school
  assert.equal((await as.owner.get(`/api/classrooms/${rooms.student.id}`)).status, 200)
  assert.equal((await as.owner.get(`/api/classrooms/${rooms.student2.id}`)).status, 200)
})

test('nobody crosses into another school', async () => {
  const { rooms } = school
  assert.equal((await as.owner.get(`/api/classrooms/${rooms.studentB.id}`)).status, 404)
  assert.equal((await as.teacherB.get(`/api/classrooms/${rooms.student.id}`)).status, 404)
})

test("the cabinet list holds only one's own cabinets", async () => {
  const ids = (res) => new Set((res.body.classrooms ?? res.body).map((c) => c.id))
  const forStudent = ids(await as.student.get('/api/classrooms'))
  assert.ok(forStudent.has(school.rooms.student.id))
  assert.ok(!forStudent.has(school.rooms.student2.id))
  assert.ok(!ids(await as.owner.get('/api/classrooms')).has(school.rooms.studentB.id))
})

// --- People -------------------------------------------------------------------

test('a teacher sees only their own students in People', async () => {
  const people = (await as.teacher.get('/api/users')).body.people.map((p) => p.id)
  assert.deepEqual(people, [school.people.student.id])
})

test("the owner's People list stays inside the school", async () => {
  const people = new Set((await as.owner.get('/api/users')).body.people.map((p) => p.id))
  assert.ok(people.has(school.people.student2.id))
  assert.ok(!people.has(school.people.studentB.id))
  assert.ok(!people.has(school.people.teacherB.id))
})

test('only the owner links students to teachers and changes roles', async () => {
  const { teacher, student2 } = school.people
  assert.equal((await as.teacher.post('/api/users/links', { teacherId: teacher.id, studentId: student2.id })).status, 403)
  assert.equal((await as.teacher.patch(`/api/users/${student2.id}/role`, { role: 'TEACHER' })).status, 403)
  assert.equal((await as.student.patch(`/api/users/${student2.id}/role`, { role: 'TEACHER' })).status, 403)
})

// --- Payments -----------------------------------------------------------------

test("a teacher sees their own student's payments, not others'", async () => {
  const { student, student2, studentB } = school.people
  assert.equal((await as.teacher.get(`/api/billing/students/${student.id}`)).status, 200)
  assert.equal((await as.teacher.get(`/api/billing/students/${student2.id}`)).status, 404)
  assert.equal((await as.teacher.get(`/api/billing/students/${studentB.id}`)).status, 404)
})

test('students cannot open or change the payments of anyone', async () => {
  const { student } = school.people
  assert.equal((await as.student.get('/api/billing/students')).status, 403)
  assert.equal((await as.student.patch(`/api/billing/students/${student.id}`, { lessonsPaid: 100 })).status, 403)
  const row = await prisma.user.findUnique({ where: { id: student.id }, select: { lessonsPaid: true } })
  assert.notEqual(row.lessonsPaid, 100)
})

test("a teacher sets a package for their student; a colleague's attempt changes nothing", async () => {
  const { student } = school.people
  assert.equal((await as.teacher.patch(`/api/billing/students/${student.id}`, { lessonsPaid: 8 })).status, 200)
  assert.equal((await prisma.user.findUnique({ where: { id: student.id } })).lessonsPaid, 8)

  assert.equal((await as.teacher2.patch(`/api/billing/students/${student.id}`, { lessonsPaid: 99 })).status, 404)
  assert.equal((await as.teacherB.patch(`/api/billing/students/${student.id}`, { lessonsPaid: 99 })).status, 404)
  assert.equal((await prisma.user.findUnique({ where: { id: student.id } })).lessonsPaid, 8)
})

test('a student sees their own package', async () => {
  const res = await as.student.get('/api/billing/me')
  assert.equal(res.status, 200)
})

// --- The partner ----------------------------------------------------------------

test('the partner is view-only', async () => {
  const res = await as.partner.patch(`/api/billing/students/${school.people.student.id}`, { lessonsPaid: 50 })
  assert.equal(res.status, 403)
  assert.equal(res.body.readOnly, true)
})

test("the partner does not see the school's own students (only the Advent site's)", async () => {
  assert.equal((await as.partner.get(`/api/classrooms/${school.rooms.student.id}`)).status, 404)
  assert.equal((await as.partner.get(`/api/billing/students/${school.people.student.id}`)).status, 404)
  const people = new Set((await as.partner.get('/api/users')).body.people.map((p) => p.id))
  assert.ok(!people.has(school.people.student.id))
})

// --- Recent payments ------------------------------------------------------------

test('recent payments: the owner sees the school, teachers and students cannot open it', async () => {
  const { student, studentB } = school.people
  // A package from another school must not show up.
  await prisma.paymentRecord.create({ data: { studentId: studentB.id, kind: 'package', lessons: 4 } })
  await prisma.paymentRecord.create({ data: { studentId: student.id, kind: 'reported', lessons: 8 } })

  const res = await as.owner.get('/api/billing/recent')
  assert.equal(res.status, 200)
  const mine = res.body.payments.filter((p) => p.studentId === student.id)
  assert.ok(mine.some((p) => p.kind === 'package' && p.lessons === 8 && p.who === 'student'), 'the package set by the teacher is listed')
  assert.ok(mine.some((p) => p.kind === 'reported'))
  assert.ok(!res.body.payments.some((p) => p.studentId === studentB.id))
  const dates = res.body.payments.map((p) => new Date(p.at).getTime())
  assert.deepEqual(dates, [...dates].sort((a, b) => b - a), 'newest first')

  assert.equal((await as.teacher.get('/api/billing/recent')).status, 403)
  assert.equal((await as.student.get('/api/billing/recent')).status, 403)
  // The partner sees only the site's students — none here.
  const partner = await as.partner.get('/api/billing/recent')
  assert.equal(partner.status, 200)
  assert.equal(partner.body.payments.length, 0)
})
