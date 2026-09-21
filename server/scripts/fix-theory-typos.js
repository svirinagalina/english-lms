// Fixes two theory-text bugs found during a content review, both missed by
// clean-book.js because its fixer only touches a unit's theory when it still
// has a raw `-\n` line break — these units had already been flattened to one
// line, so the corruption underneath was never touched:
//
//  1. A "Т " drop-cap split ("Т оесть" -> "То есть", "Т огдав" -> "Тогда в", ...)
//     left over in 9 units, same family of PDF-extraction bug as clean-book.js's
//     T_WORDS list, just with words that list doesn't cover.
//  2. Unit 4 ("МЕСТОИМЕНИЕ IT")'s four-item list (Weather/Time/Dates/Distance)
//     glued into one 1600-character run-on paragraph instead of one paragraph
//     per item (a student reported this as unreadable).
//
// Idempotent: each fix looks for its exact broken substring and is a no-op if
// it's not there, so it's safe to run again (e.g. once against the local DB,
// once against production).
//
//   node --env-file=.env scripts/fix-theory-typos.js
//   DATABASE_URL=<prod-url> node scripts/fix-theory-typos.js
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { PrismaClient } from '@prisma/client'

const here = dirname(fileURLToPath(import.meta.url))
const jsonFile = join(here, '..', 'data', 'englishtime.json')

// chapter number (= Unit.position) -> literal find/replace pairs
const DROP_CAP_FIXES = {
  2: [['Т оесть если на столе', 'То есть если на столе']],
  3: [
    ['Т огдав качестве', 'Тогда в качестве'],
    ['Т оесть формула', 'То есть формула']
  ],
  11: [
    ['Т емне менее', 'Тем не менее'],
    ['Т оже самое с taste:', 'То же самое с taste:']
  ],
  13: [['Т оесть для нас', 'То есть для нас']],
  20: [['Т огдапервый глагол', 'Тогда первый глагол']],
  22: [['Т ема,которая', 'Тема, которая']],
  26: [['Т оже самое касается', 'То же самое касается']],
  32: [['Т оесть мы говорим', 'То есть мы говорим']]
}

// Chapter 4: both its drop-cap fixes plus breaking the glued list into one
// paragraph per item (the client renders each \n\n-separated chunk as its own
// <p>, see client/src/pages/UnitPractice.jsx).
const CHAPTER_4_THEORY =
  'В отличие от русского языка, где мы можем сказать «холодно» и это будет нормальным и полным предложением, в английском так делать нельзя. Здесь уже мы скажем It is cold, где it будет выполнять функцию подлежащего, а is — сказуемого. Либо «Здесь интересно работать» — опять же, нам понадобится it в качестве подлежащего: It is interesting to work here. Можно выделить четыре основных случая, когда вместо подлежащего в английском предложении используется it:\n\n' +
  '— Погода. Например, It is cold today. Отметим, что слова rain и snow в английском чаще используются как глаголы. Поэтому мы поставим на место субъекта it, а затем один из этих глаголов. То есть у нас получится Does it rain here often? (Здесь часто идет дождь?). Или It snows here a lot (Здесь выпадает много снега).\n\n' +
  '— Время. И вопросе What time is it? (Сколько времени?), и в указаниях на конкретный момент по времени мы используем it: It is five o’clock (Сейчас пять вечера).\n\n' +
  '— Даты. Особенно важно помнить, что слово today редко используется в качестве подлежащего, то есть предложение «Сегодня ее день рождения» мы переведем как It is her birthday today. То же самое касается указаний на число, день недели или сезон. Например, It is the third of April today (Сегодня третье апреля), It is finally Summer! (Наконец-то лето!). What day is it today? (Какой сегодня день?). It is Wednesday (Среда).\n\n' +
  '— Расстояния. Фразу «Отсюда до аэропорта 10 километров» мы переведем It is ten kilometers from here to the airport. Не забудьте, что «как далеко» мы переводим через how far. Например, мы можем спросить How far is it from here to the airport? (Как далеко отсюда до аэропорта?).'

function applyDropCapFixes(theory, chapter, label) {
  let text = theory
  for (const [find, replace] of DROP_CAP_FIXES[chapter] ?? []) {
    const count = text.split(find).length - 1
    if (count === 0) {
      console.log(`  [${label}] ch.${chapter}: "${find}" not found (already fixed?), skipping`)
      continue
    }
    if (count > 1) {
      console.log(`  [${label}] ch.${chapter}: "${find}" appears ${count} times, skipping to be safe`)
      continue
    }
    text = text.replace(find, replace)
    console.log(`  [${label}] ch.${chapter}: fixed "${find}" -> "${replace}"`)
  }
  return text
}

// --- 1. data/englishtime.json (source; used by future re-imports) ----------

const book = JSON.parse(readFileSync(jsonFile, 'utf8'))
for (const unit of book) {
  if (unit.chapter === 4) {
    if (unit.theory !== CHAPTER_4_THEORY) {
      unit.theory = CHAPTER_4_THEORY
      console.log('  [json] ch.4: rewrote theory (drop-cap fixes + list reformatted)')
    } else {
      console.log('  [json] ch.4: already fixed, skipping')
    }
  } else if (DROP_CAP_FIXES[unit.chapter]) {
    unit.theory = applyDropCapFixes(unit.theory, unit.chapter, 'json')
  }
}
writeFileSync(jsonFile, JSON.stringify(book, null, 2) + '\n')

// --- 2. the database DATABASE_URL points at ---------------------------------

const prisma = new PrismaClient()
const chapters = [...Object.keys(DROP_CAP_FIXES).map(Number), 4]
const units = await prisma.unit.findMany({ where: { position: { in: chapters } }, select: { id: true, position: true, theory: true } })

for (const unit of units) {
  const next = unit.position === 4 ? CHAPTER_4_THEORY : applyDropCapFixes(unit.theory, unit.position, 'db')
  if (next !== unit.theory) {
    await prisma.unit.update({ where: { id: unit.id }, data: { theory: next } })
    console.log(`  [db] ch.${unit.position} (${unit.id}): updated`)
  } else {
    console.log(`  [db] ch.${unit.position} (${unit.id}): no change`)
  }
}

await prisma.$disconnect()
console.log('\nDone.')
