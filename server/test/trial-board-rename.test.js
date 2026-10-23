// A board called «Trial lesson…» becomes the student's own board once they
// have paid (Pavel thought he only had the trial lesson).
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { migrate, seed, prisma, DATABASE_URL } from './helpers.js'

let school, renameTrialBoards, appPrisma

before(async () => {
  migrate()
  school = await seed()
  // The app's own client must open the test database.
  process.env.DATABASE_URL = DATABASE_URL
  ;({ renameTrialBoards } = await import('../src/afterPayment.js'))
  ;({ prisma: appPrisma } = await import('../src/db.js'))
})

after(async () => { await prisma.$disconnect(); await appPrisma?.$disconnect() })

const shelfBoard = async (title, rooms) => {
  const { teacher } = school.people
  const shelf = await prisma.classroom.create({ data: { teacherId: teacher.id, studentId: null, schoolId: teacher.schoolId } })
  return prisma.board.create({ data: { title, classroomId: shelf.id, sharedWith: { connect: rooms.map((r) => ({ id: r.id })) } } })
}

test('a paid student’s trial board is renamed; an unpaid one and a pair board are not', async () => {
  const { student, student2 } = school.people
  const paidBoard = await shelfBoard('Trial lesson - Pavel.', [school.rooms.student])
  const unpaidBoard = await shelfBoard('Trial lesson - Anna', [school.rooms.student2])
  const pairBoard = await shelfBoard('Trial lesson pair', [school.rooms.student, school.rooms.student2])
  await prisma.user.update({ where: { id: student.id }, data: { lessonsPaid: 9 } })

  await renameTrialBoards()

  assert.equal((await prisma.board.findUnique({ where: { id: paidBoard.id } })).title, `${student.name} — lessons`)
  assert.equal((await prisma.board.findUnique({ where: { id: unpaidBoard.id } })).title, 'Trial lesson - Anna')
  assert.equal((await prisma.board.findUnique({ where: { id: pairBoard.id } })).title, 'Trial lesson pair')
  assert.ok(student2)
})
