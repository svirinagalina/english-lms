// Writing tabs: each tab is a document of its own; the document is tab 1.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { io } from 'socket.io-client'
import { migrate, seed, startServer, prisma, PASSWORD } from './helpers.js'

let server, school, teacher, student, outsider
const emit = (socket, ...args) => new Promise((resolve) => socket.emit(...args, resolve))

before(async () => {
  migrate()
  school = await seed()
  server = await startServer()
  teacher = await connect(school.people.teacher)
  student = await connect(school.people.student)
  outsider = await connect(school.people.teacher2)
})

after(async () => {
  for (const socket of [teacher, student, outsider]) socket?.close()
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

test('a new tab has its own text, and the other side hears of it', async () => {
  const base = school.rooms.student.id
  await emit(teacher, 'doc:open', base, {})
  const heard = new Promise((resolve) => teacher.once('doc:tabs', resolve))
  const added = await emit(student, 'doc:tab:add', base)
  assert.ok(added.id, JSON.stringify(added))
  assert.deepEqual((await heard).tabs, [added.id])

  const opened = await emit(student, 'doc:open', `${base}#${added.id}`, {})
  assert.deepEqual(opened.runs, [])
  student.emit('doc:update', [{ text: 'Second essay', kind: 'base' }])
  const deadline = Date.now() + 8000
  let row
  while (Date.now() < deadline) {
    row = await prisma.docTab.findUnique({ where: { id: added.id } })
    if (row.runs.length) break
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  assert.equal(row.runs[0].text, 'Second essay')
  const first = await emit(teacher, 'doc:open', base, {})
  assert.ok(!first.runs.some((r) => r.text === 'Second essay'))
})

test("someone else's teacher can neither see nor open the tabs", async () => {
  const base = school.rooms.student.id
  const { tabs } = await emit(teacher, 'doc:tabs', base)
  assert.ok((await emit(outsider, 'doc:tabs', base)).error)
  assert.ok((await emit(outsider, 'doc:open', `${base}#${tabs[0]}`, {})).error)
})

test('only the teacher deletes a tab', async () => {
  const base = school.rooms.student.id
  const { tabs } = await emit(teacher, 'doc:tabs', base)
  assert.ok((await emit(student, 'doc:tab:delete', base, tabs[0])).error)
  const done = await emit(teacher, 'doc:tab:delete', base, tabs[0])
  assert.deepEqual(done.tabs, [])
  assert.equal(await prisma.docTab.count({ where: { key: base } }), 0)
})
