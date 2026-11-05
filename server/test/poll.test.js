// A poll in a call: who may run it, that a vote can't be traced to a person,
// and that it stays inside its own call and school.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { io } from 'socket.io-client'
import { migrate, seed, startServer, prisma, PASSWORD } from './helpers.js'

let server, school, callA, callB
const sockets = []

before(async () => {
  migrate()
  school = await seed()
  server = await startServer()
  const { teacher, teacherB } = school.people
  callA = await prisma.call.create({ data: { token: 'poll-call-a', hostId: teacher.id, schoolId: school.schoolA.id } })
  callB = await prisma.call.create({ data: { token: 'poll-call-b', hostId: teacherB.id, schoolId: school.schoolB.id } })
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
  // Everything this person is sent about polls, to check what they never got.
  socket.seen = []
  socket.on('poll:state', (state) => socket.seen.push(state))
  sockets.push(socket)
  return socket
}

const emit = (socket, event, ...args) => new Promise((resolve) => socket.emit(event, ...args, resolve))

async function inCall(person, call = callA) {
  const socket = await connect(person)
  socket.joined = await emit(socket, 'join-call', call.token)
  assert.equal(socket.joined.error, undefined, JSON.stringify(socket.joined))
  return socket
}

const nextState = (socket) => new Promise((resolve) => socket.once('poll:state', resolve))
const settle = () => new Promise((resolve) => setTimeout(resolve, 150))

// Each test leaves the call's room without a poll for the next one.
async function finish(teacher) {
  await emit(teacher, 'poll:close')
  await emit(teacher, 'poll:clear')
}

test('only a teacher starts or ends a poll', async () => {
  const teacher = await inCall(school.people.teacher)
  const student = await inCall(school.people.student)
  const partner = await inCall(school.people.partner)
  const poll = { question: 'Which book?', options: ['Red', 'Blue'] }

  assert.ok((await emit(student, 'poll:start', poll)).error)
  assert.ok((await emit(partner, 'poll:start', poll)).error)
  await settle()
  assert.equal(student.seen.length, 0)

  assert.equal((await emit(teacher, 'poll:start', poll)).ok, true)
  assert.ok((await emit(student, 'poll:close')).error)
  assert.ok((await emit(partner, 'poll:close')).error)
  await settle()
  assert.equal(teacher.seen.at(-1).open, true, 'still open')
  assert.ok((await emit(teacher, 'poll:start', poll)).error, 'one poll at a time')

  await emit(teacher, 'poll:close')
  assert.ok((await emit(student, 'poll:clear')).error)
  assert.equal((await emit(teacher, 'poll:clear')).ok, true)
  for (const socket of [teacher, student, partner]) socket.close()
})

test('a poll needs at least two different options', async () => {
  const teacher = await inCall(school.people.teacher)
  for (const options of [undefined, 'Yes', [], ['Yes'], ['Yes', '   '], ['Yes', ' yes '], [1, 2], Array.from({ length: 11 }, (_, i) => `Option ${i}`)]) {
    assert.ok((await emit(teacher, 'poll:start', { options })).error, JSON.stringify(options))
  }
  assert.equal((await emit(teacher, 'poll:start', { options: ['Yes', 'No'] })).ok, true, 'the question is optional')
  assert.equal(teacher.seen.at(-1).question, '')
  await finish(teacher)
  teacher.close()
})

test('votes stay anonymous, and the result reaches everyone at the end', async () => {
  const teacher = await inCall(school.people.teacher)
  const one = await inCall(school.people.student)
  const two = await inCall(school.people.student2)
  const three = await inCall(school.people.free)

  const started = nextState(one)
  await emit(teacher, 'poll:start', { question: 'Tea or coffee?', options: ['Tea', 'Coffee'] })
  const poll = await started
  assert.deepEqual(poll.options, ['Tea', 'Coffee'])

  for (const [socket, option] of [[one, 1], [two, 0], [three, 1]]) {
    const counted = nextState(teacher)
    assert.equal((await emit(socket, 'poll:vote', { pollId: poll.id, option })).ok, true)
    await counted
  }

  // While open: how many voted, never how they split.
  assert.equal(teacher.seen.at(-1).votes, 3)
  for (const socket of [teacher, one, two, three]) {
    for (const state of socket.seen) assert.equal(state.counts, null)
  }

  const closed = nextState(two)
  await emit(teacher, 'poll:close')
  const result = await closed
  assert.deepEqual(result.counts, [1, 2])
  assert.equal(result.votes, 3)
  await settle()
  for (const socket of [teacher, one, three]) assert.deepEqual(socket.seen.at(-1).counts, [1, 2])

  // No id or name of anyone, in anything anybody was sent.
  const sent = JSON.stringify([teacher.seen, one.seen, two.seen, three.seen])
  for (const person of ['student', 'student2', 'free']) {
    assert.ok(!sent.includes(school.people[person].id))
    assert.ok(!sent.includes(`${school.people[person].name}@`))
  }
  assert.deepEqual(Object.keys(result).sort(), ['counts', 'id', 'open', 'options', 'question', 'votes'])
  assert.ok(!server.output().includes('Tea or coffee'), 'nothing about a poll in the logs')

  assert.ok((await emit(three, 'poll:vote', { pollId: poll.id, option: 0 })).error, 'too late to vote')
  await finish(teacher)
  for (const socket of [teacher, one, two, three]) socket.close()
})

test('one vote per person, across reconnects', async () => {
  const teacher = await inCall(school.people.teacher)
  const student = await inCall(school.people.student)

  const started = nextState(student)
  await emit(teacher, 'poll:start', { options: ['Yes', 'No'] })
  const { id } = await started

  for (const option of [-1, 2, 1.5, '0', null]) {
    assert.ok((await emit(student, 'poll:vote', { pollId: id, option })).error, String(option))
  }
  assert.ok((await emit(student, 'poll:vote', { pollId: 'not-this-one', option: 0 })).error)
  assert.ok((await emit(teacher, 'poll:vote', { pollId: id, option: 0 })).error, 'teachers do not vote')

  assert.equal((await emit(student, 'poll:vote', { pollId: id, option: 0 })).ok, true)
  const again = await emit(student, 'poll:vote', { pollId: id, option: 1 })
  assert.equal(again.voted, true)

  // Back through a new connection: the poll is there, marked as voted.
  student.close()
  await settle()
  const back = await inCall(school.people.student)
  assert.equal(back.joined.poll.id, id)
  assert.equal(back.joined.poll.voted, true)
  assert.equal(back.joined.poll.counts, null)
  assert.ok((await emit(back, 'poll:vote', { pollId: id, option: 1 })).error)

  // So is the teacher, who can still end it after a dropped line.
  teacher.close()
  await settle()
  const teacherBack = await inCall(school.people.teacher)
  assert.equal(teacherBack.joined.poll.voted, false)
  assert.equal(teacherBack.joined.poll.votes, 1)
  const closed = nextState(back)
  assert.equal((await emit(teacherBack, 'poll:close')).ok, true)
  assert.deepEqual((await closed).counts, [1, 0])
  await emit(teacherBack, 'poll:clear')
  back.close()
  teacherBack.close()
})

test('a poll stays in its call: other schools and people outside it get nothing', async () => {
  const teacher = await inCall(school.people.teacher)
  const student = await inCall(school.people.student)

  // Someone of the same school who is not in this call.
  const outsider = await connect(school.people.student2)
  // Another school's people, in a call of their own and at the door of this one.
  const teacherB = await inCall(school.people.teacherB, callB)
  const studentB = await inCall(school.people.studentB, callB)
  const stranger = await connect(school.people.studentB)

  const started = nextState(student)
  await emit(teacher, 'poll:start', { question: 'Private to school A', options: ['Yes', 'No'] })
  const { id } = await started

  const refused = await emit(stranger, 'join-call', callA.token)
  assert.ok(refused.error)
  assert.equal(refused.poll, undefined)
  const anotherLook = await inCall(school.people.studentB, callB)
  assert.equal(anotherLook.joined.poll, null)

  for (const socket of [outsider, studentB, stranger]) {
    assert.ok((await emit(socket, 'poll:vote', { pollId: id, option: 0 })).error)
  }
  assert.ok((await emit(teacherB, 'poll:close')).error)
  await settle()
  assert.equal(teacher.seen.at(-1).votes, 0)
  assert.equal(teacher.seen.at(-1).open, true)
  for (const socket of [outsider, teacherB, studentB, stranger]) assert.equal(socket.seen.length, 0)

  await finish(teacher)
  for (const socket of [teacher, student, outsider, teacherB, studentB, stranger, anotherLook]) socket.close()
})
