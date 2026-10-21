// A password change or reset ends every sign-in made before it — a stolen
// cookie dies with the old password — while the person who changed it stays
// signed in on that device. Cookies from before this existed keep working.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { io } from 'socket.io-client'
import { migrate, seed, startServer, prisma, PASSWORD } from './helpers.js'

let server, school

before(async () => {
  migrate()
  school = await seed()
  server = await startServer()
})

after(async () => {
  await server?.stop()
  await prisma.$disconnect()
})

async function signIn(email, password = PASSWORD) {
  const res = await fetch(`${server.base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) })
  assert.equal(res.status, 200)
  return res.headers.get('set-cookie').split(';')[0]
}
const me = async (cookie) => (await fetch(`${server.base}/api/auth/me`, { headers: { cookie } })).status
const socketWith = (cookie) => new Promise((resolve) => {
  const socket = io(server.base, { transports: ['websocket'], extraHeaders: { cookie }, reconnection: false })
  socket.once('connect', () => { socket.close(); resolve(true) })
  socket.once('connect_error', () => { socket.close(); resolve(false) })
})

test('changing the password ends the other sign-ins and keeps this one', async () => {
  const { teacher } = school.people
  const laptop = await signIn(teacher.email)
  const stolen = await signIn(teacher.email)
  const res = await fetch(`${server.base}/api/profile`, {
    method: 'PATCH', headers: { 'content-type': 'application/json', cookie: laptop },
    body: JSON.stringify({ currentPassword: PASSWORD, newPassword: 'a-new-password-2' })
  })
  assert.equal(res.status, 200)
  const fresh = res.headers.get('set-cookie')?.split(';')[0]
  assert.ok(fresh, 'no new cookie for the device that changed the password')
  assert.equal(await me(fresh), 200)
  assert.equal(await me(stolen), 401)
  assert.equal(await me(laptop), 401)
  assert.equal(await socketWith(stolen), false)
  assert.equal(await socketWith(fresh), true)
  assert.equal(await me(await signIn(teacher.email, 'a-new-password-2')), 200)
})

test('a password reset by email ends the sign-ins made before it', async () => {
  const { student } = school.people
  const before = await signIn(student.email)
  const token = 'reset-token-for-test'
  await prisma.passwordReset.create({
    data: { userId: student.id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 3_600_000) }
  })
  const res = await fetch(`${server.base}/api/auth/reset/${token}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'reset-password-3' }) })
  assert.equal(res.status, 200)
  assert.equal(await me(before), 401)
  assert.equal(await me(res.headers.get('set-cookie').split(';')[0]), 200)
})

test('a cookie made before sessions were versioned still works until a password change', async () => {
  const { student2 } = school.people
  const old = jwt.sign({ sub: student2.id, role: 'STUDENT', schoolId: student2.schoolId }, 'test-secret', { expiresIn: '7d' })
  assert.equal(await me(`lms_token=${old}`), 200)
  assert.equal(await socketWith(`lms_token=${old}`), true)
})
