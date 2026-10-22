// "Start lesson" for an unpaid trial student opens the board the teacher
// chose, so the teacher and the student end up on the same one.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { migrate, seed, startServer, signedIn, prisma } from './helpers.js'

let server, school, teacher, shelf

before(async () => {
  migrate()
  school = await seed()
  server = await startServer()
  teacher = await signedIn(server.base, school.people.teacher)
  shelf = await prisma.classroom.create({ data: { teacherId: school.people.teacher.id, schoolId: school.schoolA.id } })
  await prisma.adventLesson.create({
    data: {
      adventId: 'trial-board-1', kind: 'trial', title: 'Trial', startsAt: new Date(), durationMin: 40, status: 'scheduled',
      teacherId: school.people.teacher.id, studentUserId: school.people.student.id
    }
  })
})

after(async () => {
  await server?.stop()
  await prisma.$disconnect()
})

const assigned = (title) => prisma.board.create({
  data: { classroomId: shelf.id, title, sharedWith: { connect: [{ id: school.rooms.student.id }] } }
})

test('a trial lesson started on a chosen board stays on that board', async () => {
  const chosen = await assigned('Prepared for the lesson')
  // Touched later, so it used to be picked instead of the chosen one.
  await assigned('Another one')

  const res = await teacher.post('/api/calls', { classroomId: school.rooms.student.id, boardId: chosen.id, title: 'Lesson' })
  assert.equal(res.status, 201, JSON.stringify(res.body))
  assert.equal(res.body.trial, true)
  assert.equal(res.body.boardId, chosen.id)
  const call = await prisma.call.findUnique({ where: { id: res.body.call.id } })
  assert.equal(call.boardId, chosen.id)
})

test('a board that is not this student\'s is not used for their trial', async () => {
  await prisma.call.updateMany({ data: { endedAt: new Date() } })
  const room2Shelf = await prisma.classroom.create({ data: { teacherId: school.people.teacher2.id, schoolId: school.schoolA.id } })
  const foreign = await prisma.board.create({ data: { classroomId: room2Shelf.id, title: 'Someone else\'s' } })

  const res = await teacher.post('/api/calls', { classroomId: school.rooms.student.id, boardId: foreign.id, title: 'Lesson' })
  // The teacher cannot reach that board at all.
  assert.equal(res.status, 404)
})
