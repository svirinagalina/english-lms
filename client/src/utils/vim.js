// A small Vim for the Writing page: normal / insert / visual modes over the
// document's plain offsets. Pure — it reads the text and the cursor and
// returns what to do; Writing.jsx applies it through its own edit model, so
// tracked changes, undo and sharing work exactly as with ordinary typing.
//
// Supported: counts; h l j k w b e W B E 0 ^ $ gg G; i a I A o O; x X r s S
// D C J ~; d c y with a motion or doubled (dd cc yy); p P; u ⌃r; v V.

const isWord = (ch) => /[\p{L}\p{N}_’']/u.test(ch)
const isSpace = (ch) => ch === undefined || /\s/.test(ch)
const cls = (ch, big) => (isSpace(ch) ? 0 : big || isWord(ch) ? 1 : 2)

export const lineStart = (text, at) => text.lastIndexOf('\n', at - 1) + 1
export const lineEnd = (text, at) => { const n = text.indexOf('\n', at); return n === -1 ? text.length : n }
const firstNonBlank = (text, at) => { let i = lineStart(text, at); while (i < lineEnd(text, at) && /[ \t]/.test(text[i])) i++; return i }
// In normal mode the cursor sits on a character, never past the line's last.
export const clampNormal = (text, at) => Math.max(lineStart(text, at), Math.min(at, lineEnd(text, at) - 1))

function wordForward(text, at, big) {
  let i = at
  const c = cls(text[i], big)
  if (c) while (i < text.length && cls(text[i], big) === c) i++
  while (i < text.length && isSpace(text[i])) i++
  return i
}
function wordBack(text, at, big) {
  let i = at
  while (i > 0 && isSpace(text[i - 1])) i--
  const c = cls(text[i - 1], big)
  while (i > 0 && cls(text[i - 1], big) === c && c) i--
  return i
}
function wordEnd(text, at, big) {
  let i = at + 1
  while (i < text.length && isSpace(text[i])) i++
  const c = cls(text[i], big)
  while (i + 1 < text.length && cls(text[i + 1], big) === c) i++
  return Math.min(i, text.length)
}
function vertical(text, at, delta, goal) {
  let start = lineStart(text, at)
  const col = goal ?? at - start
  for (let n = 0; n < Math.abs(delta); n++) {
    if (delta > 0) { const e = lineEnd(text, start); if (e >= text.length) break; start = e + 1 }
    else { if (start === 0) break; start = lineStart(text, start - 1) }
  }
  return { at: Math.min(start + col, Math.max(start, lineEnd(text, start) - 1)), goal: col }
}

// Where a motion takes the cursor; `inclusive` motions (e, $) take the
// character under the end too when an operator uses them.
function motion(key, text, at, count, state) {
  let to = at
  switch (key) {
    case 'h': return { to: Math.max(lineStart(text, at), at - count) }
    case 'l': return { to: Math.min(lineEnd(text, at), at + count) }
    case 'j': case 'k': { const v = vertical(text, at, key === 'j' ? count : -count, state.goal); return { to: v.at, goal: v.goal, linewise: true } }
    case 'w': case 'W': for (let n = 0; n < count; n++) to = wordForward(text, to, key === 'W'); return { to }
    case 'b': case 'B': for (let n = 0; n < count; n++) to = wordBack(text, to, key === 'B'); return { to }
    case 'e': case 'E': for (let n = 0; n < count; n++) to = wordEnd(text, to, key === 'E'); return { to, inclusive: true }
    case '0': return { to: lineStart(text, at) }
    case '^': return { to: firstNonBlank(text, at) }
    case '$': return { to: Math.max(lineStart(text, at), lineEnd(text, at) - 1), inclusive: true }
    case 'G': return { to: state.count ? vertical(text, 0, count - 1, 0).at : lineStart(text, text.length), linewise: true }
    case 'gg': return { to: state.count ? vertical(text, 0, count - 1, 0).at : 0, linewise: true }
    default: return null
  }
}

export const initialVim = () => ({ mode: 'insert', pending: '', count: '', op: null, opCount: '', register: { text: '', linewise: false }, anchor: null, goal: null })

// One key in normal or visual mode. Returns { state, edits?, cursor?,
// select?, insert?, undo?, redo? } — edits are [start, end, text] applied in
// order on the current text; `cursor` is the offset after them.
export function vimKey(state, key, text, at) {
  const s = { ...state }
  const reset = () => { s.pending = ''; s.count = ''; s.op = null; s.opCount = '' }
  if (key === 'Escape') { reset(); if (s.mode === 'visual' || s.mode === 'vline') { s.mode = 'normal'; return { state: s, cursor: clampNormal(text, at) } } return { state: s } }

  // r<char>: replace under the cursor.
  if (s.pending === 'r') {
    reset()
    if (key.length !== 1 || at >= lineEnd(text, at)) return { state: s }
    return { state: s, edits: [[at, at + 1, key]], cursor: at }
  }
  if (/^[1-9]$/.test(key) || (key === '0' && s.count)) { s.count += key; return { state: s } }
  const count = Number(s.count || 1) * Number(s.opCount || 1)
  const visual = s.mode === 'visual' || s.mode === 'vline'

  if (key === 'g' && s.pending !== 'g') { s.pending = 'g'; return { state: s } }
  const name = s.pending === 'g' ? (key === 'g' ? 'gg' : null) : key
  s.pending = ''
  if (name === null) { reset(); return { state: s } }

  // A motion: move, extend a selection, or complete an operator.
  const m = motion(name, text, at, count, s)
  if (m) {
    s.goal = m.goal ?? null
    if (s.op) {
      const op = s.op
      const linewise = m.linewise || false
      let from = Math.min(at, m.to)
      let to = Math.max(at, m.to) + (m.inclusive ? 1 : 0)
      // cw behaves like ce, as in Vim.
      if (op === 'c' && (name === 'w' || name === 'W') && !isSpace(text[at])) {
        let i = at
        for (let n = 0; n < count; n++) {
          if (n) while (i < text.length && isSpace(text[i])) i++
          const c = cls(text[i], name === 'W')
          while (i < text.length && cls(text[i], name === 'W') === c) i++
        }
        to = i
      }
      if (linewise) { from = lineStart(text, from); to = Math.min(text.length, lineEnd(text, to) + 1) }
      reset()
      return operate(s, op, text, from, to, linewise)
    }
    s.count = ''
    if (visual) return { state: s, select: [s.anchor, m.to] }
    return { state: s, cursor: name === 'l' ? Math.min(m.to, Math.max(lineStart(text, at), lineEnd(text, at) - 1)) : m.to }
  }

  // Operators waiting for a motion; doubled = the whole line(s).
  if ('dcy'.includes(name) && name.length === 1) {
    if (visual) {
      const [a, b] = [Math.min(s.anchor, at), Math.max(s.anchor, at) + 1]
      const linewise = s.mode === 'vline'
      const from = linewise ? lineStart(text, a) : a
      const to = linewise ? Math.min(text.length, lineEnd(text, b - 1) + 1) : Math.min(b, text.length)
      s.mode = 'normal'; reset()
      return operate(s, name, text, from, to, linewise)
    }
    if (s.op === name) {
      const from = lineStart(text, at)
      const last = vertical(text, at, count - 1, 0).at
      const to = Math.min(text.length, lineEnd(text, last) + 1)
      reset()
      // cc keeps the (now empty) line to type on.
      if (name === 'c') return operate(s, 'c', text, from, Math.max(from, to - (text[to - 1] === '\n' ? 1 : 0)), false)
      return operate(s, name, text, from, to, true)
    }
    s.op = name; s.opCount = s.count; s.count = ''
    return { state: s }
  }

  reset()
  const eol = lineEnd(text, at)
  switch (name) {
    case 'i': s.mode = 'insert'; return { state: s, cursor: at }
    case 'a': s.mode = 'insert'; return { state: s, cursor: Math.min(at + 1, eol) }
    case 'I': s.mode = 'insert'; return { state: s, cursor: firstNonBlank(text, at) }
    case 'A': s.mode = 'insert'; return { state: s, cursor: eol }
    case 'o': s.mode = 'insert'; return { state: s, edits: [[eol, eol, '\n']], cursor: eol + 1 }
    case 'O': { s.mode = 'insert'; const ls = lineStart(text, at); return { state: s, edits: [[ls, ls, '\n']], cursor: ls } }
    case 'v': case 'V':
      if (s.mode === (name === 'v' ? 'visual' : 'vline')) { s.mode = 'normal'; return { state: s, cursor: at } }
      s.mode = name === 'v' ? 'visual' : 'vline'
      if (s.anchor === null || !visual) s.anchor = at
      return { state: s, select: [s.anchor, at] }
    case 'x': return at < eol ? operate(s, 'd', text, at, Math.min(eol, at + count), false) : { state: s }
    case 'X': { const from = Math.max(lineStart(text, at), at - count); return from < at ? operate(s, 'd', text, from, at, false) : { state: s } }
    case 's': s.mode = 'insert'; return { state: s, edits: [[at, Math.min(eol, at + count), '']], cursor: at }
    case 'S': return operate(s, 'c', text, lineStart(text, at), eol, false)
    case 'D': return operate(s, 'd', text, at, eol, false)
    case 'C': return operate(s, 'c', text, at, eol, false)
    case 'r': s.pending = 'r'; return { state: s }
    case '~': {
      const end = Math.min(eol, at + count)
      const swapped = [...text.slice(at, end)].map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join('')
      return { state: s, edits: [[at, end, swapped]], cursor: Math.min(end, Math.max(lineStart(text, at), eol - 1)) }
    }
    case 'J': {
      if (eol >= text.length) return { state: s }
      let next = eol + 1
      while (next < text.length && /[ \t]/.test(text[next])) next++
      return { state: s, edits: [[eol, next, ' ']], cursor: eol }
    }
    case 'p': case 'P': {
      const { text: reg, linewise } = s.register
      if (!reg) return { state: s }
      if (linewise) {
        const lines = reg.endsWith('\n') ? reg : reg + '\n'
        const chunk = lines.repeat(count)
        if (name === 'p' && eol >= text.length) return { state: s, edits: [[text.length, text.length, '\n' + chunk.slice(0, -1)]], cursor: text.length + 1 }
        const where = name === 'p' ? eol + 1 : lineStart(text, at)
        return { state: s, edits: [[where, where, chunk]], cursor: where }
      }
      const chunk = reg.repeat(count)
      const where = name === 'p' && at < eol ? at + 1 : at
      return { state: s, edits: [[where, where, chunk]], cursor: where + chunk.length - 1 }
    }
    case 'u': return { state: s, undo: count }
    default: return { state: s }
  }
}

function operate(s, op, text, from, to, linewise) {
  s.register = { text: text.slice(from, to), linewise }
  if (op === 'y') { s.mode = 'normal'; return { state: s, cursor: from } }
  if (op === 'c') { s.mode = 'insert'; return { state: s, edits: [[from, to, '']], cursor: from } }
  s.mode = 'normal'
  return { state: s, edits: [[from, to, '']], cursor: from, clamp: true }
}
