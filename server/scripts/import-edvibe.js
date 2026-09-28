#!/usr/bin/env node
// Imports an Edvibe course export (course.json + lessons/*.json + media/)
// as one course: every Edvibe exercise becomes a lesson block, in Edvibe's
// order (theory, video, test, choose-in-text, drag words, word order,
// columns, image). Re-runnable: the course with the same title in the same
// skillset is replaced. Writes IMPORT_REPORT.md next to the export with
// everything that has no marked answer — never guessed.
//
//   node --env-file=.env scripts/import-edvibe.js <export-dir> <schoolId> [--title "..."] [--skillset "..."] [--dry-run]
//
// Images are copied to client/public/course-media/<slug>/ and served from
// /course-media/<slug>/…; they ship with the client build.
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : fallback
}
const [exportDir, schoolId] = args.filter((a, i) => !a.startsWith('--') && !(args[i - 1] ?? '').startsWith('--'))
const TITLE = flag('--title', 'General English B1-B2')
const SKILLSET = flag('--skillset', 'General English')
const DRY = args.includes('--dry-run')
const NO_MEDIA = args.includes('--no-media') // on the server: images ship with the client build
if (!exportDir || !schoolId) {
  console.error('Usage: node scripts/import-edvibe.js <export-dir> <schoolId> [--title "..."] [--skillset "..."] [--dry-run]')
  process.exit(1)
}

const slug = TITLE.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const here = path.dirname(fileURLToPath(import.meta.url))
const mediaOut = path.resolve(here, '../../client/public/course-media', slug)
const mediaUrl = (file) => `/course-media/${slug}/${path.basename(file)}`

// --- text clean-up ------------------------------------------------------------
// Edvibe's gap ids, entities and the only formatting worth keeping: bold,
// italic, line breaks. Everything else (spans, their inline colours) goes.
const decode = (s) => s
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&ldquo;|&rdquo;/g, '"')
  .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&hellip;/g, '…')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
const stripIds = (s) => s.replace(/<em class="hide-id-exercise-item">[^<]*<\/em>/g, '')
// Limited markup the client renders itself (no innerHTML): **bold**, _italic_ → kept as
// <b>, <i>, <br> only.
function cleanHtml(html) {
  let s = stripIds(String(html ?? ''))
  s = s.replace(/<br\s*\/?>/gi, '\n')
  s = s.replace(/<\s*(b|strong)\b[^>]*>/gi, '<b>').replace(/<\/\s*(b|strong)\s*>/gi, '</b>')
  s = s.replace(/<\s*(em|i)\b[^>]*>/gi, '<i>').replace(/<\/\s*(em|i)\s*>/gi, '</i>')
  s = s.replace(/<(?!\/?(b|i)>)[^>]*>/g, '') // every other tag
  s = decode(s).replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n')
  s = s.replace(/<(b|i)>(\s*)<\/\1>/g, '$2')
  return s.replace(/\n{3,}/g, '\n\n').trim()
}
// Typos in the Edvibe source, fixed on Galina's say-so.
const TYPOS = [[/\bInifinitives\b/g, 'Infinitives']]
const plain = (s) => TYPOS.reduce((t, [re, to]) => t.replace(re, to), cleanHtml(s).replace(/<\/?(b|i)>/g, ''))

// Answers Edvibe left unmarked (listed in IMPORT_REPORT.md), decided with
// Galina 2026-09-28. Choices in text: per lesson:exercise, in the order the
// unmarked brackets appear — the answer, and a corrected option list where
// the source had a typo that left no grammatical option. Tests: question → answer.
const MARKED_SELECT = {
  '21:3': [
    { answer: 'I arrive at' }, { answer: 'will check' },
    { options: ['I will meet', 'I meet'], answer: 'I meet' },
    { answer: 'will have' },
    { options: ['will be working', 'will have been working'], answer: 'will have been working' },
    { answer: 'goes' }, { answer: 'will finish' }, { answer: 'will visit' },
    { options: ['I will return', 'I return'], answer: 'I return' },
    { options: ['leaves', 'will leave'], answer: 'leaves' },
    { answer: 'will arrive' }, { answer: 'will have finished' }, { answer: 'will expand' },
    { answer: 'will have been working' },
  ],
  '43:4': [{ answer: '-' }],
}
const MARKED_TEST = {
  'Кто пил из моей чашки?': 'Who has been drinking from my cup?',
  'Она посетила 6 стран': 'She has visited 6 countries',
  'Когда я буду в Париже, я тебе позвоню': 'When I am in Paris, I will call you',
  'Если ты будешь больше заниматься, ты сдашь экзамен': 'If you study more, you will pass the exam',
  'By the time you)_______, I _____________ my homework.': 'arrive / will have finished',
  'They like': 'both correct',
}

// A seeded shuffle, so a re-run gives the same order (and the order is
// never the answer itself when that can be avoided).
function shuffle(list, seed) {
  const a = [...list]
  let x = Math.abs(Number(seed) || 1) % 2147483647 || 1
  const rnd = () => (x = (x * 48271) % 2147483647) / 2147483647
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  if (a.length > 1 && a.every((w, i) => w === list[i])) a.push(a.shift())
  return a
}

// --- converters: Edvibe exercise → block -------------------------------------
const report = []
const note = (lesson, ex, what, text) => report.push({ lesson: lesson.order, title: lesson.title, number: ex.number, what, text })

// "text [a/b*] text" → ["text ", { options, correct }, " text"]
function selectParts(text, lesson, ex) {
  let unmarked = 0
  const s = cleanHtml(text)
  const parts = []
  let last = 0
  for (const m of s.matchAll(/\[([^\]]*)\]/g)) {
    if (m.index > last) parts.push(s.slice(last, m.index))
    const raw = m[1].split('/').map((o) => o.trim()).filter(Boolean)
    let correct = raw.findIndex((o) => o.includes('*'))
    let options = raw.map((o) => o.replace(/\*/g, '').trim())
    if (correct < 0) {
      const fix = (MARKED_SELECT[`${lesson.order}:${ex.number}`] ?? [])[unmarked++]
      if (fix) {
        options = fix.options ?? options
        correct = options.findIndex((o) => o === fix.answer)
      }
    }
    if (correct < 0) note(lesson, ex, 'Выбор в тексте: не отмечен правильный вариант', `[${options.join(' / ')}]`)
    parts.push({ options, correct: correct < 0 ? null : correct })
    last = m.index + m[0].length
  }
  if (last < s.length) parts.push(s.slice(last))
  return parts
}

function convert(ex, lesson) {
  const d = ex.data ?? {}
  const title = plain(ex.title || '')
  switch (ex.type) {
    case 28:
      return { type: 'html', payload: { title, html: cleanHtml(d.Text?.Text) } }
    case 3:
      return (d.Videos ?? []).filter((v) => v.Link).map((v) => {
        const id = v.Link.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/)?.[1]
        return { type: 'video', payload: id ? { youtubeId: id, title: plain(v.Text || title) } : { url: v.Link, title: plain(v.Text || title) } }
      })
    case 5: {
      const questions = (d.Test?.Questions ?? []).map((q) => {
        let correct = (q.QuestionAnswers ?? []).map((a, i) => (a === 'true' ? i : -1)).filter((i) => i >= 0)
        const options = (q.Answers ?? []).map(plain)
        const decided = MARKED_TEST[plain(q.Question)]
        if (!correct.length && decided) correct = options.map((o, i) => (o.replace(/\s+/g, ' ') === decided ? i : -1)).filter((i) => i >= 0)
        if (!correct.length) note(lesson, ex, 'Тест: не отмечен правильный ответ', `${plain(q.Question)} — ${options.join(' / ')}`)
        return { question: plain(q.Question), options, correct }
      })
      return { type: 'choice', payload: { title, questions } }
    }
    case 10: case 13:
      return { type: 'select-text', payload: { title, texts: (d.QuestionWithCodingTexts ?? []).map((t) => ({ question: t.Question ? plain(t.Question) : null, parts: selectParts(t.Text, lesson, ex) })) } }
    case 18: {
      const s = cleanHtml(d.PasteWordByDrag?.Text)
      const parts = []
      const answers = []
      let last = 0
      for (const m of s.matchAll(/\[([^\]]*)\]/g)) {
        if (m.index > last) parts.push(s.slice(last, m.index))
        const answer = decode(m[1]).trim()
        answers.push(answer)
        parts.push({ gap: answers.length - 1 })
        last = m.index + m[0].length
      }
      if (last < s.length) parts.push(s.slice(last))
      if (!answers.length) note(lesson, ex, 'Пропуски: в тексте нет ни одного пропуска', s.slice(0, 120))
      return { type: 'drag-words', payload: { title, parts, answers, bank: shuffle(answers, ex.id) } }
    }
    case 15:
      return {
        type: 'word-order',
        payload: {
          title,
          items: (d.QuestionWithCodingTexts ?? []).map((t) => {
            const words = plain(t.Text).split('/').map((w) => w.trim()).filter(Boolean)
            const order = (t.SortIndexes ?? []).filter((i) => i < words.length)
            const shown = order.length === words.length ? order.map((i) => words[i]) : shuffle(words, t.Id)
            return { words, shown }
          }),
        },
      }
    case 19: {
      const groups = (d.GroupWordsByColumns?.Items ?? []).map((g) => ({ name: plain(g.Group), words: plain(g.Words).split('/').map((w) => w.trim()).filter(Boolean) }))
      return { type: 'groups', payload: { title, groups, bank: shuffle(groups.flatMap((g) => g.words), ex.id) } }
    }
    case 27:
      return (ex.images ?? []).map((img, i) => ({ type: 'image', payload: { file: img.UrlFull || img.Url, caption: plain(d.Descriptions?.[i] || title) } }))
    case 25:
      return []
    default:
      note(lesson, ex, `Неизвестный тип упражнения ${ex.type} (${ex.typeName}) — пропущено`, '')
      return []
  }
}

// --- read the export ------------------------------------------------------------
const course = JSON.parse(fs.readFileSync(path.join(exportDir, 'course.json'), 'utf8'))
const lessons = course.lessons.map((l) => {
  const data = JSON.parse(fs.readFileSync(path.join(exportDir, l.file), 'utf8'))
  const blocks = []
  for (const section of data.sections) {
    for (const ex of section.exercises) {
      const out = convert(ex, data)
      for (const b of [out].flat()) blocks.push({ ...b, position: blocks.length })
    }
  }
  return { position: l.order, title: plain(data.title), blocks }
})

// Media: only what the lessons use; image blocks point at the served copy.
const used = new Set()
for (const l of lessons) for (const b of l.blocks) if (b.type === 'image') {
  used.add(b.payload.file)
  b.payload = { url: mediaUrl(b.payload.file), caption: b.payload.caption }
}

// --- checks -----------------------------------------------------------------------
const exercises = lessons.reduce((n, l) => n + l.blocks.length, 0)
const json = JSON.stringify(lessons)
const leftovers = [...json.matchAll(/https?:\/\/[^"\s]*edvibe[^"\s]*/g)].map((m) => m[0])
const markers = (json.match(/hide-id-exercise-item|##\d{6,}##/g) ?? []).length
console.log(`Lessons: ${lessons.length}, blocks: ${exercises}, images: ${used.size}, edvibe links: ${leftovers.length}, id markers left: ${markers}`)

const lines = [
  `# Импорт «${TITLE}» из Edvibe — отчёт`,
  '',
  `Уроков: ${lessons.length}. Блоков: ${exercises}. Картинок: ${used.size}. Ссылок на edvibe.com в данных: ${leftovers.length}.`,
  '',
  report.length ? `## Нужно решение Галины (${report.length})` : '## Всё отмечено — вопросов нет',
  '',
  'Ничего не угадано: у этих вопросов в Edvibe не отмечен правильный ответ. Сейчас платформа покажет их без проверки («ответ не отмечен»).',
  '',
  ...report.map((r) => `- Урок ${r.lesson} «${r.title}», упражнение ${r.number}: ${r.what}${r.text ? ` — ${r.text}` : ''}`),
]
fs.writeFileSync(path.join(exportDir, 'IMPORT_REPORT.md'), lines.join('\n') + '\n')
console.log(`Report: ${path.join(exportDir, 'IMPORT_REPORT.md')} (${report.length} items)`)
if (DRY) process.exit(0)

if (!NO_MEDIA) fs.mkdirSync(mediaOut, { recursive: true })
if (!NO_MEDIA) for (const f of used) fs.copyFileSync(path.join(exportDir, f), path.join(mediaOut, path.basename(f)))

const { prisma } = await import('../src/db.js')
try {
  const skillset = await prisma.skillset.upsert({
    where: { schoolId_name: { schoolId, name: SKILLSET } },
    update: {},
    create: { schoolId, name: SKILLSET },
  })
  await prisma.course.deleteMany({ where: { skillsetId: skillset.id, title: TITLE } })
  const created = await prisma.course.create({ data: { skillsetId: skillset.id, title: TITLE, description: 'Grammar and practice, B1 → B2 · 53 lessons' } })
  for (const l of lessons) {
    const lesson = await prisma.courseLesson.create({ data: { courseId: created.id, position: l.position, title: l.title, type: 'lesson' } })
    await prisma.courseLessonBlock.createMany({ data: l.blocks.map((b) => ({ lessonId: lesson.id, position: b.position, type: b.type, payload: b.payload })) })
  }
  console.log(`Course "${TITLE}" (${created.id}) in skillset "${SKILLSET}"`)
} finally {
  await prisma.$disconnect()
}
