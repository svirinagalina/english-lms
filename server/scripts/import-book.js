// Imports the textbook into a school. Re-running replaces its previous import.
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

// Remove a previous import of the same book so re-running stays idempotent.
const removed = await prisma.unit.deleteMany({ where: { schoolId } })
if (removed.count) console.log(`Removed ${removed.count} existing units`)

let exerciseCount = 0

for (const unit of units) {
  await prisma.unit.create({
    data: {
      schoolId,
      title: `${unit.chapter}. ${unit.title}`,
      theory: unit.theory || null,
      position: unit.chapter,
      exercises: {
        create: unit.exercises.map((exercise) => ({
          type: exercise.type,
          prompt: exercise.prompt,
          answers: exercise.answers,
          // Chapter tag plus grammar tags derived from the reference answer, so
          // a mistake classified as e.g. "articles" can pull drills from any chapter.
          tags: [...new Set([...exercise.tags, ...tagAnswer(exercise.answers[0])])],
          position: exercise.position
        }))
      }
    }
  })
  exerciseCount += unit.exercises.length
  process.stdout.write(`  ${unit.chapter}. ${unit.title.slice(0, 40)} — ${unit.exercises.length}\n`)
}

console.log(`\nDone: ${units.length} units, ${exerciseCount} exercises`)
await prisma.$disconnect()
