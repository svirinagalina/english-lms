// Board edits over the socket: who made an element and when is the server's
// record, not something a client's copy can rewrite.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { io } from 'socket.io-client'
import { migrate, seed, startServer, prisma, PASSWORD } from './helpers.js'

let server, school, board, student
const AT = 1_700_000_000_000

before(async () => {
  migrate()
  school = await seed()
  server = await startServer()
  board = await prisma.board.create({
    data: {
      title: 'Lessons', classroomId: school.rooms.student.id,
      elements: [{ id: 'teacher-text', type: 'text', x: 100, y: 100, text: 'Read page 5', color: '#111111', width: 2, fontSize: 24, authorId: school.people.teacher.id, at: AT }]
    }
  })
  student = await connect(school.people.student)
  const opened = await new Promise((resolve) => student.emit('board:open', board.id, {}, resolve))
  assert.ok(Array.isArray(opened?.elements), JSON.stringify(opened))
})

after(async () => {
  student?.close()
  await server?.stop()
  await prisma.$disconnect()
})

async function connect(person) {
  const res = await fetch(`${server.base}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: person.email, password: PASSWORD })
  })
  const cookie = res.headers.get('set-cookie').split(';')[0]
  const socket = io(server.base, { transports: ['websocket'], extraHeaders: { cookie } })
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject) })
  return socket
}

// The board is saved a moment after a change.
async function stored(id, check) {
  const deadline = Date.now() + 8000
  while (Date.now() < deadline) {
    const row = await prisma.board.findUnique({ where: { id: board.id }, select: { elements: true } })
    const element = row.elements.find((e) => e.id === id)
    if (element && check(element)) return element
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  assert.fail(`element ${id} never reached the expected state`)
}

test("a student moves the teacher's text, and it stays the teacher's", async () => {
  student.emit('board:update', { id: 'teacher-text', type: 'text', x: 400, y: 100, text: 'Read page 5', color: '#111111', width: 2, fontSize: 24, authorId: school.people.student.id, at: 1 })
  const element = await stored('teacher-text', (e) => e.x === 400)
  assert.equal(element.authorId, school.people.teacher.id)
  assert.equal(element.at, AT)
})

test("re-adding the teacher's element under its id does not make it the student's", async () => {
  student.emit('board:add', { id: 'teacher-text', type: 'text', x: 500, y: 100, text: 'Read page 5', color: '#111111', width: 2, fontSize: 24 })
  const element = await stored('teacher-text', (e) => e.x === 500)
  assert.equal(element.authorId, school.people.teacher.id)
  assert.equal(element.at, AT)
})

test("a student's new element is recorded as theirs, whatever the client says", async () => {
  student.emit('board:update', { id: 'student-note', type: 'text', x: 50, y: 300, text: 'my answer', color: '#111111', width: 2, fontSize: 24, authorId: school.people.teacher.id })
  const element = await stored('student-note', () => true)
  assert.equal(element.authorId, school.people.student.id)
  assert.equal(typeof element.at, 'number')
})
