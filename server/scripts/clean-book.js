// Repairs artefacts the PDF extraction left in data/englishtime.json:
// a drop-cap "Т" split from its word ("Т ебеследует"), hyphenated line
// breaks ("по- пал"), theory paragraphs glued to the last exercise of a
// section, and a few chapters whose answer key slipped out of line.
// Safe to run more than once.
//
//   node scripts/clean-book.js
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const here = dirname(fileURLToPath(import.meta.url))
const file = join(here, '..', 'data', 'englishtime.json')
const book = JSON.parse(readFileSync(file, 'utf8'))

// Words that lost their first letter to a drop cap, longest first so
// "Тебе" wins over "Те".
const T_WORDS = ['Технологии', 'Телевизор', 'Тейлоры', 'Телефон', 'Теперь', 'Только',
  'Тебе', 'Тебя', 'Тетя', 'Тейт', 'Темза', 'Тома', 'Тому', 'Том']

const THEORY_MARKERS = /(Например|употребл|артикл|глагол|структур|предлог|Использовани|Обобщ|Кроме того|Различн|правил|ПРИЛОЖЕНИЯ|Помните|Обратите внимание|местоимен|наклонени|конструкци|Отдельную|Важным моментом|Не путайте|Для того чтобы)/

const sentences = (text) => text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [text]

function fixPrompt(prompt, answer) {
  let text = prompt

  text = text.replace(/(^|[\s(«"])Т ([а-яё]+)/g, (match, lead, rest) => {
    const glued = 'Т' + rest
    const word = T_WORDS.find((w) => glued.startsWith(w))
    if (!word) return match
    const tail = glued.slice(word.length)
    return lead + word + (tail ? ' ' + tail : '')
  })

  // "по- пал" is a line break inside a word; "два- три" is a real hyphen.
  text = text.replace(/([а-яё])- ([а-яё])/g, (match, a, b) => {
    const left = text.slice(0, text.indexOf(match) + 1).match(/[а-яё]+$/)?.[0] ?? ''
    return /^(два|три|один|одна|пять|десять|сорок)$/.test(left) ? `${a}-${b}` : a + b
  })

  text = text
    .replace(/,([А-Яа-яё])/g, ', $1')
    .replace(/\?—/g, '? —')
    .replace(/\s+/g, ' ')
    .trim()

  // A theory paragraph glued after the sentence: keep as many sentences as
  // the reference answer has, drop the rest.
  const parts = sentences(text)
  const keep = Math.max(1, sentences(answer ?? '').length)
  if (parts.length > keep) {
    const rest = parts.slice(keep).join(' ')
    if (text.length > 200 || THEORY_MARKERS.test(rest)) text = parts.slice(0, keep).join(' ')
  }
  return text
}

const T_WORDS_EN = ['Technology', 'Tomorrow', 'Today', 'Two', 'Tom', 'To']

function fixAnswer(answer) {
  return answer
    .replace(/(^|\s)T ([a-z]+)/g, (match, lead, rest) => {
      const glued = 'T' + rest
      const word = T_WORDS_EN.find((w) => glued.startsWith(w))
      if (!word) return match
      const tail = glued.slice(word.length)
      return lead + word + (tail ? ' ' + tail : '')
    })
    .replace(/([?!.,])([A-Za-z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
}

const MANUAL_PROMPTS = {
  'Тыдолжен посмотреть этотфильм, он тебе понравится.': 'Ты должен посмотреть этот фильм, он тебе понравится.',
  'Can I have __ slice of pizza? I have __ slice of pizza?': 'Can I have __ slice of pizza?'
}

for (const unit of book) {
  for (const exercise of unit.exercises) {
    exercise.prompt = MANUAL_PROMPTS[exercise.prompt] ?? fixPrompt(exercise.prompt, exercise.answers[0])

    // Two full sentences separated by " / " are two accepted answers.
    exercise.answers = exercise.answers.map(fixAnswer).flatMap((answer) => {
      const halves = answer.split(/\s\/\s?/)
      if (halves.length === 2 && halves.every((h) => h.trim().split(/\s+/).length >= 5)) {
        return halves.map((h) => h.trim())
      }
      return [answer]
    })
  }
}

// --- Chapter-specific repairs ------------------------------------------------

const chapter = (n) => book.find((u) => u.chapter === n)

// Ch. 2: two blanks were written as one word in the key.
for (const exercise of chapter(2).exercises) {
  if (exercise.answers[0] === 'athe') exercise.answers = ['a, the']
}

// Ch. 28: the key has two stray lines (answers to sentences the book does
// not print), which pushed every later answer one and then two places down.
{
  const unit = chapter(28)
  const stray = new Set([11, 45])
  if (unit.exercises[12]?.answers[0]?.startsWith('He mihgt')) {
    const answers = unit.exercises.map((e) => e.answers).filter((_, i) => !stray.has(i))
    unit.exercises = unit.exercises.slice(0, answers.length)
    unit.exercises.forEach((e, i) => { e.answers = answers[i] })
    // Only the first sentence of these keys belongs to the prompt.
    for (const e of unit.exercises) {
      if (/^(You should have called Petrov|Your friend should have gone)/.test(e.answers[0])) {
        e.answers = [sentences(e.answers[0])[0]]
      }
    }
  }
  for (const e of unit.exercises) {
    e.answers = e.answers.map((a) => a.replace('He mihgt', 'He might').replace('brough ', 'brought ').replace('pronounciation', 'pronunciation').replace('Your sun', 'Your son'))
  }
}

// Ch. 31: one key line belongs to an exercise the book does not print.
for (const exercise of chapter(31).exercises) {
  if (exercise.prompt === 'Давай поставим стол в центр кухни.') {
    exercise.answers = ["Let's put the table in the center of the kitchen", "Let's put the table in the centre of the kitchen"]
  }
}

// Ch. 35: the table of contents ran into the last exercise.
for (const exercise of chapter(35).exercises) {
  exercise.prompt = exercise.prompt.replace(/\s*ПРИЛОЖЕНИЯ.*$/s, '')
  exercise.answers = exercise.answers.map((a) => a.replace(/\s*ОГЛАВЛЕНИЕ.*$/s, ''))
}

for (const unit of book) unit.exercises.forEach((e, i) => { e.position = i })

writeFileSync(file, JSON.stringify(book, null, 2) + '\n')
const total = book.reduce((n, u) => n + u.exercises.length, 0)
console.log(`Cleaned ${total} exercises in ${book.length} chapters`)
