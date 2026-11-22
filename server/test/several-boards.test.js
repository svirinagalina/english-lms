// A student may be on several boards at once (Galina, 2026-11-22: Alina kept
// losing "wednesday" when assigned to "bookclub" — Assign used to take away
// whatever board the student had before).
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
})

after(async () => {
  await server?.stop()
  await prisma.$disconnect()
})

const boardsOf = async (roomId) => (await prisma.board.findMany({
  where: { OR: [{ classroomId: roomId }, { sharedWith: { some: { id: roomId } } }] }, select: { title: true }
})).map((b) => b.title).sort()

test('assigning a second board keeps the first one', async () => {
  const room = school.rooms.student.id
  const wednesday = await prisma.board.create({ data: { classroomId: shelf.id, title: 'wednesday' } })
  const bookclub = await prisma.board.create({ data: { classroomId: shelf.id, title: 'bookclub' } })

  const first = await teacher.post(`/api/classrooms/${shelf.id}/boards/${wednesday.id}/assign`, { targetClassroomId: room, attach: true })
  assert.equal(first.status, 200, JSON.stringify(first.body))
  const second = await teacher.post(`/api/classrooms/${shelf.id}/boards/${bookclub.id}/assign`, { targetClassroomId: room, attach: true })
  assert.equal(second.status, 200, JSON.stringify(second.body))
  assert.deepEqual(second.body.displaced, [])

  const mine = (await boardsOf(room)).filter((t) => t === 'wednesday' || t === 'bookclub')
  assert.deepEqual(mine, ['bookclub', 'wednesday'])

  // The cabinet lists both.
  const cabinet = await teacher.get(`/api/classrooms/${room}`)
  const titles = cabinet.body.classroom.boards.map((b) => b.title)
  assert.ok(titles.includes('wednesday') && titles.includes('bookclub'), JSON.stringify(titles))

  // Unchecking one takes only that one away.
  const off = await teacher.post(`/api/classrooms/${shelf.id}/boards/${wednesday.id}/assign`, { targetClassroomId: room, attach: false })
  assert.equal(off.status, 200)
  assert.deepEqual((await boardsOf(room)).filter((t) => t === 'wednesday' || t === 'bookclub'), ['bookclub'])
  // And the board itself is still on the teacher's shelf.
  assert.ok(await prisma.board.findUnique({ where: { id: wednesday.id } }))
})
