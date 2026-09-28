import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { isEnglishWord, lookupWord, wordAt } from '../utils/dictionary'
import WordCard from './WordCard'
import RegionCapture, { canCaptureScreen } from './RegionCapture'
import DictionaryPanel from './DictionaryPanel'
import { autocorrectWord } from '../utils/autocorrect'
import { isMisspelled, loadSpeller, obviousFix } from '../utils/spell'
import '../styles/writing.css'

// A shared writing document with tracked changes, Google-Docs style.
//
// The text is a list of runs: `base` is what stands, `ins` and `del` are
// the teacher's suggestions (green underline / red strikethrough) until
// someone accepts or rejects them. The student's own typing goes straight
// into base text; the teacher's typing is recorded as suggestions.
//
// Editing happens in a contentEditable whose native edits are intercepted
// (beforeinput) and replayed on the run model, so the marks stay exact.

// Besides kind/author a run can carry formatting that is never a
// suggestion: `h` (a heading line, listed in the outline) and `hl` (a
// highlighter colour).
const sameStyle = (a, b) => a.kind === b.kind && a.author === b.author && (a.h ?? 0) === (b.h ?? 0) && (a.hl ?? '') === (b.hl ?? '')

const normalise = (runs) => {
  const out = []
  for (const run of runs) {
    if (!run.text) continue
    const last = out[out.length - 1]
    if (last && run.kind !== 'image' && last.kind !== 'image' && sameStyle(last, run)) last.text += run.text
    else out.push({ ...run })
  }
  return out
}

const totalLength = (runs) => runs.reduce((n, r) => n + r.text.length, 0)
const fullText = (runs) => runs.map((r) => r.text).join('')
const plainText = (runs) => runs.filter((r) => r.kind !== 'del' && r.kind !== 'image').map((r) => r.text).join('')

// The run holding the character at `offset`.
function runAt(runs, offset) {
  let pos = 0
  for (const run of runs) {
    if (offset < pos + run.text.length) return run
    pos += run.text.length
  }
  return null
}

// The text of [start, end) as it reads: no struck text, no pictures.
function readableText(runs, start, end) {
  let pos = 0
  let out = ''
  for (const run of runs) {
    const from = Math.max(start, pos)
    const to = Math.min(end, pos + run.text.length)
    if (to > from && run.kind !== 'del' && run.kind !== 'image') out += run.text.slice(from - pos, to - pos)
    pos += run.text.length
  }
  return out
}
const countWords = (text) => (text.match(/[A-Za-zА-Яа-яЁё0-9’'-]+/g) ?? []).length

// New text continues the heading/highlight of the text it's typed into.
function inheritedStyle(runs, start, end, text) {
  if (text.includes('\n')) return {}
  const all = fullText(runs)
  const source = start > 0 && all[start - 1] !== '\n' ? runAt(runs, start - 1)
    : end < all.length && all[end] !== '\n' ? runAt(runs, end) : null
  if (!source || source.kind === 'image') return {}
  const style = {}
  if (source.h) style.h = source.h
  if (source.hl) style.hl = source.hl
  return style
}

// Sets (or clears, with null) formatting on [start, end).
function restyle(runs, start, end, patch) {
  const next = runs.map((r) => ({ ...r }))
  const from = splitAt(next, start)
  const to = splitAt(next, end)
  for (let i = from; i < to; i++) {
    const run = next[i]
    if (run.kind === 'image') continue
    for (const [key, value] of Object.entries(patch)) {
      if (value == null) delete run[key]
      else run[key] = value
    }
  }
  return normalise(next)
}

// Every heading line: its text and where it starts.
function outlineOf(runs) {
  const items = []
  let pos = 0
  let line = null
  runs.forEach((run, index) => {
    const parts = run.text.split('\n')
    parts.forEach((part, i) => {
      if (i > 0) { if (line) items.push(line); line = null }
      if (run.h && run.kind !== 'del' && run.kind !== 'image' && part) {
        if (!line) line = { offset: pos, index, text: '' }
        line.text += part
      }
      pos += part.length + (i < parts.length - 1 ? 1 : 0)
    })
  })
  if (line) items.push(line)
  return items.filter((item) => item.text.trim()).map((item) => ({ ...item, text: item.text.trim() }))
}

// Splits runs so that `offset` falls on a run boundary; returns the index.
function splitAt(runs, offset) {
  let pos = 0
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i]
    if (offset === pos) return i
    if (offset < pos + run.text.length) {
      const head = { ...run, text: run.text.slice(0, offset - pos) }
      const tail = { ...run, text: run.text.slice(offset - pos) }
      runs.splice(i, 1, head, tail)
      return i + 1
    }
    pos += run.text.length
  }
  return runs.length
}

// Applies an edit: replace [start, end) with `text`, as `actor` (teacher
// changes are tracked, student changes are plain).
function applyEdit(runs, start, end, text, actor) {
  const next = runs.map((r) => ({ ...r }))
  const from = splitAt(next, start)
  const to = splitAt(next, end)
  const removed = next.slice(from, to)
  const replacement = []

  for (const run of removed) {
    if (run.kind === 'image') continue // a screenshot is simply removed
    if (actor.tracked) {
      if (run.kind === 'ins' && run.author === actor.id) continue // own suggestion: really gone
      if (run.kind === 'del') { replacement.push(run); continue }  // already struck
      replacement.push({ text: run.text, kind: 'del', author: actor.id })
    } else if (run.kind !== 'del') {
      continue // the student really deletes; struck text stays struck
    } else {
      replacement.push(run)
    }
  }
  if (text) {
    const style = inheritedStyle(runs, start, end, text)
    replacement.push({ text, kind: actor.tracked ? 'ins' : 'base', author: actor.tracked ? actor.id : undefined, ...style })
  }

  next.splice(from, to - from, ...replacement)
  // Caret lands after the whole edit — past struck text too, so a
  // correction typed right after a deletion reads "~~old~~new".
  let caret = 0
  for (let i = 0; i < from; i++) caret += next[i].text.length
  for (const run of replacement) caret += run.text.length
  return { runs: normalise(next), caret }
}

// A settled suggestion becomes plain text but keeps its formatting.
const asBase = ({ author, ...run }) => ({ ...run, kind: 'base' })

function resolveAll(runs, accept) {
  return normalise(runs.flatMap((run) => {
    if (run.kind === 'base' || run.kind === 'image') return [run]
    if (run.kind === 'ins') return accept ? [asBase(run)] : []
    return accept ? [] : [asBase(run)]
  }))
}

function resolveOne(runs, index, accept) {
  const run = runs[index]
  if (!run || run.kind === 'base' || run.kind === 'image') return runs
  const next = runs.slice()
  if (run.kind === 'ins') next.splice(index, 1, ...(accept ? [asBase(run)] : []))
  else next.splice(index, 1, ...(accept ? [] : [asBase(run)]))
  return normalise(next)
}

// Backspace/Delete step over text that is already struck through, so a
// deleted line break can't trap the caret in front of it.
function skipStruck(runs, offset, direction) {
  let at = offset
  if (direction < 0) { while (at > 0 && runAt(runs, at - 1)?.kind === 'del') at-- }
  else { while (runAt(runs, at)?.kind === 'del') at++ }
  return at
}

// --- Caret ↔ text offsets in the contentEditable ------------------------------

function offsetOf(root, node, nodeOffset) {
  const range = document.createRange()
  range.setStart(root, 0)
  range.setEnd(node, nodeOffset)
  return range.toString().length
}

function selectionOffsets(root) {
  const selection = window.getSelection()
  if (!selection || !selection.rangeCount || !root.contains(selection.anchorNode)) return null
  const range = selection.getRangeAt(0)
  return {
    start: offsetOf(root, range.startContainer, range.startOffset),
    end: offsetOf(root, range.endContainer, range.endOffset)
  }
}

function setCaret(root, offset) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let remaining = offset
  let node = walker.nextNode()
  let last = null
  while (node) {
    if (remaining <= node.textContent.length) {
      const range = document.createRange()
      range.setStart(node, remaining)
      range.collapse(true)
      const selection = window.getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
      return
    }
    remaining -= node.textContent.length
    last = node
    node = walker.nextNode()
  }
  if (last) {
    const range = document.createRange()
    range.setStart(last, last.textContent.length)
    range.collapse(true)
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
  }
}

// --- Component -----------------------------------------------------------------

const IMAGE_CHAR = '\uFFFC'

export default function Writing({ socketRef, classroomId, user, title, subtitle, onClose, backLabel = '← Back', embedded = false, wordPicker = false }) {
  const [runs, setRuns] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [popover, setPopover] = useState(null)
  const editorRef = useRef(null)
  const caretRef = useRef(null)
  const runsRef = useRef(runs)
  runsRef.current = runs
  const historyRef = useRef({ undo: [], redo: [] })

  // Teachers suggest; students write.
  const actor = { id: user.id, tracked: user.role !== 'STUDENT' }

  const broadcast = useCallback((next) => {
    socketRef.current?.emit('doc:update', next)
  }, [socketRef])

  // True from the moment an edit is made until a reconnect settles it one
  // way or the other — a local edit that reached the server before a drop
  // would come back unchanged in that resync anyway, so there's no harm in
  // holding it up over a legitimate remote edit that arrived while briefly
  // offline (see the reconnect handling below, which is what actually cares
  // about this).
  const dirtyRef = useRef(false)

  const commit = useCallback((next, caret) => {
    const history = historyRef.current
    history.undo.push(runsRef.current)
    if (history.undo.length > 200) history.undo.shift()
    history.redo = []
    dirtyRef.current = true
    runsRef.current = next
    setRuns(next)
    caretRef.current = caret ?? null
    broadcast(next)
  }, [broadcast])

  // Load and follow the document over the socket.
  useEffect(() => {
    const socket = socketRef.current
    if (!socket || !classroomId) return
    setLoaded(false)
    const open = (quiet) => socket.emit('doc:open', classroomId, { quiet }, (response) => {
      if (response?.error) { setError(response.error); return }
      // A reconnect (quiet) whose local edits never got confirmed synced —
      // a deploy or a network blip dropped the socket mid-edit — used to
      // silently overwrite whatever was on screen with the server's older
      // copy, straight out from under someone still typing. Trust the
      // screen instead and make sure the server catches up with it; a
      // genuine remote edit made by the other side while this client was
      // briefly offline only wins when there was nothing unsynced here.
      if (quiet && dirtyRef.current) broadcast(runsRef.current)
      else setRuns(normalise(response.runs ?? []))
      dirtyRef.current = false
      setLoaded(true)
    })
    // After a reconnect the document is opened again, without leading others to it.
    let opened = false
    const reopen = () => { open(opened); opened = true }
    if (socket.connected) reopen()
    socket.on('connect', reopen)
    const onUpdate = ({ classroomId: id, runs: incoming, from }) => {
      if (id !== classroomId || from === socket.id) return
      // Keep the caret where it was in the text if the other side edited.
      const root = editorRef.current
      const sel = root ? selectionOffsets(root) : null
      caretRef.current = sel ? Math.min(sel.start, totalLength(incoming)) : null
      setRuns(normalise(incoming))
    }
    socket.on('doc:update', onUpdate)
    return () => { socket.off('connect', reopen); socket.off('doc:update', onUpdate) }
  }, [socketRef, classroomId])

  // Restore the caret after every re-render caused by an edit.
  useLayoutEffect(() => {
    const root = editorRef.current
    if (root && caretRef.current !== null && document.activeElement === root) {
      setCaret(root, caretRef.current)
    }
    caretRef.current = null
  })

  // The last place the caret was in the text, for tools that take focus
  // away (a file dialog, the screen picker) before they insert anything.
  const lastSelRef = useRef(null)
  const [selection, setSelection] = useState(null) // { start, end } while something is highlighted
  const [caretAt, setCaretAt] = useState(null) // the caret, while it's in the text
  useEffect(() => {
    const onChange = () => {
      const root = editorRef.current
      const sel = root ? selectionOffsets(root) : null
      if (sel) lastSelRef.current = sel
      setSelection(sel && sel.end > sel.start ? sel : null)
      setCaretAt(sel && sel.end === sel.start ? sel.end : null)
    }
    document.addEventListener('selectionchange', onChange)
    return () => document.removeEventListener('selectionchange', onChange)
  }, [])
  const currentSelection = () => {
    const root = editorRef.current
    return (root && selectionOffsets(root)) ?? lastSelRef.current
  }

  // Autocorrect: on for teachers by default, off for students (their
  // mistakes are the point of the exercise) — each can switch it.
  const autocorrectKey = `writing.autocorrect.${user.role === 'STUDENT' ? 'student' : 'staff'}`
  const [autocorrect, setAutocorrect] = useState(() => {
    try {
      const stored = localStorage.getItem(autocorrectKey)
      if (stored !== null) return stored === '1'
    } catch { /* storage unavailable */ }
    return user.role !== 'STUDENT'
  })
  // The dictionary behind the red underline and the one-letter fixes;
  // loaded the first time autocorrect is on.
  const [speller, setSpeller] = useState(null)
  useEffect(() => {
    if (!autocorrect || speller) return
    let live = true
    loadSpeller().then((sp) => live && setSpeller(() => sp)).catch(() => {})
    return () => { live = false }
  }, [autocorrect, speller])
  const spellCache = useRef(new Map())
  const misspelled = (word) => {
    if (!speller) return false
    let bad = spellCache.current.get(word)
    if (bad === undefined) {
      bad = isMisspelled(speller, word)
      if (spellCache.current.size > 20000) spellCache.current.clear()
      spellCache.current.set(word, bad)
    }
    return bad
  }
  // A run's text with every finished misspelled word wrapped for the red
  // underline. The word still being typed (the caret right at its end) is left alone.
  const withSpelling = (text, runStart, docText) => {
    if (!autocorrect || !speller) return text
    const parts = []
    let last = 0
    for (const m of text.matchAll(/[A-Za-z][A-Za-z']*/g)) {
      const end = runStart + m.index + m[0].length
      const after = docText[end]
      if (caretAt === end || /[A-Za-z']/.test(after ?? '') || !misspelled(m[0])) continue
      if (m.index > last) parts.push(text.slice(last, m.index))
      parts.push(<span key={m.index} className="spell-err">{m[0]}</span>)
      last = m.index + m[0].length
    }
    if (!parts.length) return text
    if (last < text.length) parts.push(text.slice(last))
    return parts
  }

  const toggleAutocorrect = () => {
    setAutocorrect((on) => {
      try { localStorage.setItem(autocorrectKey, on ? '0' : '1') } catch { /* storage unavailable */ }
      return !on
    })
  }

  // After a space, punctuation or Enter, fixes the word just finished —
  // only when it's the actor's own text, never someone else's.
  const autocorrectBefore = (runs, at) => {
    const all = fullText(runs)
    let from = at
    while (from > 0 && /[A-Za-z']/.test(all[from - 1])) from--
    const word = all.slice(from, at).replace(/^'+/, '')
    from = at - word.length
    if (!word || !/[A-Za-z]/.test(word)) return null
    for (let i = from; i < at; i++) {
      const run = runAt(runs, i)
      const own = actor.tracked ? run?.kind === 'ins' && run.author === actor.id : run?.kind === 'base'
      if (!own) return null
    }
    const before = all.slice(Math.max(0, from - 40), from)
    let fixed = autocorrectWord(word, before)
    // Beyond the list of common typos: one missing, extra or swapped letter
    // the dictionary is sure about.
    if (!fixed && speller) {
      const spelled = obviousFix(speller, word)
      if (spelled) fixed = autocorrectWord(spelled, before) ?? spelled
    }
    return fixed ? { from, to: at, fixed } : null
  }

  // React's synthetic onBeforeInput is a partial polyfill (insertText only,
  // not cancelable everywhere), so the native event is used instead.
  const beforeInputRef = useRef(null)
  useEffect(() => {
    const root = editorRef.current
    if (!root) return
    const listener = (event) => beforeInputRef.current?.(event)
    root.addEventListener('beforeinput', listener)
    return () => root.removeEventListener('beforeinput', listener)
  }, [])

  const handleBeforeInput = (event) => {
    const root = editorRef.current
    const sel = selectionOffsets(root)
    if (!sel) return
    // Every native edit is either replayed on the model or blocked: the
    // browser must never change the DOM on its own (bold, native undo…),
    // or the marks would drift away from the text.
    event.preventDefault()
    let { start, end } = sel
    // The browser says exactly what it meant to replace (a word for
    // Option+Backspace, the misspelling for an autocorrect).
    const target = event.getTargetRanges?.()[0]
    if (target && root.contains(target.startContainer)) {
      start = offsetOf(root, target.startContainer, target.startOffset)
      end = offsetOf(root, target.endContainer, target.endOffset)
    }
    let text = ''
    const type = event.inputType
    if (type === 'historyUndo') { undo(); return }
    if (type === 'historyRedo') { redo(); return }
    if (type === 'insertText' || type === 'insertCompositionText' || type === 'insertReplacementText') {
      text = event.data ?? event.dataTransfer?.getData('text/plain') ?? ''
    } else if (type === 'insertParagraph' || type === 'insertLineBreak') {
      text = '\n'
    } else if (type === 'insertFromPaste' || type === 'insertFromDrop') {
      text = event.dataTransfer?.getData('text/plain') ?? ''
    } else if (type === 'deleteContentBackward') {
      if (start === end) start = Math.max(0, start - 1)
    } else if (type === 'deleteContentForward') {
      if (start === end) end = Math.min(totalLength(runsRef.current), end + 1)
    } else if (!type.startsWith('delete')) {
      return // formatting and anything else: not for this editor
    }
    if (start === end && !text) return
    text = text.replace(/\r\n?/g, '\n')
    const result = applyEdit(runsRef.current, start, end, text, actor)
    commit(result.runs, result.caret)
    if (autocorrect && start === end && /^[\s.,!?;:)]$/.test(text)) {
      const fix = autocorrectBefore(result.runs, start)
      if (fix) {
        // A second step, so one ⌘Z brings the original word back.
        const corrected = applyEdit(result.runs, fix.from, fix.to, fix.fixed, actor)
        commit(corrected.runs, fix.from + fix.fixed.length + text.length)
      }
    }
  }
  beforeInputRef.current = handleBeforeInput

  // ⌘Z / ⇧⌘Z work on the model, since the browser's own undo is blocked.
  const undo = () => {
    const prev = historyRef.current.undo.pop()
    if (!prev) return
    historyRef.current.redo.push(runsRef.current)
    setRuns(prev); caretRef.current = null; broadcast(prev)
  }
  const redo = () => {
    const next = historyRef.current.redo.pop()
    if (!next) return
    historyRef.current.undo.push(runsRef.current)
    setRuns(next); caretRef.current = null; broadcast(next)
  }

  // Backspace and Delete are handled on keydown: it always fires, while some
  // browsers skip beforeinput for them in a contentEditable.
  const handleKeyDown = (event) => {
    if (event.key === 'Escape') { setPopover(null); return }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault()
      event.shiftKey ? redo() : undo()
      return
    }
    if ((event.key !== 'Backspace' && event.key !== 'Delete') || event.altKey || event.metaKey || event.ctrlKey) return
    const sel = selectionOffsets(editorRef.current)
    if (!sel) return
    event.preventDefault()
    let { start, end } = sel
    if (start === end) {
      if (event.key === 'Backspace') start = Math.max(0, skipStruck(runsRef.current, start, -1) - 1)
      else end = Math.min(totalLength(runsRef.current), skipStruck(runsRef.current, end, 1) + 1)
    }
    if (start === end) return
    const result = applyEdit(runsRef.current, start, end, '', actor)
    commit(result.runs, result.caret)
  }

  // A screenshot goes in at the caret on its own line, as a base run.
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)
  const insertImage = async (file, at = currentSelection()?.end ?? totalLength(runsRef.current)) => {
    if (!file || !file.type.startsWith('image/')) return
    setUploading(true)
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const { src } = await api.uploadWritingImage(classroomId, dataUrl)
      // The text may have changed while uploading; stay inside it.
      at = Math.min(at, totalLength(runsRef.current))
      const next = runsRef.current.map((r) => ({ ...r }))
      const index = splitAt(next, at)
      const before = next[index - 1]
      const after = next[index]
      const lead = before && !before.text.endsWith('\n') ? '\n' : ''
      const trail = after && after.text.startsWith('\n') ? '' : '\n'
      next.splice(index, 0, { text: lead, kind: 'base' }, { text: IMAGE_CHAR, kind: 'image', src }, { text: trail, kind: 'base' })
      commit(normalise(next), at + lead.length + 1 + trail.length)
      editorRef.current?.focus()
      requestAnimationFrame(() => {
        editorRef.current?.querySelector(`img[src="${src}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  const handlePaste = (event) => {
    const file = [...(event.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'))
    if (file) { event.preventDefault(); insertImage(file) }
  }

  const [capturing, setCapturing] = useState(null) // caret offset to insert at
  // The screenshot box: remembers where the caret was (or the end of the
  // selected lines) and takes a pasted or dropped picture for that spot.
  const [dropAt, setDropAt] = useState(null)
  const [dropOver, setDropOver] = useState(false)
  const openDrop = () => setDropAt((open) => (open !== null ? null : currentSelection()?.end ?? totalLength(runsRef.current)))
  const dropImage = (file) => {
    if (!file || !file.type.startsWith('image/')) return false
    const at = dropAt
    setDropAt(null)
    insertImage(file, at)
    return true
  }
  useEffect(() => {
    if (dropAt === null) return
    const onPaste = (event) => {
      const file = [...(event.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'))
      if (file) { event.preventDefault(); event.stopPropagation(); dropImage(file) }
    }
    const onKey = (event) => { if (event.key === 'Escape') setDropAt(null) }
    document.addEventListener('paste', onPaste, true)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('paste', onPaste, true); document.removeEventListener('keydown', onKey) }
  }) // eslint-disable-line react-hooks/exhaustive-deps
  const dropFileRef = useRef(null)
  const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)

  // Heading: the whole line(s) under the caret, toggled.
  const toggleHeading = () => {
    const sel = currentSelection()
    if (!sel) return
    const all = fullText(runsRef.current)
    const from = all.lastIndexOf('\n', sel.start - 1) + 1
    let to = all.indexOf('\n', Math.max(sel.end, from))
    if (sel.end > sel.start && all[sel.end - 1] === '\n') to = sel.end - 1
    if (to < 0) to = all.length
    if (to <= from) return
    const isHeading = [...all.slice(from, to)].every((ch, i) => ch === '\n' || runAt(runsRef.current, from + i)?.h)
    // Line breaks inside a multi-line selection stay plain.
    let next = runsRef.current
    let lineStart = from
    for (const line of all.slice(from, to).split('\n')) {
      if (line) next = restyle(next, lineStart, lineStart + line.length, { h: isHeading ? null : 1 })
      lineStart += line.length + 1
    }
    commit(next, sel.end)
  }

  // Highlighter: paints the selection; painting it again in the same
  // colour (or with the eraser) takes it off.
  const HIGHLIGHTS = ['yellow', 'green', 'pink', 'blue']
  const [marker, setMarker] = useState('yellow')
  const [markerMenu, setMarkerMenu] = useState(false)
  const highlight = (color) => {
    setMarkerMenu(false)
    const sel = currentSelection()
    if (!sel || sel.start === sel.end) return
    const already = color && [...fullText(runsRef.current).slice(sel.start, sel.end)].every((ch, i) => ch === '\n' || runAt(runsRef.current, sel.start + i)?.hl === color)
    commit(restyle(runsRef.current, sel.start, sel.end, { hl: color && !already ? color : null }), sel.end)
  }

  // Word count of the highlighted fragment (or, with nothing highlighted, the whole text).
  const [countOpen, setCountOpen] = useState(false)
  const selectedText = selection ? readableText(runs, selection.start, selection.end) : ''

  // The highlighted word or phrase goes into the vocabulary as one card:
  // the student's own, or (for the teacher) this classroom's student's.
  const [notice, setNotice] = useState('')
  const noticeTimer = useRef(null)
  const say = (text) => { setNotice(text); clearTimeout(noticeTimer.current); noticeTimer.current = setTimeout(() => setNotice(''), 4000) }
  const [addingTerm, setAddingTerm] = useState(false)
  const addToVocabulary = async (term) => {
    const clean = term.trim().replace(/\s+/g, ' ').replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, '')
    if (!clean) { say('Highlight an English word or phrase first'); return }
    if (clean.split(' ').length > 10) { say('That is too long for a card: up to 10 words'); return }
    setAddingTerm(true)
    try {
      const result = await api.addBoardWords([clean], classroomId)
      const where = result.student ? `${result.student}'s vocabulary` : 'your vocabulary'
      say(result.added ? `“${clean}” added to ${where}` : result.skipped?.length ? `No dictionary entry for “${clean}”` : `“${clean}” is already in ${where}`)
    } catch (err) {
      say(err.message)
    } finally {
      setAddingTerm(false)
    }
  }
  const [dictionaryOpen, setDictionaryOpen] = useState(false)

  const outline = useMemo(() => outlineOf(runs), [runs])
  const goToHeading = (item) => {
    const root = editorRef.current
    const el = root?.querySelector(`[data-run="${item.index}"]`)
    el?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    root?.focus({ preventScroll: true })
    if (root) setCaret(root, item.offset)
  }

  // A click on a mark offers accept/reject; anywhere else the browser's own
  // caret, double-click-word and triple-click-line behaviour applies.
  const handleClick = (event) => {
    const index = Number(event.target.closest?.('[data-run]')?.dataset.run ?? event.target.dataset?.run)
    const run = runsRef.current[index]
    if (!run || run.kind === 'base' || run.kind === 'image') { setPopover(null); return }
    const rect = event.target.getBoundingClientRect()
    const host = editorRef.current.parentElement.getBoundingClientRect()
    setPopover({ index, x: rect.left - host.left, y: rect.bottom - host.top + 6 })
  }

  const resolve = (index, accept) => {
    commit(resolveOne(runsRef.current, index, accept), null)
    setPopover(null)
  }

  // A student's double-click on a word opens its card ("Add to my words").
  const [wordCard, setWordCard] = useState(null)
  const handleDoubleClick = (event) => {
    if (!wordPicker) return
    const selection = window.getSelection()
    const node = selection?.anchorNode
    if (!node || node.nodeType !== Node.TEXT_NODE) return
    const found = wordAt(node.textContent, Math.min(selection.anchorOffset, node.textContent.length - 1))
    if (!found || !isEnglishWord(found.word)) return
    const host = editorRef.current.parentElement.getBoundingClientRect()
    setTip(null)
    setWordCard({ word: found.word.toLowerCase(), x: Math.max(8, Math.min(event.clientX - host.left, host.width - 300)), y: Math.max(8, Math.min(event.clientY - host.top + 14, host.height - 270)) })
  }

  // Hover dictionary over the document.
  const [tip, setTip] = useState(null)
  const tipTimer = useRef(null)
  const tipWordRef = useRef(null)
  const handleMouseMove = (event) => {
    let range = null
    if (document.caretRangeFromPoint) range = document.caretRangeFromPoint(event.clientX, event.clientY)
    else if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(event.clientX, event.clientY)
      if (pos) { range = { startContainer: pos.offsetNode, startOffset: pos.offset } }
    }
    const node = range?.startContainer
    const found = node && node.nodeType === Node.TEXT_NODE ? wordAt(node.textContent, Math.min(range.startOffset, node.textContent.length - 1)) : null
    const word = found?.word ?? null
    if (!word) { if (tipWordRef.current) { tipWordRef.current = null; clearTimeout(tipTimer.current); setTip(null) } return }
    if (word === tipWordRef.current) return
    tipWordRef.current = word
    clearTimeout(tipTimer.current)
    setTip(null)
    const host = editorRef.current.parentElement.getBoundingClientRect()
    const at = { x: event.clientX - host.left + 12, y: event.clientY - host.top + 18 }
    tipTimer.current = setTimeout(async () => {
      const entry = await lookupWord(word)
      if (tipWordRef.current === word && entry) setTip({ ...at, word, entry })
    }, 350)
  }

  const pending = runs.filter((r) => r.kind !== 'base').length
  const words = plainText(runs).trim().split(/\s+/).filter(Boolean).length

  return (
    <div className={`writing ${embedded ? 'embedded' : ''}`}>
      <div className="writing-bar">
        <div className="writing-title">
          {onClose && <button className="chip-back" onClick={onClose} title="Back">{backLabel}</button>}
          <strong>{title ?? 'Writing'}</strong>
          {subtitle && <span className="muted"> · {subtitle}</span>}
          <span className="muted writing-stats"> · {words} words{selectedText ? ` (${countWords(selectedText)} selected)` : ''}{pending ? ` · ${pending} suggestion${pending === 1 ? '' : 's'}` : ''}</span>
          {notice && <span className="writing-notice"> {notice}</span>}
        </div>
        <div className="row-actions">
          {pending > 0 && (
            <>
              <button className="tool accept" onClick={() => commit(resolveAll(runsRef.current, true), null)} title="Apply every correction to the text">Accept all changes</button>
              <button className="tool" onClick={() => commit(resolveAll(runsRef.current, false), null)} title="Discard every correction">Reject all</button>
            </>
          )}
          {/* mousedown is swallowed so the text selection survives the click. */}
          <span className="marker-tool">
            <button className={`tool ${countOpen ? 'active' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={() => setCountOpen((v) => !v)} title="How many words are in the highlighted fragment">Word count</button>
            {countOpen && (
              <span className="marker-menu word-count-menu" onMouseDown={(e) => e.preventDefault()}>
                {selectedText
                  ? <span><strong>{countWords(selectedText)}</strong> words · {selectedText.replace(/\s/g, '').length} characters (no spaces) in the selection</span>
                  : <span>Highlight a fragment to count it · the whole text: <strong>{words}</strong> words</span>}
              </span>
            )}
          </span>
          <button className="tool" onMouseDown={(e) => e.preventDefault()} onClick={() => addToVocabulary(selectedText)} disabled={addingTerm || !selectedText} title="Put the highlighted word or phrase into the vocabulary, as one card">
            {addingTerm ? 'Adding…' : '+ Vocabulary'}
          </button>
          {actor.tracked && (
            <button className={`tool ${dictionaryOpen ? 'active' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={() => setDictionaryOpen((v) => !v)} title="Dictionary: any word or phrase, Russian ⇄ English">Dictionary</button>
          )}
          <button className="tool" onMouseDown={(e) => e.preventDefault()} onClick={toggleHeading} title="Make the line a heading — it appears in the list on the left">Heading</button>
          <span className="marker-tool">
            <button className="tool" onMouseDown={(e) => e.preventDefault()} onClick={() => highlight(marker)} title="Highlight the selected text">
              <span className={`marker-swatch hl-${marker}`} />Marker
            </button>
            <button className="tool marker-more" onMouseDown={(e) => e.preventDefault()} onClick={() => setMarkerMenu((v) => !v)} title="Marker colour" aria-label="Marker colour">▾</button>
            {markerMenu && (
              <span className="marker-menu" onMouseDown={(e) => e.preventDefault()}>
                {HIGHLIGHTS.map((color) => (
                  <button key={color} className={`marker-swatch big hl-${color} ${color === marker ? 'on' : ''}`} onClick={() => { setMarker(color); highlight(color) }} title={color} aria-label={color} />
                ))}
                <button className="tool" onClick={() => highlight(null)} title="Remove highlighting from the selection">Clear</button>
              </span>
            )}
          </span>
          <button className={`tool ${autocorrect ? 'active' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={toggleAutocorrect} title="Fix common typos as you type (teh → the, i → I, capital letters) and underline misspellings">
            Autocorrect {autocorrect ? 'on' : 'off'}
          </button>
          <button className={`tool ${dropAt !== null ? 'active' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={openDrop} disabled={uploading} title="Put a screenshot where the caret is (or after the selected lines): paste it or drag it in">Screenshot</button>
          <button className="tool" onMouseDown={(e) => e.preventDefault()} onClick={() => fileInputRef.current?.click()} disabled={uploading} title="Insert a picture from a file (or just paste one)">
            {uploading ? 'Uploading…' : 'Image'}
          </button>
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => { insertImage(e.target.files?.[0]); e.target.value = '' }} />
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {dropAt !== null && (
        <div
          className={`writing-drop ${dropOver ? 'over' : ''}`}
          tabIndex={-1}
          ref={(el) => el?.focus({ preventScroll: true })}
          onDragOver={(e) => { e.preventDefault(); setDropOver(true) }}
          onDragLeave={() => setDropOver(false)}
          onDrop={(e) => { e.preventDefault(); setDropOver(false); dropImage(e.dataTransfer?.files?.[0]) }}
        >
          <strong>Paste a screenshot ({isMac ? '⌘V' : 'Ctrl+V'}) or drag it here</strong>
          <span className="muted">
            {isMac
              ? 'Take one of any area: Control ⌃ + Shift ⇧ + Command ⌘ + 4, drag over the part you need — it is copied, then press ⌘V.'
              : 'Take one of any area: Windows + Shift + S, drag over the part you need — it is copied, then press Ctrl+V.'}
            {' '}It goes where the caret was, or after the lines you selected.
          </span>
          <span className="row-actions">
            <button className="tool" onClick={() => dropFileRef.current?.click()}>Choose a file</button>
            {canCaptureScreen && <button className="tool" onClick={() => { const at = dropAt; setDropAt(null); setCapturing(at) }}>Capture a window…</button>}
            <button className="tool" onClick={() => setDropAt(null)}>Cancel</button>
          </span>
          <input ref={dropFileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => { dropImage(e.target.files?.[0]); e.target.value = '' }} />
        </div>
      )}

      <div className="writing-body">
      {outline.length > 0 && (
        <nav className="writing-outline" aria-label="Headings">
          <div className="writing-outline-title">Contents</div>
          {outline.map((item) => (
            <button key={item.offset} className="writing-outline-item" onClick={() => goToHeading(item)} title={item.text}>{item.text}</button>
          ))}
        </nav>
      )}
      <div className="writing-page-wrap" onClick={(e) => { if (e.target === e.currentTarget) setPopover(null) }}>
        <div
          ref={editorRef}
          className="writing-page notranslate"
          translate="no"
          contentEditable={loaded}
          suppressContentEditableWarning
          spellCheck={false}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => { tipWordRef.current = null; clearTimeout(tipTimer.current); setTip(null) }}
          onDrop={(e) => { const f = e.dataTransfer?.files?.[0]; if (f) { e.preventDefault(); insertImage(f) } }}
          data-placeholder={actor.tracked ? 'The student has not written anything yet.' : 'Write your text here…'}
        >
          {(() => { let at = 0; const doc = fullText(runs); return runs.map((run, index) => { const start = at; at += run.text.length; return run.kind === 'image' ? (
            // The placeholder character keeps text offsets honest; the picture is decoration.
            <span key={index} data-run={index} className="run image" contentEditable={false}>
              <img src={run.src} alt="" draggable={false} />
              <span className="obj">{run.text}</span>
            </span>
          ) : (
            <span key={index} data-run={index} className={`run ${run.kind}${run.h ? ' h1' : ''}${run.hl ? ` hl-${run.hl}` : ''}`}>
              {/* A struck line break is shown as ↵ (same length), so the lines it joins already read as joined. */}
              {run.kind === 'del' ? run.text.replace(/\n/g, '↵') : withSpelling(run.text, start, doc)}
            </span>
          ) }) })()}
          {/* A line break at the very end only shows (and takes the caret) with something after it. */}
          {fullText(runs).endsWith('\n') && <br />}
        </div>

        {wordCard && <WordCard word={wordCard.word} x={wordCard.x} y={wordCard.y} onClose={() => setWordCard(null)} />}
        {tip && !wordCard && (
          <div className="writing-popover word-tip" style={{ left: tip.x, top: tip.y }}>
            <span><strong>{tip.word}</strong>{tip.entry.transcription ? ` ${tip.entry.transcription}` : ''} — {tip.entry.translation}</span>
          </div>
        )}
        {popover && (
          <div className="writing-popover" style={{ left: popover.x, top: popover.y }}>
            <span className="muted">{runs[popover.index]?.kind === 'ins' ? 'Suggested insertion' : 'Suggested deletion'}</span>
            <button className="tool" onClick={() => resolve(popover.index, true)}>Accept</button>
            <button className="tool" onClick={() => resolve(popover.index, false)}>Reject</button>
          </div>
        )}
      </div>
      </div>

      {dictionaryOpen && <DictionaryPanel onClose={() => setDictionaryOpen(false)} onAdd={(term) => addToVocabulary(term)} />}

      {capturing !== null && (
        <RegionCapture
          onCancel={() => setCapturing(null)}
          onDone={(file) => { const at = capturing; setCapturing(null); insertImage(file, at) }}
        />
      )}

      <div className="writing-hint muted">
        {actor.tracked
          ? 'Type to suggest: your insertions show green, deletions strike through. Click a mark to accept or reject it.'
          : 'Your teacher’s corrections appear as marks. Click one to accept or reject it, or use Accept all.'}
      </div>
    </div>
  )
}
