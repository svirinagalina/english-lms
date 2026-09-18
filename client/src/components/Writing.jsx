import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { api } from '../api'
import { lookupWord, wordAt } from '../utils/dictionary'
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

const normalise = (runs) => {
  const out = []
  for (const run of runs) {
    if (!run.text) continue
    const last = out[out.length - 1]
    if (last && run.kind !== 'image' && last.kind === run.kind && last.kind !== 'image' && last.author === run.author) last.text += run.text
    else out.push({ ...run })
  }
  return out
}

const totalLength = (runs) => runs.reduce((n, r) => n + r.text.length, 0)
const plainText = (runs) => runs.filter((r) => r.kind !== 'del' && r.kind !== 'image').map((r) => r.text).join('')

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
  if (text) replacement.push({ text, kind: actor.tracked ? 'ins' : 'base', author: actor.tracked ? actor.id : undefined })

  next.splice(from, to - from, ...replacement)
  // Caret lands after the whole edit — past struck text too, so a
  // correction typed right after a deletion reads "~~old~~new".
  let caret = 0
  for (let i = 0; i < from; i++) caret += next[i].text.length
  for (const run of replacement) caret += run.text.length
  return { runs: normalise(next), caret }
}

function resolveAll(runs, accept) {
  return normalise(runs.flatMap((run) => {
    if (run.kind === 'base' || run.kind === 'image') return [run]
    if (run.kind === 'ins') return accept ? [{ text: run.text, kind: 'base' }] : []
    return accept ? [] : [{ text: run.text, kind: 'base' }]
  }))
}

function resolveOne(runs, index, accept) {
  const run = runs[index]
  if (!run || run.kind === 'base' || run.kind === 'image') return runs
  const next = runs.slice()
  if (run.kind === 'ins') next.splice(index, 1, ...(accept ? [{ text: run.text, kind: 'base' }] : []))
  else next.splice(index, 1, ...(accept ? [] : [{ text: run.text, kind: 'base' }]))
  return normalise(next)
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

export default function Writing({ socketRef, classroomId, user, title, subtitle, onClose, embedded = false }) {
  const [runs, setRuns] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [popover, setPopover] = useState(null)
  const editorRef = useRef(null)
  const caretRef = useRef(null)
  const runsRef = useRef(runs)
  runsRef.current = runs

  // Teachers suggest; students write.
  const actor = { id: user.id, tracked: user.role !== 'STUDENT' }

  const broadcast = useCallback((next) => {
    socketRef.current?.emit('doc:update', next)
  }, [socketRef])

  const commit = useCallback((next, caret) => {
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
      setRuns(normalise(response.runs ?? []))
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
    event.preventDefault()
    let { start, end } = sel
    let text = ''
    switch (event.inputType) {
      case 'insertText':
      case 'insertCompositionText':
        text = event.data ?? ''
        break
      case 'insertParagraph':
      case 'insertLineBreak':
        text = '\n'
        break
      case 'insertFromPaste':
      case 'insertFromDrop': {
        text = event.dataTransfer?.getData('text/plain') ?? ''
        break
      }
      case 'deleteContentBackward':
        if (start === end) start = Math.max(0, start - 1)
        break
      case 'deleteContentForward':
        if (start === end) end = Math.min(totalLength(runsRef.current), end + 1)
        break
      case 'deleteWordBackward':
      case 'deleteWordForward':
      case 'deleteByCut':
      case 'deleteContent':
        if (start === end) return
        break
      default:
        return
    }
    if (start === end && !text) return
    const result = applyEdit(runsRef.current, start, end, text, actor)
    commit(result.runs, result.caret)
  }
  beforeInputRef.current = handleBeforeInput

  // Backspace and Delete are handled on keydown: it always fires, while some
  // browsers skip beforeinput for them in a contentEditable.
  const handleKeyDown = (event) => {
    if (event.key === 'Escape') { setPopover(null); return }
    if ((event.key !== 'Backspace' && event.key !== 'Delete') || event.altKey || event.metaKey || event.ctrlKey) return
    const sel = selectionOffsets(editorRef.current)
    if (!sel) return
    event.preventDefault()
    let { start, end } = sel
    if (start === end) {
      if (event.key === 'Backspace') start = Math.max(0, start - 1)
      else end = Math.min(totalLength(runsRef.current), end + 1)
    }
    if (start === end) return
    const result = applyEdit(runsRef.current, start, end, '', actor)
    commit(result.runs, result.caret)
  }

  // A screenshot goes in at the caret on its own line, as a base run.
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)
  const insertImage = async (file) => {
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
      const root = editorRef.current
      const sel = root ? selectionOffsets(root) : null
      const at = sel ? sel.end : totalLength(runsRef.current)
      const next = runsRef.current.map((r) => ({ ...r }))
      const index = splitAt(next, at)
      const before = next[index - 1]
      const after = next[index]
      const lead = before && !before.text.endsWith('\n') ? '\n' : ''
      const trail = after && after.text.startsWith('\n') ? '' : '\n'
      next.splice(index, 0, { text: lead, kind: 'base' }, { text: IMAGE_CHAR, kind: 'image', src }, { text: trail, kind: 'base' })
      commit(normalise(next), at + lead.length + 2)
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
          <strong>{title ?? 'Writing'}</strong>
          {subtitle && <span className="muted"> · {subtitle}</span>}
          <span className="muted writing-stats"> · {words} words{pending ? ` · ${pending} suggestion${pending === 1 ? '' : 's'}` : ''}</span>
        </div>
        <div className="row-actions">
          {pending > 0 && (
            <>
              <button className="tool accept" onClick={() => commit(resolveAll(runsRef.current, true), null)} title="Apply every correction to the text">Accept all changes</button>
              <button className="tool" onClick={() => commit(resolveAll(runsRef.current, false), null)} title="Discard every correction">Reject all</button>
            </>
          )}
          <button className="tool" onClick={() => fileInputRef.current?.click()} disabled={uploading} title="Insert a screenshot or picture (or just paste one)">
            {uploading ? 'Uploading…' : 'Image'}
          </button>
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => { insertImage(e.target.files?.[0]); e.target.value = '' }} />
          {onClose && <button className="tool" onClick={onClose}>Close</button>}
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="writing-page-wrap" onClick={(e) => { if (e.target === e.currentTarget) setPopover(null) }}>
        <div
          ref={editorRef}
          className="writing-page"
          contentEditable={loaded}
          suppressContentEditableWarning
          spellCheck={false}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => { tipWordRef.current = null; clearTimeout(tipTimer.current); setTip(null) }}
          onDrop={(e) => { const f = e.dataTransfer?.files?.[0]; if (f) { e.preventDefault(); insertImage(f) } }}
          data-placeholder={actor.tracked ? 'The student has not written anything yet.' : 'Write your text here…'}
        >
          {runs.map((run, index) => run.kind === 'image' ? (
            // The placeholder character keeps text offsets honest; the picture is decoration.
            <span key={index} data-run={index} className="run image" contentEditable={false}>
              <img src={run.src} alt="" draggable={false} />
              <span className="obj">{run.text}</span>
            </span>
          ) : (
            <span key={index} data-run={index} className={`run ${run.kind}`}>{run.text}</span>
          ))}
        </div>

        {tip && (
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

      <div className="writing-hint muted">
        {actor.tracked
          ? 'Type to suggest: your insertions show green, deletions strike through. Click a mark to accept or reject it.'
          : 'Your teacher’s corrections appear as marks. Click one to accept or reject it, or use Accept all.'}
      </div>
    </div>
  )
}
