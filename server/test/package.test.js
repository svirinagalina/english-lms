// Counting a student's package: which lessons use it up, what a new payment
// keeps, and that Payments and the cabinet show the same numbers.
import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { migrate, seed, startServer, signedIn, prisma, DATABASE_URL } from './helpers.js'

let server, school, as, creditLessons

const DAY = 86_400_000
const ago = (days) => new Date(Date.now() - days * DAY)

before(async () => {
  migrate()
  school = await seed()
  server = await startServer()
  as = {}
  for (const key of ['owner', 'teacher', 'teacher2', 'student']) as[key] = await signedIn(server.base, school.people[key])
  // src/db.js reads DATABASE_URL when it is first imported.
  process.env.DATABASE_URL = DATABASE_URL
  ;({ creditLessons } = await import('../src/purchases.js'))
})

after(async () => {
  await server?.stop()
  await prisma.$disconnect()
  const { prisma: appPrisma } = await import('../src/db.js')
  await appPrisma.$disconnect()
})

// Every test starts from a fresh package of 8 lessons that began 10 days ago.
beforeEach(async () => {
  const { student } = school.people
  await prisma.session.deleteMany({ where: { classroom: { studentId: student.id } } })
  await prisma.classroom.deleteMany({ where: { studentId: student.id, NOT: { id: school.rooms.student.id } } })
  await prisma.user.update({ where: { id: student.id }, data: { lessonsPaid: 8, packageStartedAt: ago(10), heldAdjust: 0 } })
})

const lesson = (classroomId, daysAgo, extra = {}) =>
  prisma.session.create({ data: { classroomId, startedAt: ago(daysAgo), endedAt: ago(daysAgo), ...extra } })

const studentPackage = async () => (await as.student.get('/api/billing/me')).body.billing.package
const teacherPackage = async () => (await as.teacher.get(`/api/billing/students/${school.people.student.id}`)).body.student.package

test('lessons held since the package started are counted; the rest is what is left', async () => {
  for (const day of [9, 6, 2]) await lesson(school.rooms.student.id, day)
  const pkg = await studentPackage()
  assert.equal(pkg.lessonsPaid, 8)
  assert.equal(pkg.held, 3)
  assert.equal(pkg.remaining, 5)
})

test('a lesson from before the package started does not use it up', async () => {
  await lesson(school.rooms.student.id, 30)
  await lesson(school.rooms.student.id, 3)
  assert.equal((await studentPackage()).held, 1)
})

test('a trial lesson is held but never uses up a paid lesson', async () => {
  await lesson(school.rooms.student.id, 4, { counted: false })
  await lesson(school.rooms.student.id, 2)
  assert.equal((await studentPackage()).held, 1)
})

test("lessons with a second teacher use up the same package", async () => {
  const { teacher2, student } = school.people
  const second = await prisma.classroom.create({ data: { teacherId: teacher2.id, studentId: student.id, schoolId: teacher2.schoolId } })
  await lesson(school.rooms.student.id, 5)
  await lesson(second.id, 1)
  assert.equal((await studentPackage()).held, 2)
})

test('Payments, the student and the cabinet show the same numbers', async () => {
  for (const day of [8, 4]) await lesson(school.rooms.student.id, day)
  const cabinet = (await as.teacher.get(`/api/classrooms/${school.rooms.student.id}`)).body
  const progress = cabinet.progress ?? cabinet.classroom?.progress
  const fromTeacher = await teacherPackage()
  const fromStudent = await studentPackage()
  assert.equal(fromTeacher.held, 2)
  assert.equal(fromStudent.held, 2)
  assert.equal(progress.held, 2)
  assert.equal(progress.remaining, fromStudent.remaining)
})

test('more lessons than paid show as a debt (a negative remainder)', async () => {
  await prisma.user.update({ where: { id: school.people.student.id }, data: { lessonsPaid: 2 } })
  for (const day of [7, 5, 3]) await lesson(school.rooms.student.id, day)
  const pkg = await studentPackage()
  assert.equal(pkg.held, 3)
  assert.equal(pkg.remaining, -1)
})

test("the owner's correction of the held count sticks and later lessons add to it", async () => {
  await lesson(school.rooms.student.id, 6)
  const res = await as.owner.patch(`/api/billing/students/${school.people.student.id}`, { held: 4 })
  assert.equal(res.status, 200)
  assert.equal((await studentPackage()).held, 4)
  await lesson(school.rooms.student.id, 0)
  assert.equal((await studentPackage()).held, 5)
})

test('starting a new package counts from zero again', async () => {
  for (const day of [6, 3]) await lesson(school.rooms.student.id, day)
  const res = await as.teacher.patch(`/api/billing/students/${school.people.student.id}`, { lessonsPaid: 4, resetCounter: true })
  assert.equal(res.status, 200)
  const pkg = await studentPackage()
  assert.equal(pkg.held, 0)
  assert.equal(pkg.remaining, 4)
})

test('a payment keeps the unused lessons and adds the new ones', async () => {
  for (const day of [9, 5, 1]) await lesson(school.rooms.student.id, day)
  const result = await creditLessons(school.people.student.id, 8)
  assert.equal(result.left, 5)
  assert.equal(result.total, 13)
  const pkg = await studentPackage()
  assert.equal(pkg.lessonsPaid, 13)
  assert.equal(pkg.held, 0)
  assert.equal(pkg.remaining, 13)
})

test('a payment after a debt does not carry the debt into the new package', async () => {
  await prisma.user.update({ where: { id: school.people.student.id }, data: { lessonsPaid: 1 } })
  for (const day of [5, 2]) await lesson(school.rooms.student.id, day)
  const result = await creditLessons(school.people.student.id, 8)
  assert.equal(result.left, 0)
  assert.equal((await studentPackage()).remaining, 8)
})
