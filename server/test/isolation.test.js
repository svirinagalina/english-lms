// What one teacher writes for their student stays between them: mistakes,
// homework documents, personal words, calls and timetable lessons are out of
// reach for a colleague, another student and another school.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { migrate, seed, startServer, signedIn, prisma } from './helpers.js'

let server, school, as, data

before(async () => {
  migrate()
  school = await seed()
  server = await startServer()
  as = {}
  for (const [key, person] of Object.entries(school.people)) as[key] = await signedIn(server.base, person)

  const { teacher, student, teacherB, studentB } = school.people
  data = {
    mistake: await prisma.lessonMistake.create({
      data: { said: 'He go home', correct: 'He goes home', classroomId: school.rooms.student.id, studentId: student.id, teacherId: teacher.id }
    }),
    mistakeB: await prisma.lessonMistake.create({
      data: { said: 'She have a cat', correct: 'She has a cat', classroomId: school.rooms.studentB.id, studentId: studentB.id, teacherId: teacherB.id }
    }),
    homework: await prisma.homeworkDoc.create({ data: { classroomId: school.rooms.student.id, title: 'Essay' } }),
    words: await prisma.vocabSet.create({ data: { title: 'From my board', schoolId: school.schoolA.id, ownerId: student.id } }),
    sharedSetB: await prisma.vocabSet.create({ data: { title: 'School B words', schoolId: school.schoolB.id } }),
    call: await prisma.call.create({ data: { token: 'call-of-school-a', hostId: teacher.id, schoolId: school.schoolA.id, classroomId: school.rooms.student.id } }),
    lesson: await prisma.userCalendarEvent.create({
      data: { title: 'Lesson', startTime: new Date(Date.now() + 86_400_000), endTime: new Date(Date.now() + 90_000_000), userId: teacher.id, studentIds: [student.id] }
    })
  }
})

after(async () => {
  await server?.stop()
  await prisma.$disconnect()
})

// --- Mistakes -----------------------------------------------------------------

test("a teacher reads their student's mistakes; a colleague and another school cannot", async () => {
  const room = school.rooms.student.id
  const own = await as.teacher.get(`/api/mistakes/classroom/${room}`)
  assert.equal(own.status, 200)
  assert.deepEqual(own.body.mistakes.map((m) => m.id), [data.mistake.id])
  assert.equal((await as.teacher2.get(`/api/mistakes/classroom/${room}`)).status, 404)
  assert.equal((await as.teacherB.get(`/api/mistakes/classroom/${room}`)).status, 404)
})

test("a student's notebook holds their own mistakes only", async () => {
  const own = await as.student.get(`/api/mistakes/classroom/${school.rooms.student.id}`)
  assert.equal(own.status, 200)
  assert.ok(own.body.mistakes.every((m) => m.id !== data.mistakeB.id))
  assert.equal((await as.student2.get(`/api/mistakes/classroom/${school.rooms.student.id}`)).status, 404)
})

test("nobody else edits or deletes a student's mistake", async () => {
  for (const who of ['teacher2', 'teacherB']) {
    assert.equal((await as[who].patch(`/api/mistakes/${data.mistake.id}`, { said: 'changed', correct: 'changed' })).status, 404)
    assert.equal((await as[who].delete(`/api/mistakes/${data.mistake.id}`)).status, 404)
  }
  assert.equal((await as.student.delete(`/api/mistakes/${data.mistake.id}`)).status, 403)
  const row = await prisma.lessonMistake.findUnique({ where: { id: data.mistake.id } })
  assert.equal(row.said, 'He go home')
})

test("a colleague cannot add a mistake to another teacher's student", async () => {
  const res = await as.teacher2.post(`/api/mistakes/classroom/${school.rooms.student.id}`, { said: 'x', correct: 'y' })
  assert.equal(res.status, 404)
  assert.equal(await prisma.lessonMistake.count({ where: { classroomId: school.rooms.student.id } }), 1)
})

// --- Homework documents -------------------------------------------------------

test('homework documents open for the teacher and the student of that cabinet only', async () => {
  const url = `/api/classrooms/${school.rooms.student.id}/homework-docs/${data.homework.id}`
  assert.equal((await as.teacher.get(url)).status, 200)
  assert.equal((await as.student.get(url)).status, 200)
  for (const who of ['teacher2', 'student2', 'teacherB', 'studentB']) assert.equal((await as[who].get(url)).status, 404, who)
})

test('a student cannot create, rename or delete homework', async () => {
  const base = `/api/classrooms/${school.rooms.student.id}/homework-docs`
  assert.equal((await as.student.post(base, { title: 'Mine' })).status, 403)
  assert.equal((await as.student.patch(`${base}/${data.homework.id}`, { title: 'Renamed' })).status, 403)
  assert.equal((await as.student.delete(`${base}/${data.homework.id}`)).status, 403)
  assert.equal((await prisma.homeworkDoc.findUnique({ where: { id: data.homework.id } })).title, 'Essay')
})

test("a colleague cannot set homework in another teacher's cabinet", async () => {
  const res = await as.teacher2.post(`/api/classrooms/${school.rooms.student.id}/homework-docs`, { title: 'Sneaky' })
  assert.equal(res.status, 404)
  assert.equal(await prisma.homeworkDoc.count({ where: { classroomId: school.rooms.student.id } }), 1)
})

// --- Vocabulary -----------------------------------------------------------------

test("a student's own words are theirs alone", async () => {
  assert.equal((await as.student.get(`/api/vocab/${data.words.id}`)).status, 200)
  for (const who of ['student2', 'teacher2', 'studentB']) assert.equal((await as[who].get(`/api/vocab/${data.words.id}`)).status, 404, who)
  assert.equal((await as.student2.post(`/api/vocab/${data.words.id}/cards`, { term: 'cat', translation: 'кот' })).status, 404)
  assert.equal(await prisma.vocabCard.count({ where: { setId: data.words.id } }), 0)
})

test("another school's shared word sets stay in that school", async () => {
  assert.equal((await as.teacher.get(`/api/vocab/${data.sharedSetB.id}`)).status, 404)
  const list = await as.owner.get('/api/vocab')
  assert.equal(list.status, 200)
  assert.ok(!JSON.stringify(list.body).includes(data.sharedSetB.id))
})

// --- Calls ----------------------------------------------------------------------

test("a call link works inside its school only", async () => {
  assert.equal((await as.student.get(`/api/calls/token/${data.call.token}`)).status, 200)
  assert.equal((await as.studentB.get(`/api/calls/token/${data.call.token}`)).status, 404)
  assert.equal((await as.teacherB.get(`/api/calls/token/${data.call.token}`)).status, 404)
})

test('a student cannot end a call; another school cannot end it either', async () => {
  assert.equal((await as.student.post(`/api/calls/${data.call.id}/end`)).status, 403)
  const other = await as.teacherB.post(`/api/calls/${data.call.id}/end`)
  assert.ok([403, 404].includes(other.status), `got ${other.status}`)
  assert.equal((await prisma.call.findUnique({ where: { id: data.call.id } })).endedAt, null)
})

// --- Timetable ------------------------------------------------------------------

test("a teacher cannot change or delete a colleague's timetable lesson", async () => {
  const body = { title: 'Moved', startTime: new Date().toISOString(), endTime: new Date().toISOString() }
  assert.equal((await as.teacher2.patch(`/api/personal/calendar/${data.lesson.id}`, body)).status, 404)
  assert.equal((await as.teacherB.delete(`/api/personal/calendar/${data.lesson.id}`)).status, 404)
  assert.equal((await prisma.userCalendarEvent.findUnique({ where: { id: data.lesson.id } })).title, 'Lesson')
})

test('a lesson is in the timetable of the students it names, and nobody else', async () => {
  const has = async (who) => JSON.stringify((await as[who].get('/api/personal/calendar')).body).includes(data.lesson.id)
  assert.equal(await has('teacher'), true)
  assert.equal(await has('student'), true)
  assert.equal(await has('student2'), false)
  assert.equal(await has('teacher2'), false)
})

test("a lesson naming another school's student does not reach that student", async () => {
  const sneaky = await as.teacher.post('/api/personal/calendar', {
    title: 'Cross-school', startTime: new Date(Date.now() + 86_400_000).toISOString(),
    endTime: new Date(Date.now() + 90_000_000).toISOString(), studentIds: [school.people.studentB.id]
  })
  assert.equal(sneaky.status, 201)
  const seen = JSON.stringify((await as.studentB.get('/api/personal/calendar')).body)
  assert.ok(!seen.includes(sneaky.body.event.id))
})
