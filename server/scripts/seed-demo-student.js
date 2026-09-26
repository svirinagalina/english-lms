// A demo student with a lived-in cabinet, for screenshots (the website, the
// App Store) and for showing the platform: a lesson on her board with notes,
// mistakes and homework, grammar progress, saved words, a lesson package.
//
//   node --env-file=.env scripts/seed-demo-student.js [teacher-email]
//
// Idempotent: re-running rebuilds the same student. Refuses a non-local
// database unless DEMO_ALLOW_REMOTE=1 — this creates an account.
import { prisma } from '../src/db.js'
import { hashPassword } from '../src/auth.js'

const EMAIL = process.env.DEMO_EMAIL ?? 'demo.anna@test.com'
const PASSWORD = process.env.DEMO_PASSWORD ?? 'localtest'
const NAME = 'Anna'

const url = process.env.DATABASE_URL ?? ''
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url) && process.env.DEMO_ALLOW_REMOTE !== '1') {
  console.error('Not a local database — set DEMO_ALLOW_REMOTE=1 if you really mean it.')
  process.exit(1)
}

const day = 24 * 60 * 60 * 1000
const ago = (days, hours = 0) => new Date(Date.now() - days * day - hours * 60 * 60 * 1000)
let n = 0
const id = () => `demo${Date.now().toString(36)}${(n++).toString(36)}`

const teacherEmail = process.argv[2]
const teacher = teacherEmail
  ? await prisma.user.findUnique({ where: { email: teacherEmail } })
  : await prisma.user.findFirst({ where: { role: 'OWNER' }, orderBy: { createdAt: 'asc' } })
if (!teacher) throw new Error('No teacher found')

// A fresh start every run.
await prisma.user.deleteMany({ where: { email: EMAIL } })
const student = await prisma.user.create({
  data: {
    email: EMAIL, name: NAME, role: 'STUDENT', schoolId: teacher.schoolId,
    passwordHash: await hashPassword(PASSWORD),
    lessonsPaid: 8, packageStartedAt: ago(30),
    city: 'Madrid', timezone: 'Europe/Madrid', about: 'B1 → B2, speaking for work'
  }
})
await prisma.teacherStudent.create({ data: { teacherId: teacher.id, studentId: student.id } })
const classroom = await prisma.classroom.create({ data: { teacherId: teacher.id, studentId: student.id, schoolId: teacher.schoolId } })

// Five lessons held in the package, the last one two days ago.
for (const [d, h] of [[26, 2], [21, 2], [14, 2], [9, 2], [2, 3]]) {
  await prisma.session.create({ data: { classroomId: classroom.id, startedAt: ago(d, h), endedAt: ago(d, h - 1) } })
}

// Her notebook: what the teacher noted in lessons.
const mistakes = [
  ['I am living here since 2022', 'I have been living here since 2022', ['present-perfect-continuous'], 'Я живу здесь с 2022 года.'],
  ['Yesterday I have seen him', 'Yesterday I saw him', ['past-simple'], 'Вчера я его видела.'],
  ['He said me that he is busy', 'He told me that he was busy', ['reported-speech'], 'Он сказал мне, что занят.'],
  ['I didn\'t went there', 'I didn\'t go there', ['past-simple'], 'Я туда не ходила.'],
  ['It depends of the weather', 'It depends on the weather', ['prepositions'], 'Это зависит от погоды.']
]
const mistakeRows = []
// The drill prompt is written in, so the notebook needs no AI call.
for (const [i, [said, correct, topics, prompt]] of mistakes.entries()) {
  mistakeRows.push(await prisma.lessonMistake.create({
    data: { said, correct, topics, prompt, classroomId: classroom.id, studentId: student.id, teacherId: teacher.id, createdAt: ago(2 + i * 4) }
  }))
}

// The board of the last lesson: rule, examples, a note, two mistakes, homework.
const t = (x, y, text, extra = {}) => ({ id: id(), type: 'text', color: '#111827', width: 6, x, y, text, fontSize: 22, at: ago(2).getTime(), ...extra })
const note = (x, y, text, fill, extra = {}) => ({ id: id(), type: 'note', color: '#111827', width: 6, x, y, w: 300, h: 120, text, fill, fontSize: 18, at: ago(2).getTime(), ...extra })
const mistakeNote = (m, x, y) => note(x, y, `{{#b91c1c:✗ ${m.said}}}\n{{#15803d:✓ ${m.correct}}}`, '#fecaca', { mistakeId: m.id, w: 340, h: 70 })
const elements = [
  t(80, 60, '— Lesson · ' + ago(2).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }) + ' —', { color: '#2563eb', fontSize: 28 }),
  t(80, 130, '**Present Perfect vs Past Simple**', { fontSize: 34 }),
  t(80, 200, 'I {{#2563eb:have lived}} in Madrid {{#2563eb:for}} three years.  → still true now'),
  t(80, 245, 'I {{#ef4444:lived}} in London {{#ef4444:in 2019}}.  → finished, with a date'),
  t(80, 290, 'She {{#2563eb:has just finished}} the report — can I send it to you?'),
  t(80, 355, '**Your turn:** tell me about three things you have done this month.', { color: '#16a34a' }),
  note(760, 150, '**for** + a period\nfor three years · for ages\n\n**since** + a point in time\nsince 2022 · since Monday', '#fef08a', { w: 320 }),
  mistakeNote(mistakeRows[0], 80, 440),
  mistakeNote(mistakeRows[1], 460, 440),
  { id: id(), type: 'sticker', kind: 'well-done', color: '#111827', width: 1, x: 860, y: 420, w: 132, h: 50, at: ago(2).getTime() },
  { id: id(), type: 'path', color: '#111827', width: 4, highlight: true, points: [82, 222, 300, 222], at: ago(2).getTime() },
  t(80, 600, '— Homework —', { color: '#9333ea', fontSize: 28 }),
  t(80, 655, '1. Grammar units 3 and 6 on the platform\n2. Write 5 sentences about your week (Present Perfect)\n3. Revise today\'s words in Vocabulary', { fontSize: 20 })
]
await prisma.board.create({ data: { classroomId: classroom.id, title: `${NAME} — lessons`, elements } })

// Grammar: the first two units done, the third under way, a streak of days.
const units = await prisma.unit.findMany({ where: { schoolId: teacher.schoolId }, orderBy: { position: 'asc' }, take: 4, include: { exercises: { select: { id: true, answers: true }, orderBy: { position: 'asc' } } } })
const share = [1, 1, 0.62, 0.2]
let k = 0
for (const [i, unit] of units.entries()) {
  for (const ex of unit.exercises.slice(0, Math.round(unit.exercises.length * share[i]))) {
    await prisma.attempt.create({ data: { exerciseId: ex.id, studentId: student.id, answer: ex.answers[0] ?? '', correct: true, createdAt: ago(28 - (k++ % 27), k % 5) } })
  }
}

// Words from the lessons, some due for review today.
const words = [
  ['achieve', 'достигать', '/əˈtʃiːv/'], ['confident', 'уверенный', '/ˈkɑːnfɪdənt/'], ['deadline', 'крайний срок', '/ˈdedlaɪn/'],
  ['improve', 'улучшать', '/ɪmˈpruːv/'], ['in charge of', 'отвечать за', '/ɪn tʃɑːrdʒ əv/'], ['on the other hand', 'с другой стороны', '/ɑːn ði ˈʌðər hænd/'],
  ['reliable', 'надёжный', '/rɪˈlaɪəbl/'], ['run out of', 'закончиться (о запасе)', '/rʌn aʊt əv/'], ['straightforward', 'простой, понятный', '/ˌstreɪtˈfɔːrwərd/'],
  ['to be up to someone', 'зависеть от кого-то', '/tə bi ʌp tə/'], ['meanwhile', 'тем временем', '/ˈmiːnwaɪl/'], ['figure out', 'разобраться', '/ˈfɪɡjər aʊt/']
]
const set = await prisma.vocabSet.create({ data: { title: 'From my board', schoolId: teacher.schoolId, ownerId: student.id } })
for (const [i, [term, translation, transcription]] of words.entries()) {
  const card = await prisma.vocabCard.create({ data: { setId: set.id, term, translation, transcription, position: i, createdAt: ago(20 - i) } })
  if (i < 7) await prisma.cardReview.create({ data: { cardId: card.id, studentId: student.id, streak: i % 3 + 1, dueAt: i < 4 ? ago(0, 1) : new Date(Date.now() + 3 * day), lastResult: true } })
}

console.log(`Demo student ready: ${EMAIL} (classroom ${classroom.id}), teacher ${teacher.email}`)
await prisma.$disconnect()
