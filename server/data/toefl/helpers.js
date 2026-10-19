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
