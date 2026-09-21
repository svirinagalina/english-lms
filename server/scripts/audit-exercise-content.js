// Flags likely prompt/answer mismatches in the grammar-unit exercises: TRANSLATE
// exercises where the Russian prompt and the English answer(s) don't agree in
// person/number or negation (checked by the LLM — this is a semantic judgment,
// not something regex can reliably make), and FILL_BLANK exercises whose answer
// already appears in the prompt text (the "the the" duplication bug, checked
// deterministically) or that have no blank marker at all.
//
// Read-only: this only writes a report. It never edits Exercise rows — review
// reports/exercise-audit.md and fix flagged items by hand.
//
//   node --env-file=.env scripts/audit-exercise-content.js [options]
//
// Options:
//   --type=translate|fill_blank|all   which exercise types to check (default: all)
//   --limit=N                         only look at the first N exercises (smoke test)
//   --batch-size=N                    exercises per LLM call (default: 20)
//   --concurrency=N                   parallel LLM calls (default: 1)
//   --redo                            ignore cached LLM verdicts and recheck everything
//   --report-only                     skip the LLM pass; rebuild the report from the
//                                      cached .jsonl plus the deterministic FILL_BLANK checks
//
// Writes:
//   reports/exercise-audit.jsonl   one LLM verdict per line (cache, so a crashed or
//                                   rate-limited run can just be re-run to resume)
//   reports/exercise-audit.md      human-readable report of flagged exercises only
import { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { aiConfig, loadAiSettings } from '../src/settings.js'
import { structured } from '../src/llm.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const reportsDir = path.join(here, '..', 'reports')
fs.mkdirSync(reportsDir, { recursive: true })
const jsonlPath = path.join(reportsDir, 'exercise-audit.jsonl')
const mdPath = path.join(reportsDir, 'exercise-audit.md')

const args = process.argv.slice(2)
function flag(name, def = null) {
  const hit = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`))
  if (!hit) return def
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : true
}

const typeArg = flag('type', 'all')
const limit = flag('limit') ? Number(flag('limit')) : null
const batchSize = flag('batch-size') ? Number(flag('batch-size')) : 20
const concurrency = flag('concurrency') ? Number(flag('concurrency')) : 1
const redo = Boolean(flag('redo', false))
const reportOnly = Boolean(flag('report-only', false))

const wantedTypes =
  typeArg === 'translate' ? ['TRANSLATE'] : typeArg === 'fill_blank' ? ['FILL_BLANK'] : ['TRANSLATE', 'FILL_BLANK']

const prisma = new PrismaClient()

// --- deterministic checks (cheap, exact, no LLM) ---------------------------

// Only the word immediately touching the blank counts as a duplication —
// checking the whole sentence false-positives on short words ("the", "a")
// that legitimately recur elsewhere, e.g. "__ newspaper is on the table."
function deterministicFillBlankCheck(ex) {
  if (!ex.prompt.includes('__')) {
    return { issue: 'no_blank_marker', note: 'Тип FILL_BLANK, но в тексте нет пропуска "__" — похоже на испорченное или неверно типизированное упражнение.' }
  }
  const idx = ex.prompt.indexOf('__')
  const before = ex.prompt.slice(0, idx).trim().split(/\s+/).pop() || ''
  const after = ex.prompt.slice(idx + 2).trim().split(/\s+/)[0] || ''
  const clean = (s) => s.replace(/[^A-Za-z']/g, '').toLowerCase()
  const beforeWord = clean(before)
  const afterWord = clean(after)
  for (const answer of ex.answers) {
    const word = answer.trim().toLowerCase()
    if (!word) continue
    if (word === beforeWord || word === afterWord) {
      return {
        issue: 'duplicate_word_in_prompt',
        note: `Ответ "${answer}" совпадает со словом рядом с пропуском — после вставки слово повторится.`
      }
    }
  }
  return null
}

// --- LLM pass (semantic — person/number/negation, grammaticality) ----------

const VerdictSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      suspicious: z.boolean(),
      issue: z.string(),
      note: z.string()
    })
  )
})

const TRANSLATE_SYSTEM =
  'You proofread a Russian→English textbook\'s TRANSLATE exercises for an app that teaches English to Russian speakers. ' +
  'Each exercise gives a Russian sentence (what the student translates) and one or more accepted English answers, plus its grammar tags for context. ' +
  'Check ONLY whether the English answer(s) agree with the Russian prompt in grammatical person and number ' +
  '(Russian "я/мне/меня" is first person singular and must not become English "she/he/they/we/it"; ' +
  '"мы/нам" is first person plural and must not become "I/she/he/it"; watch third person singular vs plural too) ' +
  'and in negation/polarity (Russian "не"/"нет"/"ни" must show up in the English answer as "not"/"n\'t"/"never"/"no" etc., and an English negative must not appear when the Russian prompt is positive). ' +
  'Do not flag anything else — not tense, word choice, articles, or style — only genuine person/number or negation mismatches between the Russian prompt and the English answer. ' +
  'For every item in the input return one result with the same id: suspicious (true only for a real mismatch), ' +
  'issue ("person_number_mismatch", "negation_mismatch", "both", or "none"), and note — if suspicious, one short sentence in Russian quoting the Russian fragment and the English fragment that disagree; empty string otherwise.'

const FILL_BLANK_SYSTEM =
  'You proofread English FILL_BLANK grammar exercises for Russian-speaking learners. ' +
  'Each exercise gives the sentence with the blank marked "__", the accepted answer(s) meant to go in that blank, and its grammar tags for context. ' +
  'Insert the first accepted answer into the blank and judge whether the resulting sentence is grammatically correct, natural English that matches the intended grammar point. ' +
  'Flag it if it is not — wrong part of speech, a duplicated or missing word, or an answer that just does not fit that position — even if the tags suggest a different answer was intended. ' +
  'For every item in the input return one result with the same id: suspicious (true only if inserting the answer produces a bad sentence), ' +
  'issue ("ungrammatical", "wrong_answer_key", "other", or "none"), and note — if suspicious, one short sentence in Russian saying what is wrong and, if you can tell, what the correct answer for that blank probably is; empty string otherwise.'

async function judgeBatch(system, items) {
  const user = 'One exercise per line, as JSON:\n' + items.map((it) => JSON.stringify(it)).join('\n')
  const out = await structured({
    name: 'exercise_audit',
    schema: VerdictSchema,
    maxTokens: Math.min(4000, 300 + items.length * 120),
    system,
    user
  })
  return out?.items ?? []
}

// --- cache (resume support) --------------------------------------------------

function loadCache() {
  const cache = new Map()
  if (!fs.existsSync(jsonlPath)) return cache
  for (const line of fs.readFileSync(jsonlPath, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try {
      const row = JSON.parse(line)
      cache.set(row.id, row)
    } catch {
      // skip a corrupt line rather than aborting the whole cache
    }
  }
  return cache
}

const appendResult = (row) => fs.appendFileSync(jsonlPath, JSON.stringify(row) + '\n')

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function runPool(tasks, size) {
  let i = 0
  async function worker() {
    while (i < tasks.length) {
      const idx = i++
      await tasks[idx]()
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, tasks.length) }, worker))
}

// --- main --------------------------------------------------------------------

const exercises = await prisma.exercise.findMany({
  where: { type: { in: wantedTypes } },
  include: { unit: { select: { id: true, title: true, position: true } } },
  orderBy: [{ unit: { position: 'asc' } }, { position: 'asc' }]
})
const scoped = limit ? exercises.slice(0, limit) : exercises
console.log(`Loaded ${scoped.length} exercise(s) across ${new Set(scoped.map((e) => e.unitId)).size} unit(s).`)

const deterministic = new Map()
for (const ex of scoped) {
  if (ex.type === 'FILL_BLANK') {
    const det = deterministicFillBlankCheck(ex)
    if (det) deterministic.set(ex.id, det)
  }
}

const cache = redo ? new Map() : loadCache()

async function processType(type, system, mapItem) {
  const pool = scoped.filter((e) => e.type === type)
  const todo = pool.filter((e) => {
    if (type === 'FILL_BLANK' && !e.prompt.includes('__')) return false // nothing to judge without a blank
    if (redo) return true
    return !cache.has(e.id)
  })
  if (!todo.length) {
    console.log(`${type}: nothing new to send to the LLM.`)
    return
  }
  const batches = chunk(todo, batchSize)
  console.log(`${type}: checking ${todo.length} exercise(s) in ${batches.length} batch(es) of up to ${batchSize}.`)
  let done = 0
  const tasks = batches.map((batch) => async () => {
    let verdicts
    try {
      verdicts = await judgeBatch(system, batch.map(mapItem))
    } catch (err) {
      console.error(`  batch of ${batch.length} failed: ${err.message}`)
      return
    }
    const byId = new Map(verdicts.map((v) => [v.id, v]))
    for (const ex of batch) {
      const v = byId.get(ex.id)
      if (!v) {
        console.error(`  no verdict returned for ${ex.id}`)
        continue
      }
      const row = { id: ex.id, type: ex.type, suspicious: Boolean(v.suspicious), issue: v.issue || 'none', note: v.note || '' }
      appendResult(row)
      cache.set(ex.id, row)
    }
    done += batch.length
    console.log(`  ${done}/${todo.length} ${type} checked`)
  })
  await runPool(tasks, concurrency)
}

if (!reportOnly) {
  await loadAiSettings()
  if (!aiConfig()) {
    console.error('No AI key configured (Settings, or ANTHROPIC_API_KEY / OPENAI_API_KEY). Run with --report-only to skip the LLM pass, or set a key first.')
    process.exit(1)
  }
  if (wantedTypes.includes('TRANSLATE')) {
    await processType('TRANSLATE', TRANSLATE_SYSTEM, (e) => ({ id: e.id, ru: e.prompt, en: e.answers, tags: e.tags }))
  }
  if (wantedTypes.includes('FILL_BLANK')) {
    await processType('FILL_BLANK', FILL_BLANK_SYSTEM, (e) => ({ id: e.id, sentence: e.prompt, answer: e.answers, tags: e.tags }))
  }
}

// --- report --------------------------------------------------------------------

function mergedVerdict(ex) {
  const det = deterministic.get(ex.id)
  const llm = cache.get(ex.id)
  const notes = []
  if (det) notes.push(`[deterministic:${det.issue}] ${det.note}`)
  if (llm?.suspicious) notes.push(`[llm:${llm.issue}] ${llm.note}`)
  if (!notes.length) return null
  return notes.join(' ')
}

const flagged = []
for (const ex of scoped) {
  const note = mergedVerdict(ex)
  if (note) flagged.push({ ex, note })
}

const lines = []
lines.push('# Exercise content audit')
lines.push('')
lines.push(`Generated ${new Date().toISOString()}.`)
lines.push(`${flagged.length} suspected mismatch(es) out of ${scoped.length} exercise(s) checked (types: ${wantedTypes.join(', ')}).`)
lines.push('')
lines.push('Nothing was edited automatically. Review each item below and fix the exercise (and any wrong Attempt rows it produced) by hand.')
lines.push('')

let currentUnit = null
for (const { ex, note } of flagged) {
  if (ex.unit.id !== currentUnit) {
    currentUnit = ex.unit.id
    lines.push(`## ${ex.unit.title}`)
    lines.push('')
  }
  lines.push(`- **${ex.id}** (${ex.type}, tags: ${ex.tags.join(', ') || '—'})`)
  lines.push(`  - prompt: ${ex.prompt}`)
  lines.push(`  - answers: ${ex.answers.map((a) => `"${a}"`).join(', ')}`)
  lines.push(`  - ${note}`)
  lines.push('')
}

fs.writeFileSync(mdPath, lines.join('\n'))
console.log(`\nReport written: ${mdPath}`)
console.log(`${flagged.length} flagged out of ${scoped.length} checked.`)

await prisma.$disconnect()
