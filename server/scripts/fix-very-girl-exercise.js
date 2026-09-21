// Fixes the one audit finding that needed Galina's call rather than a guess
// (server/reports/exercise-audit.md, chapter 2): "She __ the very girl I saw
// yesterday." with answer "the" produced a duplicate "the the" once filled.
// Her decision: drop the extra "the" from the prompt so the blank is the
// only "the" — "She is __ very girl I saw yesterday." (the blank also needed
// "is" added, since without it the sentence had no verb once "the" moved
// into the blank).
//
// Idempotent: matches the exact broken prompt; a no-op if already fixed.
//
//   node --env-file=.env scripts/fix-very-girl-exercise.js
//   DATABASE_URL=<prod-url> node scripts/fix-very-girl-exercise.js
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { PrismaClient } from '@prisma/client'

const here = dirname(fileURLToPath(import.meta.url))
const jsonFile = join(here, '..', 'data', 'englishtime.json')

const BROKEN_PROMPT = 'She __ the very girl I saw yesterday.'
const FIXED_PROMPT = 'She is __ very girl I saw yesterday.'

// --- 1. data/englishtime.json (source; used by future re-imports) ----------

const book = JSON.parse(readFileSync(jsonFile, 'utf8'))
for (const unit of book) {
  const ex = unit.exercises?.find(e => e.prompt === BROKEN_PROMPT)
  if (ex) {
    ex.prompt = FIXED_PROMPT
    console.log(`  [json] ch.${unit.chapter}: "${BROKEN_PROMPT}" -> "${FIXED_PROMPT}"`)
  }
}
writeFileSync(jsonFile, JSON.stringify(book, null, 2) + '\n')

// --- 2. the database DATABASE_URL points at ---------------------------------

const prisma = new PrismaClient()
const exercise = await prisma.exercise.findFirst({ where: { prompt: BROKEN_PROMPT } })
if (!exercise) {
  console.log(`  [db] not found in broken form (already fixed?), skipping`)
} else {
  await prisma.exercise.update({ where: { id: exercise.id }, data: { prompt: FIXED_PROMPT } })
  console.log(`  [db] (${exercise.id}): updated`)
}

await prisma.$disconnect()
console.log('\nDone.')
