// Helpers for the TOEFL course data. Everything in data/toefl is written for
// this platform: the task types and timings follow the TOEFL iBT format used
// since 21 January 2026, but every text, script and question is our own.

// Deterministic shuffle: the same options always come out in the same order,
// so a re-import never moves answers under a student's feet.
function shuffle(list, seedText) {
  const out = [...list]
  let s = [...seedText].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 233280, 17)
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280
    const j = Math.floor((s / 233280) * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// A multiple-choice question; `answer` is the text of the right option. The
// data lists the right answer first for readability — options are shuffled here.
export function q(question, options, answer, explain = '') {
  if (!options.includes(answer)) throw new Error(`Answer "${answer}" is not among the options of "${question}"`)
  const shown = shuffle(options, question + options.join('|'))
  return { question, options: shown, answer: shown.indexOf(answer), explain }
}

// Complete the Words: every {{word}} loses its second half. Checks there
// are exactly ten gaps and none is a one-letter word.
export function cw(title, text, extra = {}) {
  const gaps = [...text.matchAll(/\{\{([^}]+)\}\}/g)].map((m) => m[1])
  if (gaps.length !== 10) throw new Error(`"${title}": ${gaps.length} gaps, expected 10`)
  for (const g of gaps) if (g.length < 2) throw new Error(`"${title}": gap "${g}" is too short`)
  return { task: 'complete-words', title, timeSec: 180, text, ...extra }
}

// Build a Sentence item: the reply's chunks in the right order.
export function bs(context, reply, { chunks, distractor, prefix, end, explain, alt } = {}) {
  const body = reply.replace(/[.?!]$/, '')
  const out = { context, chunks: chunks ?? body.split(' '), end: end ?? (reply.match(/[.?!]$/)?.[0] ?? '.') }
  if (prefix) out.prefix = prefix
  if (distractor) out.distractor = distractor
  if (explain) out.explain = explain
  if (alt) out.alt = alt
  const joined = [prefix, out.chunks.join(' ')].filter(Boolean).join(' ')
  if (joined !== body) throw new Error(`Build a Sentence: chunks "${joined}" ≠ "${body}"`)
  return out
}

export const html = (title, text) => ({ type: 'html', payload: { title, html: text } })
export const set = (payload) => ({ type: 'toefl', payload })

// Full-length simulation tests: the base test (one task of each kind per
// module) plus `extra` tasks of the same shape, merged so that each module
// keeps the exam's order of task types. Choose-a-Response and Build-a-Sentence
// extras join the existing task's items (one timer for the whole run). The
// writing/speaking task order is untouched, so saved work paths stay valid.
const ORDER = ['complete-words', 'daily-life', 'academic-passage', 'choose-response', 'conversation', 'announcement', 'academic-talk']
const SEC_PER_RESPONSE = 30
const SEC_PER_SENTENCE = 36

function mergeModule(base = [], extra = []) {
  const out = base.map((t) => ({ ...t }))
  for (const t of extra) {
    const same = t.task === 'choose-response' && out.find((b) => b.task === 'choose-response')
    if (same) same.items = [...same.items, ...t.items]
    else out.push(t)
  }
  for (const t of out) if (t.task === 'choose-response') t.timeSec = t.items.length * SEC_PER_RESPONSE
  // Stable sort by task type: Array.prototype.sort is stable.
  return out.sort((a, b) => ORDER.indexOf(a.task) - ORDER.indexOf(b.task))
}

export function extendTest(test, extra) {
  const sections = { ...test.sections }
  for (const s of ['reading', 'listening']) {
    const sec = { ...sections[s] }
    for (const m of ['routing', 'upper', 'lower']) sec[m] = mergeModule(sec[m], extra[s]?.[m])
    if (extra[s]?.intro) sec.intro = extra[s].intro
    sections[s] = sec
  }
  const w = { ...sections.writing }
  w.tasks = w.tasks.map((t) => {
    if (t.task !== 'build-sentence' || !extra.buildSentence) return t
    const items = [...t.items, ...extra.buildSentence]
    return { ...t, items, timeSec: items.length * SEC_PER_SENTENCE }
  })
  if (extra.writingIntro) w.intro = extra.writingIntro
  sections.writing = w
  return { ...test, minutes: extra.minutes ?? test.minutes, sections }
}

// Shared intros of the full-length tests.
export const FULL = {
  minutes: 90,
  reading: { intro: '<b>Reading</b> · about 30 minutes, about 50 questions. Module 1: two Complete the Words paragraphs, two Read in Daily Life texts and an academic passage. Module 2 is harder or easier depending on your results. Each task has its own timer.' },
  listening: { intro: '<b>Listening</b> · about 28 minutes, about 47 questions. Module 1, then Module 2 (harder or easier). Each recording plays only once — use headphones.' },
  writingIntro: '<b>Writing</b> · about 23 minutes. Build a Sentence (10 sentences, 6 minutes), then Write an Email (7 minutes) and an Academic Discussion post (10 minutes).',
}
