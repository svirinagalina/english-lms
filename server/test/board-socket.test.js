// Board edits over the socket: who made an element and when is the server's
// record, not something a client's copy can rewrite; a student changes only
// their own elements and may only move the teacher's.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { io } from 'socket.io-client'
import { migrate, seed, startServer, prisma, PASSWORD } from './helpers.js'

let server, school, board, student, teacher
const AT = 1_700_000_000_000

before(async () => {
  migrate()
  school = await seed()
  server = await startServer()
  board = await prisma.board.create({
    data: {
      title: 'Lessons', classroomId: school.rooms.student.id,
      elements: [
        { id: 'teacher-text', type: 'text', x: 100, y: 100, text: 'Read page 5', color: '#111111', width: 2, fontSize: 24, authorId: school.people.teacher.id, at: AT },
        { id: 'teacher-stroke', type: 'path', points: [0, 0, 10, 10, 20, 0], color: '#111111', width: 2, authorId: school.people.teacher.id, at: AT },
        { id: 'old-text', type: 'text', x: 0, y: 500, text: 'No author', color: '#111111', width: 2, fontSize: 24 }
      ]
    }
  })
  student = await connect(school.people.student)
  teacher = await connect(school.people.teacher)
  for (const socket of [student, teacher]) {
    const opened = await new Promise((resolve) => socket.emit('board:open', board.id, {}, resolve))
    assert.ok(Array.isArray(opened?.elements), JSON.stringify(opened))
  }
})

after(async () => {
  student?.close()
  teacher?.close()
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

const current = async (id) => (await prisma.board.findUnique({ where: { id: board.id }, select: { elements: true } })).elements.find((e) => e.id === id)
// Long enough for a save that should not happen to have happened.
const settle = () => new Promise((resolve) => setTimeout(resolve, 2500))
const answer = (socket, event) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`no ${event} from the server`)), 5000)
  socket.once(event, (data) => { clearTimeout(timer); resolve(data) })
})

test("a student cannot erase the teacher's text; their screen gets it back", async () => {
  const back = answer(student, 'board:add')
  student.emit('board:delete', 'teacher-text')
  assert.equal((await back).id, 'teacher-text')
  await settle()
  assert.ok(await current('teacher-text'))
})

test("a student cannot rewrite the teacher's text or restyle it", async () => {
  student.emit('board:update', { ...(await current('teacher-text')), text: 'No homework today' })
  student.emit('board:update', { ...(await current('teacher-text')), color: '#ff0000' })
  await settle()
  const element = await current('teacher-text')
  assert.equal(element.text, 'Read page 5')
  assert.equal(element.color, '#111111')
})

test("an element without an author counts as the teacher's", async () => {
  student.emit('board:delete', 'old-text')
  await settle()
  assert.ok(await current('old-text'))
})

test("a student moves the teacher's drawing as a whole, but cannot reshape it", async () => {
  student.emit('board:update', { ...(await current('teacher-stroke')), points: [5, 5, 15, 15, 25, 5] })
  await stored('teacher-stroke', (e) => e.points[0] === 5)
  student.emit('board:update', { ...(await current('teacher-stroke')), points: [5, 5, 99, 99, 25, 5] })
  await settle()
  assert.deepEqual((await current('teacher-stroke')).points, [5, 5, 15, 15, 25, 5])
})

test('a student erases and edits their own writing', async () => {
  student.emit('board:update', { ...(await current('student-note')), text: 'my better answer' })
  await stored('student-note', (e) => e.text === 'my better answer')
  student.emit('board:delete', 'student-note')
  const deadline = Date.now() + 8000
  while (await current('student-note') && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 200))
  assert.equal(await current('student-note'), undefined)
})

test("the teacher still erases anything, the student's writing included", async () => {
  student.emit('board:add', { id: 'student-2', type: 'text', x: 10, y: 700, text: 'oops', color: '#111111', width: 2, fontSize: 24 })
  await stored('student-2', () => true)
  teacher.emit('board:delete', 'student-2')
  teacher.emit('board:update', { ...(await current('teacher-text')), text: 'Read page 6' })
  await stored('teacher-text', (e) => e.text === 'Read page 6')
  assert.equal(await current('student-2'), undefined)
})
