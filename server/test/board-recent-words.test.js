// "Words" on the board: the student's vocabulary of the last week.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { migrate, seed, startServer, signedIn, prisma } from './helpers.js'

let server, school

before(async () => {
  migrate()
  school = await seed()
  server = await startServer()
  const set = await prisma.vocabSet.create({ data: { title: 'From my board', schoolId: school.schoolA.id, ownerId: school.people.student.id } })
  const old = new Date(Date.now() - 10 * 86400000)
  await prisma.vocabCard.createMany({
    data: [
      { setId: set.id, term: 'give up', translation: 'phrasal verb: сдаваться, бросать, отказываться, уступать · noun: x', position: 0 },
      { setId: set.id, term: 'house', translation: 'дом', position: 1 },
      { setId: set.id, term: 'ancient', translation: 'древний', position: 2, createdAt: old }
    ]
  })
})

after(async () => {
  await server?.stop()
  await prisma.$disconnect()
})

test('the teacher gets the student\'s words of the last week, short translations', async () => {
  const teacher = await signedIn(server.base, school.people.teacher)
  const res = await teacher.get(`/api/vocab/board-words?classroomId=${school.rooms.student.id}`)
  assert.equal(res.status, 200, JSON.stringify(res.body))
  assert.deepEqual(res.body.words, [
    { term: 'give up', translation: 'сдаваться, бросать, отказываться' },
    { term: 'house', translation: 'дом' }
  ])
})

test('a student sees their own; another school\'s teacher gets nothing', async () => {
  const student = await signedIn(server.base, school.people.student)
  assert.equal((await student.get('/api/vocab/board-words')).body.words.length, 2)
  const outsider = await signedIn(server.base, school.people.teacherB)
  assert.equal((await outsider.get(`/api/vocab/board-words?classroomId=${school.rooms.student.id}`)).status, 404)
})
