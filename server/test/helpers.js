// Shared setup for the API tests: a separate database, the real server as a
// child process, and a small school to test against.
//
// The tests wipe the database they run on, so it must be a *_test one:
// TEST_DATABASE_URL, or english_lms_test on the local Postgres.
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export const DATABASE_URL = process.env.TEST_DATABASE_URL ?? `postgresql://${process.env.USER ?? 'postgres'}@localhost:5432/english_lms_test`
if (!/_test(\?|$)/.test(new URL(DATABASE_URL).pathname + new URL(DATABASE_URL).search)) {
  throw new Error(`Refusing to run: the test database name must end in _test (got ${new URL(DATABASE_URL).pathname})`)
}

export const PASSWORD = 'test-password-1'

export const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } })

// Brings the schema up to date (quick when nothing is pending).
export function migrate() {
  execFileSync(path.join(serverDir, 'node_modules/.bin/prisma'), ['migrate', 'deploy'], {
    cwd: serverDir,
    env: { ...process.env, DATABASE_URL },
    stdio: 'pipe'
  })
}

// Empties every table, then makes two schools:
//   A: owner, partner, two teachers, a student of each teacher, a free user
//   B: a teacher and their student
export async function seed() {
  const tables = await prisma.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
  if (tables.length) await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`)

  // A low bcrypt cost keeps seeding fast; login compares the same way.
  const passwordHash = await bcrypt.hash(PASSWORD, 4)
  const schoolA = await prisma.school.create({ data: { name: 'School A' } })
  const schoolB = await prisma.school.create({ data: { name: 'School B' } })
  const user = (schoolId, key, role, extra = {}) =>
    prisma.user.create({ data: { email: `${key}@test.com`, name: key, role, schoolId, passwordHash, ...extra } })

  const people = {
    owner: await user(schoolA.id, 'owner', 'OWNER'),
    partner: await user(schoolA.id, 'partner', 'PARTNER'),
    teacher: await user(schoolA.id, 'teacher', 'TEACHER'),
    teacher2: await user(schoolA.id, 'teacher2', 'TEACHER'),
    student: await user(schoolA.id, 'student', 'STUDENT'),
    student2: await user(schoolA.id, 'student2', 'STUDENT'),
    free: await user(schoolA.id, 'free', 'STUDENT', { free: true }),
    teacherB: await user(schoolB.id, 'teacherb', 'TEACHER'),
    studentB: await user(schoolB.id, 'studentb', 'STUDENT')
  }

  const link = async (teacher, student) => {
    await prisma.teacherStudent.create({ data: { teacherId: teacher.id, studentId: student.id } })
    return prisma.classroom.create({ data: { teacherId: teacher.id, studentId: student.id, schoolId: teacher.schoolId } })
  }
  const rooms = {
    student: await link(people.teacher, people.student),
    student2: await link(people.teacher2, people.student2),
    studentB: await link(people.teacherB, people.studentB)
  }
  return { schoolA, schoolB, people, rooms }
}

// The real server (src/index.js) on a free port, with only the settings it
// needs — no API keys from .env reach it.
export async function startServer(extraEnv = {}) {
  // The browser tests (e2e/) need a known port for the client's proxy.
  const port = Number(extraEnv.PORT) || 41000 + Math.floor(Math.random() * 2000)
  const child = spawn(process.execPath, ['src/index.js'], {
    cwd: serverDir,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NODE_ENV: 'test',
      DATABASE_URL,
      JWT_SECRET: 'test-secret',
      PORT: String(port),
      CLIENT_ORIGIN: 'http://localhost:5173',
      UPLOAD_DIR: mkdtempSync(path.join(tmpdir(), 'lms-test-uploads-')),
      ...extraEnv
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let output = ''
  child.stdout.on('data', (chunk) => { output += chunk })
  child.stderr.on('data', (chunk) => { output += chunk })

  const base = `http://127.0.0.1:${port}`
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Server exited early:\n${output}`)
    try {
      const res = await fetch(`${base}/api/health`)
      if (res.ok) break
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  if (Date.now() >= deadline) throw new Error(`Server did not start:\n${output}`)

  return {
    base,
    // Everything the server printed so far.
    output: () => output,
    stop: () => new Promise((resolve) => {
      if (child.exitCode !== null) return resolve()
      child.once('exit', resolve)
      child.kill('SIGTERM')
    })
  }
}

// A tiny client: JSON in and out, the sign-in cookie kept between calls.
export function client(base) {
  let cookie = null
  const call = async (method, url, body) => {
    const res = await fetch(base + url, {
      method,
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined
    })
    const setCookie = res.headers.get('set-cookie')
    if (setCookie) cookie = setCookie.split(';')[0]
    const text = await res.text()
    let json = null
    try { json = JSON.parse(text) } catch {}
    return { status: res.status, body: json }
  }
  return {
    get: (url) => call('GET', url),
    post: (url, body) => call('POST', url, body ?? {}),
    patch: (url, body) => call('PATCH', url, body ?? {}),
    delete: (url) => call('DELETE', url),
    login: async (email, password = PASSWORD) => call('POST', '/api/auth/login', { email, password }),
    setCookie: (value) => { cookie = value }
  }
}

export async function signedIn(base, person) {
  const c = client(base)
  const res = await c.login(person.email)
  if (res.status !== 200) throw new Error(`Could not sign in ${person.email}: ${res.status} ${JSON.stringify(res.body)}`)
  return c
}
