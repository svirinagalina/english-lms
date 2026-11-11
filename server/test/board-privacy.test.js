// A group board (one board shared with several students): each student sees
// the teacher's work and their own, never another student's; the teacher
// sees everything. A student cannot move or delete the teacher's things there.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { io } from 'socket.io-client'
import { migrate, seed, startServer, prisma, PASSWORD } from './helpers.js'

let server, school, board, teacher, anna, boris
const sockets = []
const text = (id, extra = {}) => ({ id, type: 'text', x: 100, y: 100, text: id, color: '#111111', width: 2, fontSize: 24, ...extra })

async function connect(person) {
  const res = await fetch(`${server.base}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: person.email, password: PASSWORD })
  })
  const cookie = res.headers.get('set-cookie').split(';')[0]
  const socket = io(server.base, { transports: ['websocket'], extraHeaders: { cookie } })
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject) })
  socket.got = []
  for (const event of ['board:add', 'board:update', 'board:delete']) socket.on(event, (payload) => socket.got.push({ event, payload }))
  sockets.push(socket)
  return socket
}
const open = (socket) => new Promise((resolve) => socket.emit('board:open', board.id, {}, resolve))
const settle = () => new Promise((resolve) => setTimeout(resolve, 600))
const ids = (socket, event) => socket.got.filter((g) => g.event === event).map((g) => (typeof g.payload === 'string' ? g.payload : g.payload.id))
const clear = () => { for (const s of sockets) s.got.length = 0 }

before(async () => {
  migrate()
  school = await seed()
  server = await startServer()
  board = await prisma.board.create({
    data: {
      title: 'Group', classroomId: school.rooms.student.id,
      sharedWith: { connect: [{ id: school.rooms.student2.id }] },
      elements: [text('teacher-task', { authorId: school.people.teacher.id, at: 1 })]
    }
  })
  teacher = await connect(school.people.teacher)
  anna = await connect(school.people.student)
  boris = await connect(school.people.student2)
  for (const s of [teacher, anna, boris]) assert.ok(Array.isArray((await open(s)).elements))
})

after(async () => {
  for (const s of sockets) s.close()
  await server?.stop()
  await prisma.$disconnect()
})

test('a student\'s note reaches the teacher, not the other student', async () => {
  clear()
  anna.emit('board:add', text('anna-note'))
  await settle()
  assert.deepEqual(ids(teacher, 'board:add'), ['anna-note'])
  assert.deepEqual(ids(boris, 'board:add'), [])
  anna.emit('board:update', text('anna-note', { x: 300 }))
  anna.emit('board:delete', 'anna-note-none')
  await settle()
  assert.deepEqual(ids(teacher, 'board:update'), ['anna-note'])
  assert.deepEqual(boris.got, [])
})

test('opening the board: the other student does not get it, the teacher and the author do', async () => {
  const names = async (s) => (await open(s)).elements.map((e) => e.id).sort()
  assert.deepEqual(await names(boris), ['teacher-task'])
  assert.deepEqual(await names(anna), ['anna-note', 'teacher-task'])
  assert.deepEqual(await names(teacher), ['anna-note', 'teacher-task'])
})

test('the teacher\'s changes reach every student', async () => {
  clear()
  teacher.emit('board:add', text('teacher-2'))
  await settle()
  assert.deepEqual(ids(anna, 'board:add'), ['teacher-2'])
  assert.deepEqual(ids(boris, 'board:add'), ['teacher-2'])
  // The teacher moving a student's note: still that student's, still private.
  clear()
  teacher.emit('board:update', text('anna-note', { x: 500 }))
  await settle()
  assert.deepEqual(ids(anna, 'board:update'), ['anna-note'])
  assert.deepEqual(boris.got, [])
})

test('a student cannot move or delete the teacher\'s things on a group board', async () => {
  clear()
  anna.emit('board:update', text('teacher-task', { x: 900 }))
  anna.emit('board:delete', 'teacher-task')
  await settle()
  assert.deepEqual(boris.got, [])
  assert.deepEqual(teacher.got, [])
  // Anna gets the stored copy back.
  assert.equal(anna.got.find((g) => g.event === 'board:update')?.payload.x, 100)
  assert.deepEqual(ids(anna, 'board:add'), ['teacher-task'])
  const elements = (await open(teacher)).elements
  assert.equal(elements.find((e) => e.id === 'teacher-task').x, 100)
})

test('a student cannot touch another student\'s note either', async () => {
  clear()
  boris.emit('board:update', text('anna-note', { x: 1 }))
  boris.emit('board:delete', 'anna-note')
  await settle()
  assert.deepEqual(anna.got, [])
  assert.deepEqual(teacher.got, [])
  const elements = (await open(teacher)).elements
  assert.equal(elements.find((e) => e.id === 'anna-note').x, 500)
  // And Boris is told it is not there.
  assert.ok(ids(boris, 'board:delete').includes('anna-note'))
  assert.ok(!boris.got.some((g) => g.event !== 'board:delete'))
})
