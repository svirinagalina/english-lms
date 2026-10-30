// A call with no student has one scratch board, and everyone in the call —
// the host, a partner joining later, a guest with no teacher — lands on it.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { io } from 'socket.io-client'
import { migrate, seed, startServer, signedIn, prisma, PASSWORD } from './helpers.js'

let server, school, as
const sockets = []

before(async () => {
  migrate()
  school = await seed()
  server = await startServer()
  as = {}
  for (const key of ['teacher', 'partner', 'free']) as[key] = await signedIn(server.base, school.people[key])
})

after(async () => {
  for (const socket of sockets) socket.close()
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
  sockets.push(socket)
  return socket
}

const emit = (socket, event, ...args) => new Promise((resolve) => socket.emit(event, ...args, resolve))

test('everyone in a call with no student gets the one scratch board', async () => {
  const created = await as.teacher.post('/api/calls', {})
  assert.equal(created.status, 201, JSON.stringify(created.body))
  const token = created.body.call.token

  // A guest (no teacher) is in before the board exists: nothing to open yet.
  assert.equal((await as.free.get(`/api/calls/token/${token}`)).body.call.scratchBoard, null)
  const guest = await connect(school.people.free)
  assert.equal((await emit(guest, 'join-call', token)).boardId, null)
  const announced = new Promise((resolve) => guest.once('call:scratch-board', resolve))

  // The host makes it; the guest already in the call is told at once.
  const teacher = await connect(school.people.teacher)
  await emit(teacher, 'join-call', token)
  const made = await as.teacher.post(`/api/calls/${token}/scratch-board`)
  assert.equal(made.status, 201, JSON.stringify(made.body))
  const boardId = made.body.board.id
  assert.equal((await announced).id, boardId)
  assert.ok((await emit(teacher, 'board:open', boardId, {})).elements)

  // Asking again (a reload, a second tab) gives the same board, not a new one.
  const again = await as.teacher.post(`/api/calls/${token}/scratch-board`)
  assert.equal(again.status, 200)
  assert.equal(again.body.board.id, boardId)
  assert.equal(await prisma.board.count({ where: { scratch: true } }), 1)
  // A partner doesn't host calls, so doesn't make one either.
  assert.equal((await as.partner.post(`/api/calls/${token}/scratch-board`)).status, 403)

  // Whoever joins later starts on it, the partner and a guest alike.
  const partner = await connect(school.people.partner)
  assert.equal((await emit(partner, 'join-call', token)).boardId, boardId)
  assert.equal((await as.free.get(`/api/calls/token/${token}`)).body.call.scratchBoard.id, boardId)
  const guest2 = await connect(school.people.free)
  assert.equal((await emit(guest2, 'join-call', token)).boardId, boardId)

  // The guest may open and write on it.
  const opened = await emit(guest, 'board:open', boardId, {})
  assert.ok(Array.isArray(opened.elements), JSON.stringify(opened))
  guest.emit('board:add', { id: 'guest-note', type: 'text', x: 10, y: 10, text: 'hello', color: '#111111', width: 2, fontSize: 24 })
  const deadline = Date.now() + 8000
  let saved = false
  while (!saved && Date.now() < deadline) {
    const row = await prisma.board.findUnique({ where: { id: boardId }, select: { elements: true } })
    saved = row.elements.some((e) => e.id === 'guest-note')
    if (!saved) await new Promise((resolve) => setTimeout(resolve, 200))
  }
  assert.ok(saved, 'the guest\'s text was not saved')

  // Someone of another school cannot.
  const outsider = await connect(school.people.studentB)
  assert.equal((await emit(outsider, 'board:open', boardId, {})).error, 'Board not found')
})

test('once the call is over, its scratch board is closed to students', async () => {
  const { token } = (await as.teacher.post('/api/calls', {})).body.call
  const { id: boardId } = (await as.teacher.post(`/api/calls/${token}/scratch-board`)).body.board
  await prisma.call.updateMany({ where: { token }, data: { endedAt: new Date() } })
  const guest = await connect(school.people.free)
  assert.equal((await emit(guest, 'board:open', boardId, {})).error, 'Board not found')
})

test('a call with a student still refuses a scratch board', async () => {
  const { token } = (await as.teacher.post('/api/calls', { classroomId: school.rooms.student.id })).body.call
  assert.equal((await as.teacher.post(`/api/calls/${token}/scratch-board`)).status, 400)
})
