// Imports the textbook into a school. Re-running updates the previous import
// in place, keeping students' attempts.
//
//   node --env-file=.env scripts/import-book.js <schoolId> [path-to-json]
import { readFileSync } from 'fs'
import { PrismaClient } from '@prisma/client'
import { tagAnswer } from '../src/errorAnalysis.js'

const prisma = new PrismaClient()

const [schoolId, file = 'data/englishtime.json'] = process.argv.slice(2)

if (!schoolId) {
  console.error('Usage: node scripts/import-book.js <schoolId> [file]')
  process.exit(1)
}

const school = await prisma.school.findUnique({ where: { id: schoolId } })
if (!school) {
  console.error(`School ${schoolId} not found`)
  process.exit(1)
}

const units = JSON.parse(readFileSync(file, 'utf8'))
console.log(`Importing ${units.length} units into "${school.name}"`)

// A previous import is updated in place, exercise by exercise, so students
// keep their attempts and progress when the book text is corrected.
let exerciseCount = 0

for (const unit of units) {
  const data = {
    title: `${unit.chapter}. ${unit.title}`,
    theory: unit.theory || null,
    position: unit.chapter
  }
  const existing = await prisma.unit.findFirst({
    where: { schoolId, position: unit.chapter },
    include: { exercises: { select: { id: true, position: true } } }
  })
  const unitRow = existing
    ? await prisma.unit.update({ where: { id: existing.id }, data })
    : await prisma.unit.create({ data: { ...data, schoolId } })

  const byPosition = new Map((existing?.exercises ?? []).map((e) => [e.position, e.id]))

  for (const exercise of unit.exercises) {
    const row = {
      type: exercise.type,
      prompt: exercise.prompt,
      answers: exercise.answers,
      // Chapter tag plus grammar tags derived from the reference answer, so
      // a mistake classified as e.g. "articles" can pull drills from any chapter.
      tags: [...new Set([...exercise.tags, ...tagAnswer(exercise.answers[0])])],
      position: exercise.position
    }
    const id = byPosition.get(exercise.position)
    if (id) {
      await prisma.exercise.update({ where: { id }, data: row })
      byPosition.delete(exercise.position)
    } else {
      await prisma.exercise.create({ data: { ...row, unitId: unitRow.id } })
    }
  }
  // Exercises the corrected book no longer has.
  if (byPosition.size) {
    await prisma.exercise.deleteMany({ where: { id: { in: [...byPosition.values()] } } })
  }

  exerciseCount += unit.exercises.length
  process.stdout.write(`  ${unit.chapter}. ${unit.title.slice(0, 40)} — ${unit.exercises.length}\n`)
}

// Units that are not in the book any more (a re-parse with fewer chapters).
await prisma.unit.deleteMany({
  where: { schoolId, position: { notIn: units.map((u) => u.chapter) } }
})

console.log(`\nDone: ${units.length} units, ${exerciseCount} exercises`)
await prisma.$disconnect()
