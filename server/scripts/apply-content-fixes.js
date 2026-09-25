// Applies a reviewed list of textbook corrections (answer keys, task texts,
// theory) to the book file and to every school's imported copy of it.
// Each fix names the exact old text, so it only touches rows that still have
// it: safe to run again, and a row someone already corrected is left alone.
//
//   node --env-file=.env scripts/apply-content-fixes.js data/fixes/<file>.json [--dry-run]
//   (on the server: docker exec -w /app srv3-lms-app node scripts/apply-content-fixes.js ...)
import { readFileSync, writeFileSync } from 'fs'
import { PrismaClient } from '@prisma/client'
import { tagAnswer } from '../src/errorAnalysis.js'

const [file, flag] = process.argv.slice(2)
if (!file) { console.error('Usage: node scripts/apply-content-fixes.js <fixes.json> [--dry-run]'); process.exit(1) }
const dryRun = flag === '--dry-run'
const { exercises = [], theory = [] } = JSON.parse(readFileSync(file, 'utf8'))
const bookFile = new URL('../data/englishtime.json', import.meta.url)
const book = JSON.parse(readFileSync(bookFile, 'utf8'))
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// 1. The book file.
let bookChanged = 0
const tagsFor = new Map() // "chapter|new prompt" -> the chapter's own tags
for (const fix of exercises) {
  const unit = book.find((u) => u.chapter === fix.chapter)
  const row = unit?.exercises.find((e) => e.prompt === fix.prompt && same(e.answers, fix.answers))
  if (row) { row.prompt = fix.newPrompt; row.answers = fix.newAnswers; bookChanged++ }
  const current = unit?.exercises.find((e) => e.prompt === fix.newPrompt)
  if (current) tagsFor.set(`${fix.chapter}|${fix.newPrompt}`, current.tags)
}
for (const fix of theory) {
  const unit = book.find((u) => u.chapter === fix.chapter)
  if (unit?.theory?.includes(fix.find)) { unit.theory = unit.theory.replace(fix.find, fix.replace); bookChanged++ }
}
if (!dryRun) writeFileSync(bookFile, JSON.stringify(book, null, 2) + '\n')
console.log(`Book file: ${bookChanged} changes${dryRun ? ' (dry run)' : ''}`)

// 2. The database: every school's copy of the book.
const prisma = new PrismaClient()
let rows = 0
for (const fix of exercises) {
  const found = await prisma.exercise.findMany({
    where: { prompt: fix.prompt, answers: { equals: fix.answers }, unit: { position: fix.chapter } }
  })
  for (const row of found) {
    const chapterTags = tagsFor.get(`${fix.chapter}|${fix.newPrompt}`) ?? row.tags
    const tags = [...new Set([...chapterTags, ...tagAnswer(fix.newAnswers[0])])]
    if (!dryRun) await prisma.exercise.update({ where: { id: row.id }, data: { prompt: fix.newPrompt, answers: fix.newAnswers, tags } })
    rows++
  }
}
let theoryRows = 0
for (const fix of theory) {
  const units = await prisma.unit.findMany({ where: { position: fix.chapter, theory: { contains: fix.find } } })
  for (const unit of units) {
    if (!dryRun) await prisma.unit.update({ where: { id: unit.id }, data: { theory: unit.theory.replace(fix.find, fix.replace) } })
    theoryRows++
  }
}
console.log(`Database: ${rows} exercises, ${theoryRows} theory passages${dryRun ? ' (dry run)' : ''}`)
await prisma.$disconnect()
