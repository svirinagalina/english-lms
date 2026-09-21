// Fixes two exercises found by audit-exercise-content.js's no_blank_marker
// check: they were imported as FILL_BLANK with no "__" in the prompt, and
// their English answer had every space stripped ("Ihaveacar",
// "Iliketogotoworkonfoot") — a PDF-extraction glitch that hit exactly these
// two among the whole book (verified: no other FILL_BLANK or TRANSLATE
// exercise has a no-space answer longer than a real single word). Every
// neighboring exercise in the same units is a normal TRANSLATE with a
// properly spaced answer, so that's what these become too.
//
// Idempotent: matches on the exact broken prompt+answer pair; a no-op if
// already fixed.
//
//   node --env-file=.env scripts/fix-glued-translate-answers.js
//   DATABASE_URL=<prod-url> node scripts/fix-glued-translate-answers.js
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { PrismaClient } from '@prisma/client'

const here = dirname(fileURLToPath(import.meta.url))
const jsonFile = join(here, '..', 'data', 'englishtime.json')

const FIXES = [
  { chapter: 8, prompt: 'У меня есть машина.', brokenAnswer: 'Ihaveacar', fixedAnswer: 'I have a car' },
  { chapter: 32, prompt: 'Я люблю ходить на работу пешком.', brokenAnswer: 'Iliketogotoworkonfoot', fixedAnswer: 'I like to go to work on foot' }
]

// --- 1. data/englishtime.json (source; used by future re-imports) ----------

const book = JSON.parse(readFileSync(jsonFile, 'utf8'))
for (const unit of book) {
  for (const fix of FIXES) {
    const ex = unit.exercises?.find(e => e.prompt === fix.prompt && e.answers?.[0] === fix.brokenAnswer)
    if (ex) {
      ex.type = 'TRANSLATE'
      ex.answers = [fix.fixedAnswer]
      console.log(`  [json] "${fix.prompt}" -> TRANSLATE / "${fix.fixedAnswer}"`)
    }
  }
}
writeFileSync(jsonFile, JSON.stringify(book, null, 2) + '\n')

// --- 2. the database DATABASE_URL points at ---------------------------------

const prisma = new PrismaClient()
for (const fix of FIXES) {
  const exercise = await prisma.exercise.findFirst({
    where: { prompt: fix.prompt, answers: { has: fix.brokenAnswer } }
  })
  if (!exercise) {
    console.log(`  [db] "${fix.prompt}": not found in broken form (already fixed?), skipping`)
    continue
  }
  await prisma.exercise.update({
    where: { id: exercise.id },
    data: { type: 'TRANSLATE', answers: [fix.fixedAnswer] }
  })
  console.log(`  [db] "${fix.prompt}" (${exercise.id}): updated`)
}

await prisma.$disconnect()
console.log('\nDone.')
