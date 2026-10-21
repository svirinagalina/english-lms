// Before the browser checks: a fresh school in english_lms_test (the same seed
// as the API tests, plus a grammar unit, a board and a word set) and the real
// server on API_PORT. What the tests need to know is written to .seed.json.
import { writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { migrate, seed, startServer, prisma, PASSWORD } from '../server/test/helpers.js'
import { API_PORT, WEB_PORT } from './playwright.config.js'

export default async function globalSetup() {
  // Locally the database may not exist yet; creating an existing one just fails.
  if (!process.env.CI) {
    try { execFileSync('createdb', [new URL(process.env.TEST_DATABASE_URL).pathname.slice(1)], { stdio: 'ignore' }) } catch {}
  }
  migrate()
  const school = await seed()
  const { schoolA, people, rooms } = school

  const unit = await prisma.unit.create({
    data: {
      title: 'Present Simple', theory: 'He works, she plays.', position: 1, schoolId: schoolA.id,
      exercises: { create: [{ type: 'TRANSLATE', prompt: 'Он работает.', answers: ['He works.'], position: 1 }] }
    }
  })
  const unit2 = await prisma.unit.create({
    data: {
      title: 'Articles', position: 2, schoolId: schoolA.id,
      exercises: { create: [{ type: 'TRANSLATE', prompt: 'У меня есть кошка.', answers: ['I have a cat.'], position: 1 }] }
    }
  })
  const board = await prisma.board.create({
    data: {
      title: 'Lessons', classroomId: rooms.student.id,
      elements: [{ id: 'hello', type: 'text', x: 120, y: 120, text: 'Hello from the teacher', color: '#111111', fontSize: 28, authorId: people.teacher.id }]
    }
  })
  const words = await prisma.vocabSet.create({
    data: {
      title: 'Animals', schoolId: schoolA.id,
      cards: { create: [{ term: 'cat', translation: 'кот', position: 0 }, { term: 'dog', translation: 'собака', position: 1 }] }
    }
  })

  const server = await startServer({ PORT: String(API_PORT), CLIENT_ORIGIN: `http://localhost:${WEB_PORT}` })
  const ids = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, { id: v.id, email: v.email, name: v.name }]))
  writeFileSync(new URL('./.seed.json', import.meta.url), JSON.stringify({
    password: PASSWORD,
    people: ids(people),
    rooms: Object.fromEntries(Object.entries(rooms).map(([k, v]) => [k, v.id])),
    unitId: unit.id,
    unit2Id: unit2.id,
    boardId: board.id,
    wordSetId: words.id
  }, null, 2))

  return async () => {
    await server.stop()
    await prisma.$disconnect()
  }
}
