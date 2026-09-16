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
  text = text.replace(/([а-яё])- ([а-яё])/g, (match, a, b, offset) => {
    const before = text.slice(0, offset + 2)
    return keepsHyphen(before, text.slice(offset + 3)) ? `${a}-${b}` : a + b
  })

  // English prompts (fill-in exercises) suffer the same drop-cap split.
  if (!/[а-яё]/i.test(text)) text = fixAnswer(text)

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

// A hyphen at a line end is usually a break inside a word, but "по-\nанглийски"
// and "кто-\nто" are real hyphens.
const HYPHEN_PREFIX = /(^|\s)(по|кто|что|как|где|когда|куда|какой|какая|какие|каком|кого|чем|чему|чей|чья|чьи|откуда|отчего|почему|сколько|два|три|один|одна|пять|десять|сорок)-$/i
const keepsHyphen = (before, after) => HYPHEN_PREFIX.test(before) || /^(то|нибудь|либо)\b/.test(after)

// Theory came out of the PDF as hard-wrapped lines with hyphenated breaks.
// Rebuild paragraphs: join the lines, mend "изу-\nчении", and start a new
// paragraph where a sentence ends on a visibly short line.
function reflowTheory(text) {
  if (!text) return text
  const lines = text.split('\n').map((line) => line.trim())
  const lengths = lines.map((l) => l.length).filter((n) => n > 20).sort((a, b) => a - b)
  const fullLine = lengths[Math.floor(lengths.length * 0.9)] ?? 60
  const paragraphs = []
  let current = ''
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line) { if (current) { paragraphs.push(current); current = '' } continue }
    const next = lines[i + 1] ?? ''
    if (current.endsWith('-') && /^[а-яёa-z]/.test(line)) {
      current = keepsHyphen(current, line) ? current + line : current.slice(0, -1) + line
    }
    else current = current ? `${current} ${line}` : line
    const endsSentence = /[.!?:»)]$/.test(line)
    const short = line.length < fullLine * 0.8
    const nextStartsFresh = /^([А-ЯЁA-Z!«]|\d)/.test(next)
    if (endsSentence && (short || /^!/.test(next)) && nextStartsFresh) { paragraphs.push(current); current = '' }
  }
  if (current) paragraphs.push(current)
  return paragraphs
    .map((p) => fixAnswer(p.replace(/(^|[\s(«"])Т ([а-яё]+)/g, (m, lead, rest) => {
      const glued = 'Т' + rest
      const word = T_WORDS.find((w) => glued.startsWith(w))
      return word ? lead + word + (glued.slice(word.length) ? ' ' + glued.slice(word.length) : '') : m
    })).replace(/([а-яё])- ([а-яё])/g, (m, a, b, offset, whole) => keepsHyphen(whole.slice(0, offset + 2), whole.slice(offset + 3)) ? `${a}-${b}` : a + b))
    .join('\n\n')
}

const MANUAL_PROMPTS = {
  'Тыдолжен посмотреть этотфильм, он тебе понравится.': 'Ты должен посмотреть этот фильм, он тебе понравится.',
  'Can I have __ slice of pizza? I have __ slice of pizza?': 'Can I have __ slice of pizza?'
}

for (const unit of book) {
  // Hyphenated line breaks mark text still hard-wrapped from the PDF.
  if (unit.theory && /-\n[а-яё]/.test(unit.theory)) unit.theory = reflowTheory(unit.theory)
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

// Ch. 1, 7, 32: slips in the printed key — a wrong word, or a line from
// another exercise where this one's answer should be.
const KEY_FIXES = {
  'На полу игрушки.': ['There are toys on the floor'],
  'Я гулял в парке три часа.': ['I was walking in the park for 3 hours', 'I was walking in the park for three hours'],
  'На полке есть несколько книг.': ['There are some books on the shelf', 'There are several books on the shelf'],
  'Мы долго думали, куда пойти, и в конце концов решили поужинать дома.': ['We thought for a long time about where to go and in the end decided to have dinner at home', 'We were thinking for a long time where to go and in the end we decided to have dinner at home']
}
for (const unit of book) {
  for (const exercise of unit.exercises) {
    if (KEY_FIXES[exercise.prompt]) exercise.answers = KEY_FIXES[exercise.prompt]
  }
}

// Ch. 11: a stray key line at #50 pushed the answers of #50–79 down by one,
// and the answer of #80 ("Is it raining now?") fell off the end of the run.
{
  const unit = chapter(11)
  const at = unit.exercises.findIndex((e) => e.prompt.startsWith('Какой любимый цветок'))
  if (at !== -1 && unit.exercises[at].answers[0].startsWith('Who do these gloves')) {
    for (let i = at; i < at + 30; i++) unit.exercises[i].answers = unit.exercises[i + 1].answers
    unit.exercises[at + 30].answers = ['Is it raining now?']
  }
}

// Ch. 31, #192–200: the key split one two-sentence answer over two lines,
// lost two answers and gained a stray line, so this run is rebuilt by hand.
{
  const unit = chapter(31)
  const at = unit.exercises.findIndex((e) => e.prompt.startsWith('Май — пятый месяц'))
  if (at !== -1 && unit.exercises[at + 1].answers[0].startsWith('Saturday is')) {
    const ex = unit.exercises
    const old = ex.map((e) => e.answers)
    ex[at].answers = ['May is the fifth month in a year. Saturday is the sixth day in a week']
    ex[at + 1].answers = old[at + 2]   // What is the day today? It is the ninth of May
    ex[at + 2].answers = old[at + 3]   // The third lesson today is English
    ex[at + 3].answers = old[at + 4]   // After school I usually go home
    ex[at + 4].answers = ['I usually come home at a quarter to five', 'I usually get home at a quarter to five']
    ex[at + 6].answers = ['I get up early in the morning, go to the bathroom, turn on the water and wash my face']
    ex[at + 7].answers = old[at + 6]   // I have lunch after the third lesson
    ex[at + 8].answers = old[at + 7]   // There is a new school on the corner of the street
  }
}

// Ch. 34, #15–40: the key printed this block rotated — the answers of
// #15–24 sit at #31–40 and those of #25–40 at #15–30.
{
  const unit = chapter(34)
  const at = unit.exercises.findIndex((e) => e.prompt.startsWith('Это женщина, чей сын'))
  if (at !== -1 && unit.exercises[at].answers[0].startsWith('She likes people')) {
    const old = unit.exercises.map((e) => e.answers)
    for (let i = at; i < at + 10; i++) unit.exercises[i].answers = old[i + 16]
    for (let i = at + 10; i < at + 26; i++) unit.exercises[i].answers = old[i - 10]
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
