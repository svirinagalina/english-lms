import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import '../styles/whiteboard.css'
import { isEnglishWord, lookupWord, wordAt } from '../utils/dictionary'
import { ocrWords } from '../utils/ocr'
import { isMobile, useNarrow } from '../utils/device'
import WordCard, { PlayButton } from './WordCard'
import DictionaryPanel from './DictionaryPanel'
import { useAuth } from '../AuthContext'
import { api } from '../api'

const COLORS = ['#111827', '#ef4444', '#16a34a', '#2563eb', '#f59e0b', '#9333ea']
// Ink drawn while the board was dark, shown dark on the white board.
const LEGACY_INK = { '#e8eaed': '#111827', '#22c55e': '#16a34a', '#3b82f6': '#2563eb', '#eab308': '#f59e0b', '#a855f7': '#9333ea' }
const inkOf = (color) => LEGACY_INK[color] ?? color

const MIN_SCALE = 0.05
const MAX_SCALE = 8
const TOOLS = [
  { id: 'select', label: 'Move', key: 'V' },
  { id: 'area', label: 'Select', key: 'S', title: 'Select several: drag a box around them or click each one, then drag them together (S)' },
  { id: 'pen', label: 'Pen', key: 'P' },
  { id: 'marker', label: 'Marker', key: 'M' },
  { id: 'text', label: 'Text', key: 'T' },
  { id: 'note', label: 'Note', key: 'N' },
  { id: 'eraser', label: 'Erase', key: 'E' }
]

// Sticky-note fills, one per ink colour (black ink → yellow note).
const NOTE_FILLS = ['#fef08a', '#fecaca', '#bbf7d0', '#bfdbfe', '#fed7aa', '#e9d5ff']
const NOTE_PAD = 14
const NOTE_SIZE = 220
// Marker strokes: translucent, wide, multiplied so text underneath stays readable.
const MARKER_ALPHA = 0.55
const markerWidth = (width) => Math.max(14, width * 6)
// Highlighter shades, one per ink colour: black ink → classic yellow.
const MARKER_INKS = ['#fde047', '#f9a8d4', '#86efac', '#93c5fd', '#fdba74', '#d8b4fe']
const markerInk = (color) => MARKER_INKS[Math.max(0, COLORS.indexOf(color))]
const swatchFor = (tool, color, index) =>
  tool === 'note' ? NOTE_FILLS[index] : tool === 'marker' ? MARKER_INKS[index] : color

const CLIPBOARD_MARK = 'english-lms-board/v1'
const PASTE_OFFSET = 24

const HANDLE_PX = 9
const MIN_SIZE = 12
const FULL_CROP = { x: 0, y: 0, w: 1, h: 1 }

const newId = () => crypto.randomUUID().slice(0, 32)
// One element per id, the latest copy winning.
const dedupe = (elements) => [...new Map(elements.map((item) => [item.id, item])).values()]

// Decoded images by src, so drawElement stays synchronous. A missing entry
// triggers a load and a repaint once it arrives.
const imageCache = new Map()
let requestRepaint = () => {}

function imageFor(src) {
  if (imageCache.has(src)) return imageCache.get(src)
  const image = new Image()
  image.onload = () => requestRepaint()
  image.src = src
  imageCache.set(src, image)
  return image
}

// --- Text ---------------------------------------------------------------------
// Text keeps a light markup: **bold** spans. Everything else is plain.

// One web font for everyone (self-hosted, see main.jsx): with the system
// font, a line was a different length on a Mac, Windows and a phone, so text
// laid over a picture sat off on the other side and a pointed-at word wasn't
// where the other person saw it.
const FONT_FAMILY = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
const LINE_HEIGHT = 1.25
// Big enough for a heading read from far out on a zoomed-out board.
const MAX_FONT_SIZE = 2000
const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64, 80]
// Measured on the visible canvas once it exists, so the font resolves exactly
// as it is drawn (an offscreen canvas can fall back to a different face).
let measureCtx = document.createElement('canvas').getContext('2d')

const fontFor = (size, bold, italic) => `${italic ? 'italic ' : ''}${bold ? '700' : '400'} ${size}px ${FONT_FAMILY}`

// Widths are measured at one reference size and scaled, so a line breaks
// at the same word whatever the font size — scaling text never rewraps it.
const REFERENCE_SIZE = 100
// Measured widths are cached: a zoom or pan redraws every text on the
// board, and measureText is the slow part of that.
const widthCache = new Map()
function measureWidth(text, size, bold, italic) {
  const key = `${bold ? 'b' : ''}${italic ? 'i' : ''}\u0000${text}`
  let base = widthCache.get(key)
  if (base === undefined) {
    measureCtx.font = fontFor(REFERENCE_SIZE, bold, italic)
    base = measureCtx.measureText(text).width
    if (widthCache.size > 20000) widthCache.clear()
    widthCache.set(key, base)
  }
  return (base * size) / REFERENCE_SIZE
}

// A line can have its own size: {{size:28}} at its very start. Without one
// it takes the element's fontSize. The marker is never drawn or edited.
const LINE_SIZE = /^\{\{size:(\d+(?:\.\d+)?)\}\}/
function splitLineSize(line, base) {
  const m = line.match(LINE_SIZE)
  return m ? { size: Number(m[1]), body: line.slice(m[0].length) } : { size: base, body: line }
}
const roundSize = (size) => Math.round(size * 10) / 10
const withLineSize = (body, size, base) => (Math.abs(size - base) < 0.05 ? body : `{{size:${roundSize(size)}}}${body}`)
// Every line back to the element's own size.
const stripLineSizes = (text) => String(text ?? '').split('\n').map((line) => line.replace(LINE_SIZE, '')).join('\n')
// A resize scales the lines' own sizes along with the element's.
const scaleLineSizes = (text, factor) => String(text ?? '').split('\n').map((line) => {
  const m = line.match(LINE_SIZE)
  return m ? `{{size:${roundSize(Number(m[1]) * factor)}}}${line.slice(m[0].length)}` : line
}).join('\n')

// "a **b** c" → [{text:'a ', bold:false}, {text:'b', bold:true}, {text:' c', bold:false}]
// Markup: **bold**, __italic__, ~~struck through~~ and {{#rrggbb:coloured}} spans, nestable.
const COLOR_OPEN = /^\{\{(#[0-9a-fA-F]{6}):/
function textRuns(line) {
  line = line.replace(LINE_SIZE, '')
  const runs = []
  let bold = false
  let italic = false
  let strike = false
  const colors = []
  let buffer = ''
  const flush = () => {
    if (buffer) runs.push({ text: buffer, bold, italic, strike, color: colors[colors.length - 1] })
    buffer = ''
  }
  let i = 0
  while (i < line.length) {
    if (line.startsWith('**', i)) { flush(); bold = !bold; i += 2; continue }
    if (line.startsWith('__', i)) { flush(); italic = !italic; i += 2; continue }
    if (line.startsWith('~~', i)) { flush(); strike = !strike; i += 2; continue }
    const open = line.slice(i).match(COLOR_OPEN)
    if (open) { flush(); colors.push(open[1]); i += open[0].length; continue }
    if (colors.length && line.startsWith('}}', i)) { flush(); colors.pop(); i += 2; continue }
    buffer += line[i]
    i += 1
  }
  flush()
  return runs
}

// The same text without its per-word colours ({{#rrggbb:…}} spans), so a
// colour for the whole text shows on every word.
function stripColorMarkup(text) {
  let out = ''
  let depth = 0
  let i = 0
  const s = String(text ?? '')
  while (i < s.length) {
    const open = s.slice(i).match(COLOR_OPEN)
    if (open) { depth += 1; i += open[0].length; continue }
    if (depth && s.startsWith('}}', i)) { depth -= 1; i += 2; continue }
    out += s[i]
    i += 1
  }
  return out
}

const sameStyle = (a, b) => a.bold === b.bold && a.italic === b.italic && Boolean(a.strike) === Boolean(b.strike) && a.color === b.color

// The word under a world point inside a text or note, from the same layout
// the canvas draws.
function wordUnderPoint(element, px, py) {
  const size = element.fontSize ?? (element.type === 'note' ? 18 : 20)
  const note = element.type === 'note'
  const originX = element.x + (note ? NOTE_PAD : 0)
  const originY = element.y + (note ? NOTE_PAD : 0)
  const lines = textLines(note ? { text: element.text, fontSize: size, w: Math.max(20, element.w - 2 * NOTE_PAD) } : element)
  let top = originY
  const runs = lines.find((line) => {
    top += line.size * LINE_HEIGHT
    return py < top
  })
  if (!runs || py < originY) return null
  const lineSize = runs.size
  let x = originX
  for (const run of runs) {
    const w = measureWidth(run.text, lineSize, run.bold, run.italic)
    if (px >= x && px <= x + w) {
      // Walk the characters of this run to the one under the point.
      let acc = x
      for (let i = 0; i < run.text.length; i++) {
        const cw = measureWidth(run.text[i], lineSize, run.bold, run.italic)
        if (px <= acc + cw) return wordAt(run.text, i)?.word ?? null
        acc += cw
      }
      return null
    }
    x += w
  }
  return null
}

// --- Rich editor ---------------------------------------------------------------
// The text editor is a contentEditable: the markup becomes styled spans on
// open, and the DOM is read back into markup on every input, so the person
// never sees the ** / {{#…}} marks themselves.

const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// base is the element's fontSize: a line with its own size gets it as em on
// its spans, so it scales with the editor's zoom like the rest.
function markupToHtml(text, base = 20) {
  // An empty editor gets a bare <br>: an &nbsp; there stayed in front of
  // whatever was typed and every new text began with a space.
  if (!String(text ?? '')) return '<br>'
  return String(text ?? '').split('\n').map((line) => {
    const { size } = splitLineSize(line, base)
    const em = Math.abs(size - base) < 0.05 ? '' : `font-size:${size / base}em`
    return textRuns(line).map((run) => {
      const style = [
        run.bold ? 'font-weight:700' : '',
        run.italic ? 'font-style:italic' : '',
        run.strike ? 'text-decoration:line-through' : '',
        run.color ? `color:${inkOf(run.color)}` : '',
        em
      ].filter(Boolean).join(';')
      return style ? `<span style="${style}">${escapeHtml(run.text)}</span>` : escapeHtml(run.text)
    }).join('') || (em ? `<span style="${em}">&nbsp;</span>` : '&nbsp;')
  }).join('<br>')
}

// The editor's text as plain characters, a <br> counting as one "\n" —
// enough to find which lines a selection covers and to put it back.
function editorPlain(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent
  if (node.nodeName === 'BR') return '\n'
  let out = ''
  for (const child of node.childNodes) out += editorPlain(child)
  return out
}
function editorOffsets(root) {
  const selection = window.getSelection()
  if (!selection?.rangeCount || !root.contains(selection.anchorNode)) return null
  const range = selection.getRangeAt(0)
  const offsetOf = (node, offset) => {
    const before = document.createRange()
    before.selectNodeContents(root)
    before.setEnd(node, offset)
    return editorPlain(before.cloneContents()).length
  }
  return { start: offsetOf(range.startContainer, range.startOffset), end: offsetOf(range.endContainer, range.endOffset) }
}
function editorPoint(root, offset) {
  let left = offset
  let found = null
  const walk = (node) => {
    if (found) return
    if (node.nodeType === Node.TEXT_NODE) {
      if (left <= node.textContent.length) { found = { node, offset: left }; return }
      left -= node.textContent.length
      return
    }
    if (node.nodeName === 'BR') {
      if (left === 0) { found = { node: node.parentNode, offset: [...node.parentNode.childNodes].indexOf(node) }; return }
      left -= 1
      return
    }
    for (const child of node.childNodes) walk(child)
  }
  walk(root)
  return found ?? { node: root, offset: root.childNodes.length }
}
function setEditorOffsets(root, { start, end }) {
  const a = editorPoint(root, start)
  const b = editorPoint(root, end)
  const range = document.createRange()
  range.setStart(a.node, a.offset)
  range.setEnd(b.node, b.offset)
  const selection = window.getSelection()
  selection.removeAllRanges()
  selection.addRange(range)
}

const rgbToHex = (value) => {
  const m = String(value).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (!m) return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null
  return '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')
}

// Reads the editor DOM back into markup. baseColor is the element's own
// colour: only other colours become {{#…}} spans.
function htmlToMarkup(root, baseColor, baseSize = 20) {
  const runs = []
  const base = rgbToHex(inkOf(baseColor)) ?? baseColor
  const rootPx = parseFloat(getComputedStyle(root).fontSize) || 1
  const walk = (node, style, blockStart) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent) {
        const px = parseFloat(getComputedStyle(node.parentElement).fontSize) || rootPx
        runs.push({ text: node.textContent, ...style, size: baseSize * px / rootPx })
      }
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const tag = node.tagName
    if (tag === 'BR') { runs.push({ text: '\n', bold: false, italic: false, strike: false, color: null }); return }
    const cs = getComputedStyle(node)
    const next = {
      bold: style.bold || tag === 'B' || tag === 'STRONG' || Number(cs.fontWeight) >= 600 || cs.fontWeight === 'bold',
      italic: style.italic || tag === 'I' || tag === 'EM' || cs.fontStyle === 'italic',
      // text-decoration is not inherited: a struck parent marks its children here.
      strike: style.strike || tag === 'S' || tag === 'STRIKE' || tag === 'DEL' || /line-through/.test(cs.textDecorationLine || cs.textDecoration || ''),
      color: style.color
    }
    const own = node.style?.color || node.getAttribute?.('color')
    if (own) {
      const hex = rgbToHex(own) ?? rgbToHex(cs.color)
      if (hex) next.color = hex === base ? null : hex
    }
    const isBlock = cs.display === 'block' || tag === 'DIV' || tag === 'P'
    if (isBlock && node !== root && runs.length && !runs[runs.length - 1].text.endsWith('\n')) {
      runs.push({ text: '\n', bold: false, italic: false, strike: false, color: null })
    }
    for (const child of node.childNodes) walk(child, next, false)
  }
  walk(root, { bold: false, italic: false, strike: false, color: null }, true)
  // A line's size is the one most of its characters have: a letter typed
  // just outside a sized span must not pull the line back to the base size.
  const lines = [[]]
  for (const run of runs) {
    if (run.text === '\n') lines.push([])
    else lines[lines.length - 1].push(run)
  }
  return lines.map((line) => {
    const weight = new Map()
    for (const run of line) {
      const key = roundSize(run.size)
      weight.set(key, (weight.get(key) ?? 0) + run.text.replace(/\u00a0/g, '').length + 0.001)
    }
    const size = [...weight].sort((a, b) => b[1] - a[1])[0]?.[0] ?? baseSize
    // A line that is only the &nbsp; holding an empty line open is empty.
    if (line.length && line.every((run) => /^\u00a0*$/.test(run.text))) line = []
    const body = line.map((run) => {
      let out = run.text
      if (run.bold) out = `**${out}**`
      if (run.italic) out = `__${out}__`
      if (run.strike) out = `~~${out}~~`
      if (run.color) out = `{{${run.color}:${out}}}`
      return out
    }).join('')
    return withLineSize(body, size, baseSize)
  }).join('\n').replace(/\n$/, '')
}

const styleOf = (run) => ({ bold: run.bold, italic: run.italic, strike: run.strike, color: run.color })


// Word-wraps one paragraph to maxWidth, keeping bold flags per word. Each
// returned line is a list of runs ready to draw.
function wrapLine(line, size, maxWidth) {
  const words = []
  for (const run of textRuns(line)) {
    const parts = run.text.split(/(\s+)/).filter(Boolean)
    for (const part of parts) words.push({ text: part, ...styleOf(run), space: /^\s+$/.test(part) })
  }
  const widthOf = (word) => measureWidth(word.text, size, word.bold, word.italic)

  const lines = []
  let current = []
  let currentWidth = 0
  for (const word of words) {
    const w = widthOf(word)
    // A hair of tolerance keeps a word that exactly fills the width on its
    // line through the rounding of repeated scaling.
    if (!word.space && current.length && currentWidth + w > maxWidth * 1.001) {
      // Drop trailing spaces before breaking.
      while (current.length && current[current.length - 1].space) current.pop()
      lines.push(current)
      current = []
      currentWidth = 0
      if (word.space) continue
    }
    if (!current.length && word.space) continue
    current.push(word)
    currentWidth += w
  }
  lines.push(current)
  // Neighbouring words with the same weight draw as one run, so the browser
  // spaces them exactly as it would in a single string.
  return lines.map((ws) => ws.reduce((runs, w) => {
    const last = runs[runs.length - 1]
    if (last && sameStyle(last, w)) last.text += w.text
    else runs.push({ text: w.text, ...styleOf(w) })
    return runs
  }, []))
}

// Lines of runs for a text element: wrapped to element.w when it has a width.
const layoutCache = new Map()
function textLines(element) {
  const size = element.fontSize ?? 20
  const key = `${size}\u0000${element.w ?? ''}\u0000${element.text ?? ''}`
  const cached = layoutCache.get(key)
  if (cached) return cached
  const paragraphs = String(element.text ?? '').split('\n')
  // Each line carries the size it is drawn at (its own, or the element's).
  const lines = paragraphs.flatMap((paragraph) => {
    const { size: lineSize, body } = splitLineSize(paragraph, size)
    const wrapped = element.w ? wrapLine(body, lineSize, element.w) : [textRuns(body)]
    for (const line of wrapped) line.size = lineSize
    return wrapped
  })
  if (layoutCache.size > 2000) layoutCache.clear()
  layoutCache.set(key, lines)
  return lines
}

function textSize(text, size, maxWidth) {
  const lines = textLines({ text, fontSize: size, w: maxWidth })
  const widths = lines.map((runs) => runs.reduce((sum, run) => sum + measureWidth(run.text, runs.size, run.bold, run.italic), 0))
  return {
    w: maxWidth ?? Math.max(8, ...widths),
    h: Math.max(size * LINE_HEIGHT, lines.reduce((sum, line) => sum + line.size * LINE_HEIGHT, 0))
  }
}

// --- Geometry -----------------------------------------------------------------

function boundsOf(element) {
  if (element.type === 'path') {
    const points = element.points ?? []
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (let i = 0; i < points.length; i += 2) {
      minX = Math.min(minX, points[i]); maxX = Math.max(maxX, points[i])
      minY = Math.min(minY, points[i + 1]); maxY = Math.max(maxY, points[i + 1])
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
  }

  if (element.type === 'text') {
    const { w, h } = textSize(element.text, element.fontSize ?? 20, element.w)
    return { x: element.x, y: element.y, w, h }
  }

  // A note grows downwards to fit its text, never shrinks below its box.
  if (element.type === 'note') {
    const { h } = textSize(element.text || ' ', element.fontSize ?? 18, Math.max(20, element.w - 2 * NOTE_PAD))
    return { x: element.x, y: element.y, w: element.w, h: Math.max(element.h, h + 2 * NOTE_PAD) }
  }

  return {
    x: Math.min(element.x, element.x + element.w),
    y: Math.min(element.y, element.y + element.h),
    w: Math.abs(element.w),
    h: Math.abs(element.h)
  }
}

function hitTest(element, x, y) {
  const bounds = boundsOf(element)
  const pad = Math.max(8, element.width)
  return (
    x >= bounds.x - pad && x <= bounds.x + bounds.w + pad &&
    y >= bounds.y - pad && y <= bounds.y + bounds.h + pad
  )
}

function moveElement(element, dx, dy) {
  if (element.type === 'path') {
    const points = element.points.map((value, index) => (index % 2 === 0 ? value + dx : value + dy))
    return { ...element, points }
  }
  return { ...element, x: element.x + dx, y: element.y + dy }
}

// Scales an element so that its bounds become the given box.
function fitElement(element, box) {
  const from = boundsOf(element)
  const sx = from.w ? box.w / from.w : 1
  const sy = from.h ? box.h / from.h : 1

  if (element.type === 'path') {
    const points = element.points.map((value, index) =>
      index % 2 === 0 ? box.x + (value - from.x) * sx : box.y + (value - from.y) * sy
    )
    return { ...element, points }
  }

  if (element.type === 'note') {
    return { ...element, x: box.x, y: box.y, w: Math.max(60, box.w), h: Math.max(60, box.h) }
  }

  if (element.type === 'text') {
    const size = element.fontSize ?? 20
    const uniform = Math.abs(sx - sy) < 0.05
    const fontSize = Math.max(8, Math.min(MAX_FONT_SIZE, size * sy))
    const next = { ...element, x: box.x, y: box.y, fontSize }
    if (/(^|\n)\{\{size:/.test(element.text ?? '')) next.text = scaleLineSizes(element.text, fontSize / size)
    // A pure width change sets how wide the text may run before wrapping;
    // a uniform scale keeps the wrap width in exact proportion to the font
    // (including where the font size hits its limit) so no line moves.
    if (uniform) { if (element.w) next.w = element.w * (fontSize / size) }
    else if (Math.abs(sy - 1) < 0.01) next.w = Math.max(MIN_SIZE * 2, box.w)
    else next.w = Math.max(MIN_SIZE * 2, box.w)
    return next
  }

  return { ...element, x: box.x, y: box.y, w: box.w, h: box.h }
}

// Smallest box containing every element's bounds.
function unionBounds(elements) {
  if (!elements.length) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const element of elements) {
    const b = boundsOf(element)
    minX = Math.min(minX, b.x); minY = Math.min(minY, b.y)
    maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h)
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

// Whether an element's bounds lie inside a marquee rectangle.
function insideBox(element, box) {
  const b = boundsOf(element)
  return b.x >= box.x && b.y >= box.y && b.x + b.w <= box.x + box.w && b.y + b.h <= box.y + box.h
}

// Scales a group: each element keeps its relative place inside the group box.
function fitGroup(elements, from, to) {
  const sx = from.w ? to.w / from.w : 1
  const sy = from.h ? to.h / from.h : 1
  return elements.map((element) => {
    const b = boundsOf(element)
    return fitElement(element, {
      x: to.x + (b.x - from.x) * sx,
      y: to.y + (b.y - from.y) * sy,
      w: b.w * sx,
      h: b.h * sy
    })
  })
}

// Corners of a box, named by which edges they move.
const CORNERS = [
  { id: 'nw', dx: 0, dy: 0 },
  { id: 'ne', dx: 1, dy: 0 },
  { id: 'sw', dx: 0, dy: 1 },
  { id: 'se', dx: 1, dy: 1 }
]

const cornerPoint = (box, corner) => ({ x: box.x + corner.dx * box.w, y: box.y + corner.dy * box.h })

// Middle of each side; dragging one changes only that dimension.
const EDGES = [
  { id: 'n', dx: 0.5, dy: 0 },
  { id: 's', dx: 0.5, dy: 1 },
  { id: 'w', dx: 0, dy: 0.5 },
  { id: 'e', dx: 1, dy: 0.5 }
]

// The nearest handle within reach — corners and sides compete, so a thin
// box (one line of text) still offers its side handles.
function handleAt(box, point, scale) {
  const radius = (HANDLE_PX + 4) / scale
  let best = null
  let bestDistance = Infinity
  for (const handle of [...CORNERS, ...EDGES]) {
    const { x, y } = cornerPoint(box, handle)
    const distance = Math.hypot(point.x - x, point.y - y)
    if (distance <= radius * 1.4 && distance < bestDistance) { best = handle; bestDistance = distance }
  }
  return best
}
const isCorner = (handle) => handle && handle.id.length === 2

// Resizes a box by dragging one side; the opposite side stays put.
function resizeBoxEdge(box, edge, point) {
  const right = box.x + box.w
  const bottom = box.y + box.h
  if (edge.id === 'e') return { ...box, w: Math.max(MIN_SIZE, point.x - box.x) }
  if (edge.id === 's') return { ...box, h: Math.max(MIN_SIZE, point.y - box.y) }
  if (edge.id === 'w') { const x = Math.min(point.x, right - MIN_SIZE); return { ...box, x, w: right - x } }
  const y = Math.min(point.y, bottom - MIN_SIZE)
  return { ...box, y, h: bottom - y }
}

const CURSOR_FOR = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' }

function cornerAt(box, point, scale) {
  const radius = (HANDLE_PX + 4) / scale
  return CORNERS.find((corner) => {
    const { x, y } = cornerPoint(box, corner)
    return Math.abs(point.x - x) <= radius && Math.abs(point.y - y) <= radius
  })
}

// While cropping, a side can be taken anywhere along its line, not only at
// its middle handle; corners (checked first) take priority.
function cropSideAt(box, point, scale) {
  const r = (HANDLE_PX + 2) / scale
  const inX = point.x >= box.x - r && point.x <= box.x + box.w + r
  const inY = point.y >= box.y - r && point.y <= box.y + box.h + r
  if (inX && Math.abs(point.y - box.y) <= r) return 'n'
  if (inX && Math.abs(point.y - (box.y + box.h)) <= r) return 's'
  if (inY && Math.abs(point.x - box.x) <= r) return 'w'
  if (inY && Math.abs(point.x - (box.x + box.w)) <= r) return 'e'
  return null
}

// Moves one side of a crop box; the other three stay put.
function moveSide(box, side, point) {
  const right = box.x + box.w
  const bottom = box.y + box.h
  if (side === 'n') { const y = Math.min(point.y, bottom - MIN_SIZE); return { ...box, y, h: bottom - y } }
  if (side === 's') return { ...box, h: Math.max(MIN_SIZE, point.y - box.y) }
  if (side === 'w') { const x = Math.min(point.x, right - MIN_SIZE); return { ...box, x, w: right - x } }
  return { ...box, w: Math.max(MIN_SIZE, point.x - box.x) }
}

// Resizes a box by dragging one corner; the opposite corner stays put.
function resizeBox(box, corner, point, keepRatio) {
  const anchor = cornerPoint(box, { dx: 1 - corner.dx, dy: 1 - corner.dy })
  let w = Math.abs(point.x - anchor.x)
  let h = Math.abs(point.y - anchor.y)

  if (keepRatio && box.w && box.h) {
    // Follow the pointer along the box diagonal, so the scale responds to
    // both directions of the drag and never jumps past the pointer.
    const start = cornerPoint(box, corner)
    const dx = start.x - anchor.x
    const dy = start.y - anchor.y
    const along = ((point.x - anchor.x) * dx + (point.y - anchor.y) * dy) / (dx * dx + dy * dy)
    const scale = Math.max(MIN_SIZE / Math.max(box.w, box.h), along)
    w = box.w * scale
    h = box.h * scale
  }

  w = Math.max(MIN_SIZE, w)
  h = Math.max(MIN_SIZE, h)

  return {
    x: corner.dx === 0 ? anchor.x - w : anchor.x,
    y: corner.dy === 0 ? anchor.y - h : anchor.y,
    w,
    h
  }
}

// The full, uncropped footprint of an image element on the board.
function fullImageBox(element) {
  const crop = element.crop ?? FULL_CROP
  const fullW = element.w / crop.w
  const fullH = element.h / crop.h
  return { x: element.x - crop.x * fullW, y: element.y - crop.y * fullH, w: fullW, h: fullH }
}

// Converts a visible box inside the full image back into crop fractions.
const unit = (v) => Math.min(1, Math.max(0, v))

function cropFromBox(element, visible) {
  const full = fullImageBox(element)
  const clampedX = Math.max(full.x, Math.min(visible.x, full.x + full.w - MIN_SIZE))
  const clampedY = Math.max(full.y, Math.min(visible.y, full.y + full.h - MIN_SIZE))
  const clampedW = Math.max(MIN_SIZE, Math.min(visible.w, full.x + full.w - clampedX))
  const clampedH = Math.max(MIN_SIZE, Math.min(visible.h, full.y + full.h - clampedY))

  return {
    ...element,
    x: clampedX,
    y: clampedY,
    w: clampedW,
    h: clampedH,
    // Kept strictly inside 0–1: the server refuses a crop of 1.0000000002,
    // and a refused crop showed only on the teacher's screen.
    crop: {
      x: unit((clampedX - full.x) / full.w),
      y: unit((clampedY - full.y) / full.h),
      w: Math.max(0.01, unit(clampedW / full.w)),
      h: Math.max(0.01, unit(clampedH / full.h))
    }
  }
}

// The word under a world point inside an image (a screenshot or a photo of
// a page) — maps the point through the same crop math drawImageElement
// uses, the other way around, then looks it up in that image's OCR result.
// null both when there's genuinely no word there and while OCR is still
// running (ocrWords starts it on first ask and returns null meanwhile).
function wordUnderImagePoint(element, px, py) {
  const image = imageFor(element.src)
  if (!(image.complete && image.naturalWidth) || !element.w || !element.h) return null
  const words = ocrWords(element.src)
  if (!words) return null
  const crop = element.crop ?? FULL_CROP
  const nx = crop.x * image.naturalWidth + ((px - element.x) / element.w) * (crop.w * image.naturalWidth)
  const ny = crop.y * image.naturalHeight + ((py - element.y) / element.h) * (crop.h * image.naturalHeight)
  const hit = words.find((w) => nx >= w.x0 && nx <= w.x1 && ny >= w.y0 && ny <= w.y1)
  return hit ? hit.text.replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, '') : null
}

// --- Drawing ------------------------------------------------------------------

function drawImageElement(ctx, element, alpha = 1) {
  const image = imageFor(element.src)
  if (!(image.complete && image.naturalWidth)) {
    ctx.strokeStyle = '#444'
    ctx.setLineDash([6, 6])
    ctx.strokeRect(element.x, element.y, element.w, element.h)
    ctx.setLineDash([])
    return
  }

  const crop = element.crop ?? FULL_CROP
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.drawImage(
    image,
    crop.x * image.naturalWidth, crop.y * image.naturalHeight,
    crop.w * image.naturalWidth, crop.h * image.naturalHeight,
    element.x, element.y, element.w, element.h
  )
  ctx.restore()
}

// The two praise stickers: a soft gradient pill with a tilt, a shadow,
// bold text and a few sparkles. Drawn, not an image, so they scale crisply.
const STICKER_STYLES = {
  'well-done': { text: 'Well done!', from: '#ffd5ed', to: '#f4b9d9', ink: '#14453f', tilt: -4, spark: '#fff' },
  'great-job': { text: 'Great job', from: '#c7f5d9', to: '#86efac', ink: '#14453f', tilt: 3, spark: '#fff' }
}
function drawSparkle(ctx, x, y, r, color) {
  ctx.save()
  ctx.fillStyle = color
  ctx.beginPath()
  for (let i = 0; i < 8; i++) {
    const angle = (Math.PI / 4) * i
    const radius = i % 2 === 0 ? r : r * 0.38
    ctx.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius)
  }
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}
function drawSticker(ctx, element) {
  const style = STICKER_STYLES[element.kind] ?? STICKER_STYLES['well-done']
  const w = Math.abs(element.w) || 110
  const h = Math.abs(element.h) || 42
  const x = Math.min(element.x, element.x + element.w)
  const y = Math.min(element.y, element.y + element.h)
  ctx.save()
  ctx.translate(x + w / 2, y + h / 2)
  ctx.rotate((style.tilt * Math.PI) / 180)
  const gradient = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2)
  gradient.addColorStop(0, style.from)
  gradient.addColorStop(1, style.to)
  ctx.shadowColor = 'rgba(20, 69, 63, 0.28)'
  ctx.shadowBlur = h * 0.35
  ctx.shadowOffsetY = h * 0.12
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.roundRect(-w / 2, -h / 2, w, h, h / 2)
  ctx.fill()
  ctx.shadowColor = 'transparent'
  // A white inner rim gives it the glossy sticker edge.
  ctx.lineWidth = Math.max(2, h * 0.06)
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'
  ctx.beginPath()
  ctx.roundRect(-w / 2 + ctx.lineWidth, -h / 2 + ctx.lineWidth, w - 2 * ctx.lineWidth, h - 2 * ctx.lineWidth, (h - 2 * ctx.lineWidth) / 2)
  ctx.stroke()
  ctx.fillStyle = style.ink
  ctx.font = `800 ${Math.round(h * 0.38)}px Manrope, system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(style.text, 0, h * 0.02)
  drawSparkle(ctx, -w / 2 + h * 0.34, -h * 0.16, h * 0.13, style.spark)
  drawSparkle(ctx, w / 2 - h * 0.3, h * 0.14, h * 0.1, style.spark)
  drawSparkle(ctx, w / 2 - h * 0.48, -h * 0.3, h * 0.06, style.spark)
  ctx.restore()
}

// The line through struck-out text, a little above the middle of the
// letters (text is drawn with textBaseline 'top'), in the run's colour.
function strikeThrough(ctx, x, y, width, size) {
  ctx.save()
  ctx.strokeStyle = ctx.fillStyle
  ctx.lineWidth = Math.max(1, size / 14)
  ctx.lineCap = 'butt'
  ctx.beginPath()
  ctx.moveTo(x, y + size * 0.6)
  ctx.lineTo(x + width, y + size * 0.6)
  ctx.stroke()
  ctx.restore()
}

function drawElement(ctx, element) {
  ctx.strokeStyle = inkOf(element.color)
  ctx.fillStyle = inkOf(element.color)
  ctx.lineWidth = element.width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  if (element.type === 'image') return drawImageElement(ctx, element)
  if (element.type === 'sticker') return drawSticker(ctx, element)

  if (element.type === 'path') {
    const points = element.points ?? []
    if (points.length < 4) return
    ctx.save()
    if (element.highlight) {
      ctx.globalAlpha = MARKER_ALPHA
      ctx.globalCompositeOperation = 'multiply'
      ctx.strokeStyle = markerInk(element.color)
    }
    ctx.beginPath()
    ctx.moveTo(points[0], points[1])
    for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1])
    ctx.stroke()
    ctx.restore()
    return
  }

  if (element.type === 'note') {
    const box = boundsOf(element)
    const size = element.fontSize ?? 18
    ctx.save()
    ctx.shadowColor = 'rgba(0, 0, 0, 0.18)'
    ctx.shadowBlur = 10
    ctx.shadowOffsetY = 3
    ctx.fillStyle = element.fill ?? NOTE_FILLS[0]
    ctx.beginPath()
    ctx.roundRect(box.x, box.y, box.w, box.h, 6)
    ctx.fill()
    ctx.restore()
    ctx.textBaseline = 'top'
    let y = box.y + NOTE_PAD
    textLines({ text: element.text, fontSize: size, w: Math.max(20, box.w - 2 * NOTE_PAD) }).forEach((runs) => {
      let x = box.x + NOTE_PAD
      const lineSize = runs.size
      for (const run of runs) {
        ctx.font = fontFor(lineSize, run.bold, run.italic)
        ctx.fillStyle = inkOf(run.color ?? element.color)
        ctx.fillText(run.text, x, y)
        // Advance by the width at the size actually drawn: the system font
        // on a Mac changes its spacing with size (optical sizes), so the
        // width scaled from REFERENCE_SIZE fell short and the space where
        // one coloured or bold run meets the next vanished ("Madridfor").
        const runWidth = ctx.measureText(run.text).width
        if (run.strike) strikeThrough(ctx, x, y, runWidth, lineSize)
        x += runWidth
      }
      y += lineSize * LINE_HEIGHT
    })
    return
  }

  if (element.type === 'rect') {
    ctx.strokeRect(element.x, element.y, element.w, element.h)
    return
  }

  if (element.type === 'ellipse') {
    ctx.beginPath()
    ctx.ellipse(
      element.x + element.w / 2, element.y + element.h / 2,
      Math.abs(element.w / 2), Math.abs(element.h / 2), 0, 0, Math.PI * 2
    )
    ctx.stroke()
    return
  }

  if (element.type === 'arrow') {
    const [x0, y0, x1, y1] = [element.x, element.y, element.x + element.w, element.y + element.h]
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y1)
    ctx.stroke()

    const angle = Math.atan2(y1 - y0, x1 - x0)
    const head = 8 + element.width * 2
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x1 - head * Math.cos(angle - Math.PI / 6), y1 - head * Math.sin(angle - Math.PI / 6))
    ctx.moveTo(x1, y1)
    ctx.lineTo(x1 - head * Math.cos(angle + Math.PI / 6), y1 - head * Math.sin(angle + Math.PI / 6))
    ctx.stroke()
    return
  }

  if (element.type === 'text') {
    ctx.textBaseline = 'top'
    let y = element.y
    textLines(element).forEach((runs) => {
      let x = element.x
      const lineSize = runs.size
      for (const run of runs) {
        ctx.font = fontFor(lineSize, run.bold, run.italic)
        ctx.fillStyle = inkOf(run.color ?? element.color)
        ctx.fillText(run.text, x, y)
        // Advance by the width at the size actually drawn: the system font
        // on a Mac changes its spacing with size (optical sizes), so the
        // width scaled from REFERENCE_SIZE fell short and the space where
        // one coloured or bold run meets the next vanished ("Madridfor").
        const runWidth = ctx.measureText(run.text).width
        if (run.strike) strikeThrough(ctx, x, y, runWidth, lineSize)
        x += runWidth
      }
      y += lineSize * LINE_HEIGHT
    })
  }
}

function drawHandles(ctx, box, scale, color = '#6366f1') {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5 / scale
  ctx.setLineDash([])
  ctx.strokeRect(box.x, box.y, box.w, box.h)

  const size = HANDLE_PX / scale
  ctx.fillStyle = '#fff'
  for (const corner of CORNERS) {
    const { x, y } = cornerPoint(box, corner)
    ctx.fillRect(x - size / 2, y - size / 2, size, size)
    ctx.strokeRect(x - size / 2, y - size / 2, size, size)
  }
  const small = size * 0.7
  for (const edge of EDGES) {
    const { x, y } = cornerPoint(box, edge)
    ctx.fillRect(x - small / 2, y - small / 2, small, small)
    ctx.strokeRect(x - small / 2, y - small / 2, small, small)
  }
  ctx.restore()
}

// --- PDF export ---------------------------------------------------------------

const waitForImages = (elements) =>
  Promise.all(
    elements.filter((e) => e.type === 'image').map((e) => new Promise((resolve) => {
      const image = imageFor(e.src)
      if (image.complete) return resolve()
      image.addEventListener('load', resolve, { once: true })
      image.addEventListener('error', resolve, { once: true })
    }))
  )

// Draws a board region onto a fresh canvas, white background, at `scale`.
function renderRegion(elements, box, scale) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(box.w * scale))
  canvas.height = Math.max(1, Math.round(box.h * scale))
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.scale(scale, scale)
  ctx.translate(-box.x, -box.y)
  const previous = measureCtx
  measureCtx = ctx
  for (const element of elements) drawElement(ctx, element)
  measureCtx = previous
  return canvas
}

const isLessonHeading = (e) => e.type === 'text' && /^— Lesson · /.test(e.text ?? '')

// Every lesson on the board becomes a section; sections are cut into A4
// pages top to bottom. A board without headings is one section.
export async function exportBoardPdf(elements, title = 'Board') {
  const { jsPDF } = await import('jspdf')
  await waitForImages(elements)

  const all = unionBounds(elements)
  if (!all) return
  const pad = 40
  const headings = elements.filter(isLessonHeading).map((e) => e.y - pad / 2).sort((a, b) => a - b)
  const cuts = [all.y - pad, ...headings.filter((y) => y > all.y), all.y + all.h + pad]
  // Only sections that actually contain something make pages: a heading at
  // the very top would otherwise leave a blank page above itself.
  const sections = []
  for (let i = 0; i < cuts.length - 1; i++) {
    const y = cuts[i]
    const h = cuts[i + 1] - cuts[i]
    const populated = elements.some((e) => { const b = boundsOf(e); return b.y + b.h > y && b.y < y + h })
    if (h > 1 && populated) sections.push({ y, h })
  }

  const pageW = 210
  const pageH = 297
  const margin = 10
  const innerW = pageW - 2 * margin
  const innerH = pageH - 2 * margin
  const boxX = all.x - pad
  const boxW = all.w + 2 * pad
  // World units per mm, so the board's full width fits the page width.
  const unitsPerMm = boxW / innerW
  const sliceH = innerH * unitsPerMm
  const scale = 4 / unitsPerMm // ≈ 4 px per mm ≈ 100 dpi

  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  let first = true
  for (const section of sections) {
    for (let y = section.y; y < section.y + section.h; y += sliceH) {
      const h = Math.min(sliceH, section.y + section.h - y)
      const canvas = renderRegion(elements, { x: boxX, y, w: boxW, h }, Math.min(scale, 3))
      if (!first) pdf.addPage()
      first = false
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.85), 'JPEG', margin, margin, innerW, h / unitsPerMm)
    }
  }
  pdf.save(`${title.replace(/[\\/:*?"<>|]+/g, '-')}.pdf`)
}

// --- Component ----------------------------------------------------------------

// A mistake note's text: what was said (red), how it should be (green), the
// grammar labels (grey). Braces would break the colour markup, so they go.
const noSpans = (t) => String(t ?? '').replace(/[{}]/g, '')
function mistakeNoteText(said, correct, labels = []) {
  const correctLine = correct ? `\n{{#15803d:✓ ${noSpans(correct)}}}` : '\n{{#6b7280:(no correction yet)}}'
  const tag = labels.length ? `\n{{#6b7280:${noSpans(labels.join(' · '))}}}` : ''
  return `{{#b91c1c:✗ ${noSpans(said)}}}${correctLine}${tag}`
}
function mistakeNoteParts(text) {
  return {
    said: String(text ?? '').match(/\{\{#b91c1c:✗ ([^}]*)\}\}/)?.[1] ?? '',
    correct: String(text ?? '').match(/\{\{#15803d:✓ ([^}]*)\}\}/)?.[1] ?? ''
  }
}

// Some drags (a screenshot straight from its corner preview) arrive with no
// MIME type, so the name decides then.
const isImageFile = (file) => Boolean(file) && (file.type.startsWith('image/') || (!file.type && /\.(png|jpe?g|gif|webp|tiff?)$/i.test(file.name)))

// The server takes PNG/JPEG/GIF/WebP up to 5 MB. A Retina screenshot of a
// PDF page is often bigger, and a selection dragged out of Preview arrives as
// TIFF, which Chrome can't even show — both used to fail. Every picture is
// redrawn here: at most 2400 px on its long side, PNG when that stays small
// (crisp text), otherwise JPEG. A GIF is kept as is so it still moves.
const MAX_SIDE = 2400
const MAX_UPLOAD = 3.5 * 1024 * 1024

const readAsDataUrl = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(reader.result)
  reader.onerror = reject
  reader.readAsDataURL(blob)
})

const loadImage = (src) => new Promise((resolve, reject) => {
  const image = new Image()
  image.onload = () => resolve(image)
  image.onerror = reject
  image.src = src
})

async function decodeTiff(file) {
  const UTIF = (await import('utif')).default
  const buffer = await file.arrayBuffer()
  const pages = UTIF.decode(buffer)
  UTIF.decodeImage(buffer, pages[0])
  const rgba = UTIF.toRGBA8(pages[0])
  const canvas = document.createElement('canvas')
  canvas.width = pages[0].width
  canvas.height = pages[0].height
  canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.length), canvas.width, canvas.height), 0, 0)
  return canvas
}

async function prepareImage(file) {
  if (file.type === 'image/gif' && file.size <= MAX_UPLOAD) {
    const dataUrl = await readAsDataUrl(file)
    const image = await loadImage(dataUrl)
    return { dataUrl, size: { w: image.naturalWidth, h: image.naturalHeight } }
  }

  let source
  const url = URL.createObjectURL(file)
  try { source = await loadImage(url) } catch {
    if (!/tiff?$/i.test(file.type) && !/\.tiff?$/i.test(file.name)) throw new Error('unreadable')
    source = await decodeTiff(file)
  } finally { URL.revokeObjectURL(url) }

  const w0 = source.naturalWidth ?? source.width
  const h0 = source.naturalHeight ?? source.height
  const scale = Math.min(1, MAX_SIDE / Math.max(w0, h0))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w0 * scale))
  canvas.height = Math.max(1, Math.round(h0 * scale))
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height)

  let dataUrl = canvas.toDataURL('image/png')
  if (dataUrl.length * 0.75 > MAX_UPLOAD) {
    // JPEG has no transparency: put the picture on white first.
    const flat = document.createElement('canvas')
    flat.width = canvas.width
    flat.height = canvas.height
    const ctx = flat.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, flat.width, flat.height)
    ctx.drawImage(canvas, 0, 0)
    for (const quality of [0.9, 0.8, 0.65, 0.5]) {
      dataUrl = flat.toDataURL('image/jpeg', quality)
      if (dataUrl.length * 0.75 <= MAX_UPLOAD) break
    }
  }
  return { dataUrl, size: { w: canvas.width, h: canvas.height } }
}

const Whiteboard = forwardRef(function Whiteboard({ socketRef, boardId, title, subtitle, onClose, backLabel = '← Back', onStartCall, onOpenWriting, canSpotlight = false, onUploadImage, onAssist, assistEnabled, wordPicker = false, saveAllMoves = false, focusElementId = null, onMistake, onMistakeRemoved, insertBlock = null, onInserted, onAddWords, students = null, writingStudents = null }, ref) {
  const [assisting, setAssisting] = useState(null)
  const [exporting, setExporting] = useState(false)
  const fileInputRef = useRef(null)
  const canvasRef = useRef(null)
  const elementsRef = useRef([])
  const draftRef = useRef(null)
  const viewRef = useRef({ x: 0, y: 0, scale: 1 })
  const pointerRef = useRef(null)
  const frameRef = useRef(null)
  const selectedRef = useRef([])
  const marqueeRef = useRef(null)
  const cropRef = useRef(null)
  const clipboardRef = useRef([])
  const pasteCountRef = useRef(0)
  const historyRef = useRef({ undo: [], redo: [] })
  // The world point under the pointer as of the last move over the canvas —
  // where a saved Mistake note lands, so it shows up next to whatever the
  // teacher was actually pointing at instead of a fixed spot near the panel.
  const lastCursorWorldRef = useRef(null)
  // Where the teacher is working: the last click on the board, or the last
  // place the pointer rested on it. Unlike the raw pointer position, a quick
  // trip down to the dock (New lesson, Homework) or over to the Mistakes
  // panel doesn't move it — that trip is exactly what used to drag new
  // headings and mistake notes away to the bottom/edge of the screen.
  const workSpotRef = useRef(null)
  const dwellTimerRef = useRef(null)
  // The work spot if it's still on screen, else a point in the upper left
  // of the current view.
  const workSpot = () => {
    const rect = canvasRef.current?.getBoundingClientRect() ?? { width: 800, height: 600 }
    const v = viewRef.current
    const view = { x: -v.x / v.scale, y: -v.y / v.scale, w: rect.width / v.scale, h: rect.height / v.scale }
    const spot = workSpotRef.current
    const onScreen = spot && spot.x >= view.x && spot.x <= view.x + view.w && spot.y >= view.y && spot.y <= view.y + view.h
    return { point: onScreen ? spot : { x: view.x + view.w * 0.25, y: view.y + view.h * 0.25 }, view }
  }

  const [tool, setTool] = useState('select')
  // "Select" is the Move tool with dragging on empty space drawing a box
  // (instead of panning) and clicks adding to the selection — for grabbing
  // several things at once without holding Shift.
  const [boxSelect, setBoxSelect] = useState(false)
  // Space key pressed: temporary hand tool for panning
  const spaceHeldRef = useRef(false)
  // A phone: no toolbars at all, just the board and the finger. A tap types
  // (into the text under it, or a new one), a drag moves what's under the
  // finger (or the board, on empty space), two fingers zoom.
  const narrow = useNarrow()
  const phone = narrow && isMobile()
  const lastTapRef = useRef(null)
  useEffect(() => { if (phone) { setTool('select'); setBoxSelect(false) } }, [phone])
  const pickTool = (id) => {
    setBoxSelect(id === 'area')
    setTool(id === 'area' ? 'select' : id)
    if (id !== 'select' && id !== 'area' && id !== 'hand') selectedRef.current = []
  }
  // render() reads the tool through a ref so its identity never changes:
  // the sync effect below must not re-open the board on every tool switch.
  const toolRef = useRef(tool)
  toolRef.current = tool
  const [color, setColor] = useState(COLORS[0])
  const lastFontSizeRef = useRef(24)
  const [width, setWidth] = useState(3)
  const [textInput, setTextInput] = useState(null)
  // Other people's cursors on this board, by socket id.
  const [cursors, setCursors] = useState({})
  const cursorSentRef = useRef(0)
  const broadcastCursor = (point) => {
    const now = Date.now()
    if (now - cursorSentRef.current < 60) return
    cursorSentRef.current = now
    socketRef.current?.emit('board:cursor', { x: point.x, y: point.y })
  }

  // Hover dictionary: the word under the pointer and its translation.
  const [tip, setTip] = useState(null) // { x, y, word, entry }
  // A student's double-click on a word: the word card (with "Add to my words").
  const [wordCard, setWordCard] = useState(null) // { word, x, y }
  const [toast, setToast] = useState(null) // a short confirmation, e.g. a word added to the vocabulary
  // A teacher's own board used with several students: mistakes and words go
  // to the student chosen here (remembered per board).
  const [target, setTarget] = useState(() => {
    if (!students?.length) return null
    try { const saved = localStorage.getItem(`board-target:${boardId}`); if (students.some((s) => s.classroomId === saved)) return saved } catch { /* private window */ }
    return students.length === 1 ? students[0].classroomId : null
  })
  const chooseTarget = (classroomId) => {
    setTarget(classroomId)
    try { localStorage.setItem(`board-target:${boardId}`, classroomId) } catch { /* private window */ }
  }
  // Asks which student, when the board has several and none is chosen yet.
  const [studentPrompt, setStudentPrompt] = useState(null) // { run: (classroomId) => void }
  const withTarget = (run) => {
    if (!students?.length) return run(null)
    if (target) return run(target)
    setStudentPrompt({ run: (classroomId) => { chooseTarget(classroomId); setStudentPrompt(null); run(classroomId) } })
  }
  const [addingWords, setAddingWords] = useState(false)
  const [dictionaryOpen, setDictionaryOpen] = useState(false) // the teacher's RU ⇄ EN dictionary
  // The Mistakes panel: rows typed during the lesson; each saved row becomes
  // a red note on the board (so the student sees it at once) and a notebook entry.
  const [mistakesOpen, setMistakesOpen] = useState(false)
  const emptyRow = () => ({ said: '', correct: '' })
  const [mistakeRows, setMistakeRows] = useState([emptyRow(), emptyRow(), emptyRow()]) // up to 10
  const [mistakeBusy, setMistakeBusy] = useState(false)
  const [mistakeError, setMistakeError] = useState('')
  // Editing a mistake note that's already on the board: { element, said, correct, x, y, busy, error }.
  const [mistakeEdit, setMistakeEdit] = useState(null)
  // Typing on a phone happens in a box at the top of the screen, above the
  // keyboard — in place on the board, the keyboard covered what was being
  // typed. { mode: 'new', x, y } (world point) or { mode: 'edit', element };
  // plus the text so far.
  const [phoneDraft, setPhoneDraft] = useState(null)
  const phoneDraftRef = useRef(null)
  const editClickTimer = useRef(null)
  // A block handed in from outside (speaking questions from a lesson
  // summary) goes under everything once the board is in, once per block.
  const insertedRef = useRef(null)
  const [loadedBoard, setLoadedBoard] = useState(null)
  useEffect(() => {
    if (!insertBlock || loadedBoard !== boardId || insertedRef.current === insertBlock.key) return
    insertedRef.current = insertBlock.key
    addBlock(insertBlock.title, insertBlock.lines, insertBlock.color ?? COLORS[3])
    onInserted?.()
  }, [insertBlock, loadedBoard, boardId])
  // The dock's height, published as a CSS variable so the call controls on a
  // phone sit just above it whatever rows it wraps into.
  const dockRef = useRef(null)
  useEffect(() => {
    const dock = dockRef.current
    if (!dock) {
      // No dock (a phone): whatever sat above it goes to the bottom edge.
      document.documentElement.style.setProperty('--dock-h', '0px')
      return () => document.documentElement.style.removeProperty('--dock-h')
    }
    if (typeof ResizeObserver === 'undefined') return
    const publish = () => document.documentElement.style.setProperty('--dock-h', `${dock.offsetHeight}px`)
    publish()
    const observer = new ResizeObserver(publish)
    observer.observe(dock)
    return () => { observer.disconnect(); document.documentElement.style.removeProperty('--dock-h') }
  })
  const tipTimer = useRef(null)
  const tipHideTimer = useRef(null)
  const tipHoverRef = useRef(false)
  const tipWordRef = useRef(null)
  // Drops the hover card at once: a click or the editor opening means the
  // person is working with the text, and the card would sit on top of it.
  const hideTip = () => {
    tipWordRef.current = null
    tipHoverRef.current = false
    clearTimeout(tipTimer.current)
    clearTimeout(tipHideTimer.current)
    setTip(null)
  }
  const hoverDictionary = (event) => {
    if (pointerRef.current || textInput) return
    const point = toWorld(event)
    // A click or the editor opening drops the card (hideTip); a selected
    // text still shows cards on hover, as before 2026-10-21.
    const target = [...elementsRef.current].reverse().find((e) => (e.type === 'text' || e.type === 'note' || e.type === 'image') && hitTest(e, point.x, point.y))
    // An image needs OCR before it has any words at all — ocrWords starts
    // that on the first hover over it and returns null until it's done, so
    // the tip just doesn't show for the second or so that takes.
    const word = target ? (target.type === 'image' ? wordUnderImagePoint(target, point.x, point.y) : wordUnderPoint(target, point.x, point.y)) : null
    if (!word) {
      // Off the word: the card lingers a moment so the pointer can reach its
      // play / add buttons; hovering the card itself keeps it (see onMouseEnter).
      if (tipWordRef.current) {
        tipWordRef.current = null
        clearTimeout(tipTimer.current)
        clearTimeout(tipHideTimer.current)
        tipHideTimer.current = setTimeout(() => { if (!tipHoverRef.current) setTip(null) }, 450)
      }
      return
    }
    if (word === tipWordRef.current) return
    tipWordRef.current = word
    clearTimeout(tipTimer.current)
    clearTimeout(tipHideTimer.current)
    // The card that's up stays until the next one is ready: on the way to
    // its buttons the pointer crosses other words, and wiping it the moment
    // it touched one made the buttons impossible to reach.
    const rect = canvasRef.current.getBoundingClientRect()
    const at = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    tipTimer.current = setTimeout(async () => {
      const entry = await lookupWord(word)
      if (tipHoverRef.current) return // the pointer made it onto the card
      if (tipWordRef.current === word && entry) setTip({ ...at, word, entry })
    }, tip ? 650 : 350) // a card already up needs a real pause on another word to give way
  }

  // Pinned word cards: stay put (and can be dragged aside) until closed,
  // so the pronunciation can be played again and again.
  const [pins, setPins] = useState([]) // [{ id, word, entry, x, y }]
  useEffect(() => { setPins([]) }, [boardId])
  const pinTip = () => {
    if (!tip) return
    const pin = { id: `${tip.word}-${Date.now()}`, word: tip.word, entry: tip.entry, x: tip.x + 12, y: tip.y + 16 }
    setPins((prev) => [...prev.filter((p) => p.word !== tip.word), pin].slice(-6))
    tipHoverRef.current = false
    setTip(null)
  }
  const unpin = (id) => setPins((prev) => prev.filter((p) => p.id !== id))
  const dragPin = (event, id) => {
    if (event.button !== 0 || event.target.closest('button')) return
    event.preventDefault()
    const pin = pins.find((p) => p.id === id)
    if (!pin) return
    const start = { x: event.clientX, y: event.clientY, px: pin.x, py: pin.y }
    const move = (e) => setPins((prev) => prev.map((p) => (p.id === id ? { ...p, x: start.px + e.clientX - start.x, y: start.py + e.clientY - start.y } : p)))
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  // Spotlight: I broadcast my viewport (spotlighting) or follow someone's.
  const [spotlighting, setSpotlighting] = useState(false)
  const [following, setFollowing] = useState(null) // { name }
  const spotlightRef = useRef(false)
  spotlightRef.current = spotlighting
  // A follower who pans/zooms on their own stops being dragged back to the
  // spotlighter's view on the next broadcast (at most ~100ms away) — forcing
  // their view back mid-gesture read as "the board won't move". Resumes
  // following on the next fresh "Spotlight on" so the teacher can still pull
  // everyone back to one place.
  // The pause lasts while they keep moving and 6 s after: one scroll used to
  // stop following for good, so for the student "Spotlight did nothing"
  // (Anastasia Obóznaya's lessons, 2026-10-13).
  const followPausedRef = useRef(false)
  const pausedAtRef = useRef(0)
  const lastSpotViewRef = useRef(null)
  const pauseFollowing = () => { followPausedRef.current = true; pausedAtRef.current = Date.now() }
  const viewBroadcastRef = useRef(0)
  // True while a press is held on the canvas: floating bars step aside.
  const [dragging, setDragging] = useState(false)
  // Fingers currently on the canvas (touch screens): two of them pinch-zoom.
  const touchesRef = useRef(new Map())
  const pinchRef = useRef(null)
  const liveCreatedRef = useRef(null)
  // The draft as state knows it, plus the element created for it this tick.
  const withCreated = (draft) =>
    draft.id || !liveCreatedRef.current ? draft : { ...draft, ...liveCreatedRef.current, created: true }
  const editingTextRef = useRef(null)
  editingTextRef.current = textInput?.id ?? null
  // Someone else changed the text that is open here (both sides can type in
  // it during a lesson): their words go into the editor at once, the caret
  // stays put, and the save afterwards builds on them instead of wiping them.
  const remoteEditRef = useRef(null)
  remoteEditRef.current = (element) => {
    if (!textInput) return
    if (!element) { liveCreatedRef.current = null; submittedRef.current = textInput; setTextInput(null); return }
    const area = textAreaRef.current
    const base = textInput.fontSize
    const fontSize = element.fontSize ?? base
    if (area && (element.text ?? '') !== htmlToMarkup(area, textInput.color, base)) {
      clearTimeout(liveTimerRef.current) // our older unsent keystrokes would undo theirs
      const at = document.activeElement === area ? editorOffsets(area) : null
      area.innerHTML = markupToHtml(element.text ?? '', fontSize)
      if (at) {
        const length = editorPlain(area).length
        setEditorOffsets(area, { start: Math.min(at.start, length), end: Math.min(at.end, length) })
      }
    }
    setTextInput({ ...withCreated(textInput), value: element.text ?? '', fontSize, color: element.color ?? textInput.color })
  }
  const textAreaRef = useRef(null)
  // A native <select> (the font-size picker) blurs the editor the instant
  // its dropdown opens, before onChange ever fires — and does it via a
  // browser-level focus change whose relatedTarget isn't reliably the
  // select itself, so the toolbar's own "was this a toolbar click"
  // relatedTarget check misses it. This ref is set synchronously on
  // mousedown, before that blur, so the editor knows to stay open and wait
  // rather than submit/close out from under the still-in-progress pick.
  const toolbarInteractingRef = useRef(false)
  // The size <select> must keep the focus while its dropdown is open (taking
  // it back closed the list at once), so the caret is remembered here.
  const sizePickRef = useRef(null)
  const [, forceRender] = useState(0)
  const bump = () => forceRender((value) => value + 1)
  // For zoom and pan: refresh the toolbar at most once per frame, not per event.
  const bumpPending = useRef(false)
  const bumpSoon = () => {
    if (bumpPending.current) return
    bumpPending.current = true
    requestAnimationFrame(() => { bumpPending.current = false; bump() })
  }

  const selectedElements = () => {
    const ids = new Set(selectedRef.current)
    return elementsRef.current.filter((item) => ids.has(item.id))
  }
  const selectedElement = () => {
    const items = selectedElements()
    return items.length === 1 ? items[0] : undefined
  }

  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    measureCtx = ctx
    const ratio = window.devicePixelRatio || 1
    const { width: cssWidth, height: cssHeight } = canvas.getBoundingClientRect()
    if (cssWidth === 0 || cssHeight === 0) return

    const targetWidth = Math.round(cssWidth * ratio)
    const targetHeight = Math.round(cssHeight * ratio)
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth
      canvas.height = targetHeight
    }

    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.clearRect(0, 0, cssWidth, cssHeight)

    const view = viewRef.current
    ctx.translate(view.x, view.y)
    ctx.scale(view.scale, view.scale)

    const cropping = cropRef.current
    const editingId = editingTextRef.current
    for (const element of elementsRef.current) {
      if (cropping && element.id === cropping.id) continue
      // One malformed element (a stray NaN coordinate, a crop that no
      // longer matches its image) used to throw partway through this loop
      // and leave the canvas blank — cleared for the frame, never finished
      // — until reload; everything after it in draw order just vanished.
      // Skipping only that element keeps the rest of the board on screen.
      try {
        if (editingId && element.id === editingId) {
          if (element.type === 'note') drawElement(ctx, { ...element, text: '' })
          continue
        }
        drawElement(ctx, element)
      } catch (err) {
        console.error('Failed to draw board element', element.id, element.type, err)
      }
    }
    if (draftRef.current) drawElement(ctx, draftRef.current)

    if (cropping) {
      // Show the whole picture faded, the kept part solid, and handles on it.
      const full = fullImageBox(cropping)
      drawImageElement(ctx, { ...cropping, ...full, crop: FULL_CROP }, 0.35)
      drawImageElement(ctx, cropping)
      drawHandles(ctx, cropping, view.scale, '#eab308')
    } else if (toolRef.current === 'select') {
      const items = selectedElements()
      // The open text shows its own faint frame; handles on top of it got in the way of the caret.
      if (items.length && !editingId) {
        // Faint outline on each member, handles on the group as a whole.
        if (items.length > 1) {
          ctx.save()
          ctx.strokeStyle = 'rgba(99, 102, 241, 0.5)'
          ctx.lineWidth = 1 / view.scale
          for (const item of items) { const b = boundsOf(item); ctx.strokeRect(b.x, b.y, b.w, b.h) }
          ctx.restore()
        }
        drawHandles(ctx, unionBounds(items), view.scale)
      }

      const marquee = marqueeRef.current
      if (marquee) {
        ctx.save()
        ctx.fillStyle = 'rgba(99, 102, 241, 0.12)'
        ctx.strokeStyle = '#6366f1'
        ctx.lineWidth = 1 / view.scale
        ctx.setLineDash([4 / view.scale, 4 / view.scale])
        ctx.fillRect(marquee.x, marquee.y, marquee.w, marquee.h)
        ctx.strokeRect(marquee.x, marquee.y, marquee.w, marquee.h)
        ctx.restore()
      }
    }
  }, [])

  const viewHookRef = useRef(null)
  const scheduleRender = useCallback(() => {
    if (frameRef.current) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      render()
      viewHookRef.current?.()
    })
  }, [render])

  // Text drawn before the font arrived was measured in a fallback font:
  // measure and draw again once it's in.
  useEffect(() => {
    if (!document.fonts?.load) return
    let live = true
    Promise.all(['400', '700', 'italic 400', 'italic 700'].map((w) => document.fonts.load(`${w} 16px Inter`)))
      .then(() => { if (!live) return; widthCache.clear(); layoutCache.clear(); scheduleRender() })
      .catch(() => {})
    return () => { live = false }
  }, [scheduleRender])

  useEffect(() => { requestRepaint = scheduleRender }, [scheduleRender])
  useEffect(() => { scheduleRender() }, [tool, scheduleRender])

  // --- Sync -------------------------------------------------------------------

  useEffect(() => {
    const socket = socketRef.current
    if (!socket || !boardId) return

    elementsRef.current = []
    selectedRef.current = []
    cropRef.current = null
    historyRef.current = { undo: [], redo: [] }
    scheduleRender()

    const open = (quiet) => socket.emit('board:open', boardId, { quiet }, (response) => {
      const local = new Map(elementsRef.current.map((e) => [e.id, e]))
      let elements = dedupe(response?.elements ?? [])
      // Replay what was done offline on top of the server's copy, and send it.
      const ops = offlineOpsRef.current
      if (ops.size) {
        for (const [id, op] of ops) {
          if (op === 'delete') {
            elements = elements.filter((e) => e.id !== id)
            socket.emit('board:delete', id)
          } else if (local.has(id)) {
            const element = local.get(id)
            const index = elements.findIndex((e) => e.id === id)
            if (index === -1) elements.push(element)
            else elements[index] = element
            socket.emit('board:update', element)
          }
        }
        ops.clear()
      }
      elementsRef.current = elements
      if (quiet) { scheduleRender(); bump(); return }
      // A board with content opens showing all of it; an empty one at 100%
      // — or on the element it was opened for (the homework heading).
      setLoadedBoard(boardId)
      const focus = focusElementId && elementsRef.current.find((e) => e.id === focusElementId)
      if (focus) {
        const rect = canvasRef.current?.getBoundingClientRect() ?? { width: 800 }
        viewRef.current = { scale: 1, x: Math.max(40, (rect.width - 600) / 2) - focus.x, y: 80 - focus.y }
      } else if (elementsRef.current.length) {
        // The canvas may not have its size yet on the first paint: fit once it does.
        const rect = canvasRef.current?.getBoundingClientRect()
        if (rect && rect.width > 50) fitAll(1)
        else requestAnimationFrame(() => fitAll(1))
      } else viewRef.current = { x: 0, y: 0, scale: 1 }
      scheduleRender()
      bump()
    })
    // A reconnected socket is a stranger to the server: open the board again,
    // quietly, so nobody else is dragged to it.
    let opened = false
    const reopen = () => { open(opened); opened = true }
    if (socket.connected) reopen()
    socket.on('connect', reopen)

    const onAdd = (element) => {
      const index = elementsRef.current.findIndex((item) => item.id === element.id)
      if (index === -1) elementsRef.current.push(element)
      else elementsRef.current[index] = element
      scheduleRender()
    }
    const onUpdate = (element) => {
      const index = elementsRef.current.findIndex((item) => item.id === element.id)
      if (index !== -1) elementsRef.current[index] = element
      if (element.id === editingTextRef.current) remoteEditRef.current?.(element)
      scheduleRender()
    }
    const onDelete = (id) => {
      if (id === editingTextRef.current) remoteEditRef.current?.(null)
      elementsRef.current = elementsRef.current.filter((item) => item.id !== id)
      selectedRef.current = selectedRef.current.filter((s) => s !== id)
      scheduleRender()
    }
    const onClear = () => { elementsRef.current = []; selectedRef.current = []; scheduleRender() }

    // Following a spotlight: the same scale, the same world point at the centre.
    const onSpotlight = ({ name, on }) => {
      setFollowing(on ? { name } : null)
      if (on) followPausedRef.current = false
      else lastSpotViewRef.current = null
    }
    const onView = (view, resumed = false) => {
      const { scale, cx, cy } = view
      if (!resumed) lastSpotViewRef.current = view
      if (spotlightRef.current) return
      if (followPausedRef.current) {
        // Not while they are drawing or dragging something.
        if (Date.now() - pausedAtRef.current < 6000 || pointerRef.current) return
        followPausedRef.current = false
      }
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      viewRef.current = { scale, x: rect.width / 2 - cx * scale, y: rect.height / 2 - cy * scale }
      scheduleRender()
      bumpSoon()
    }

    socket.on('board:add', onAdd)
    socket.on('board:update', onUpdate)
    socket.on('board:delete', onDelete)
    socket.on('board:clear', onClear)
    const onCursor = ({ from, name, x, y, gone }) => {
      setCursors((prev) => {
        if (gone) { const next = { ...prev }; delete next[from]; return next }
        return { ...prev, [from]: { name, x, y, at: Date.now() } }
      })
    }
    socket.on('board:cursor', onCursor)
    // Cursors that stopped moving fade away.
    const sweep = setInterval(() => {
      setCursors((prev) => {
        const cutoff = Date.now() - 8000
        const next = Object.fromEntries(Object.entries(prev).filter(([, c]) => c.at > cutoff))
        return Object.keys(next).length === Object.keys(prev).length ? prev : next
      })
    }, 2000)
    socket.on('board:spotlight', onSpotlight)
    const onViewEvent = (view) => onView(view)
    socket.on('board:view', onViewEvent)
    // Back to the spotlighter's view 6 s after one's own scrolling stopped,
    // even if they haven't moved since.
    const resume = setInterval(() => {
      if (followPausedRef.current && lastSpotViewRef.current && Date.now() - pausedAtRef.current >= 6000) onView(lastSpotViewRef.current, true)
    }, 1000)

    return () => {
      socket.off('connect', reopen)
      socket.off('board:add', onAdd)
      socket.off('board:update', onUpdate)
      socket.off('board:delete', onDelete)
      socket.off('board:clear', onClear)
      socket.off('board:spotlight', onSpotlight)
      socket.off('board:view', onViewEvent)
      clearInterval(resume)
      socket.off('board:cursor', onCursor)
      clearInterval(sweep)
      setCursors({})
    }
  }, [socketRef, boardId, scheduleRender])

  // While spotlighting, every viewport change goes out (at most ~10/s).
  const broadcastView = () => {
    if (!spotlightRef.current) return
    const now = Date.now()
    if (now - viewBroadcastRef.current < 100) return
    viewBroadcastRef.current = now
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const view = viewRef.current
    socketRef.current?.emit('board:view', {
      scale: view.scale,
      cx: (rect.width / 2 - view.x) / view.scale,
      cy: (rect.height / 2 - view.y) / view.scale
    })
  }
  viewHookRef.current = broadcastView
  const toggleSpotlight = () => {
    const next = !spotlighting
    setSpotlighting(next)
    spotlightRef.current = next
    socketRef.current?.emit('board:spotlight', { on: next })
    if (next) { viewBroadcastRef.current = 0; broadcastView() }
  }
  useEffect(() => () => { if (spotlightRef.current) socketRef.current?.emit('board:spotlight', { on: false }) }, [socketRef])

  useEffect(() => {
    const repaint = () => scheduleRender()
    window.addEventListener('resize', repaint)
    document.addEventListener('visibilitychange', repaint)
    // The canvas may be hidden (Writing shown over it in a call) and come
    // back at a new size: repaint whenever its box changes.
    const observer = typeof ResizeObserver !== 'undefined' && canvasRef.current ? new ResizeObserver(repaint) : null
    observer?.observe(canvasRef.current)
    scheduleRender()
    return () => {
      window.removeEventListener('resize', repaint)
      document.removeEventListener('visibilitychange', repaint)
      observer?.disconnect()
    }
  }, [scheduleRender])

  // Edits made while the connection is down: a reconnected socket must open
  // the board before the server takes any edit, and the reopen used to
  // replace the board with the server's copy — strokes and moves from those
  // seconds vanished. Kept here (id → 'upsert' | 'delete') and replayed.
  const offlineOpsRef = useRef(new Map())
  const emit = (event, payload) => {
    const socket = socketRef.current
    if (socket && socket.connected === false) {
      if (event === 'board:add' || event === 'board:update') offlineOpsRef.current.set(payload.id, 'upsert')
      else if (event === 'board:delete') offlineOpsRef.current.set(payload, 'delete')
      else if (event === 'board:clear') offlineOpsRef.current.clear()
      return
    }
    socket?.emit(event, payload)
  }
  // Elements this person made: added in this session, or stored with their id as author.
  const { user: me } = useAuth()
  const ownIdsRef = useRef(new Set())
  const isOwn = (element) => Boolean(element?.id) && (ownIdsRef.current.has(element.id) || (me?.id && element.authorId === me.id))
  // A student erases and edits only what they made; the teacher's material
  // they may only move. The server enforces the same (studentMayChange).
  const mayChange = (element) => !wordPicker || isOwn(element)

  // --- History ----------------------------------------------------------------
  //
  // Only this user's own actions are recorded, so undo never touches what the
  // other participant drew. Each entry knows how to reverse itself.

  const MAX_HISTORY = 100

  const record = (action) => {
    const history = historyRef.current
    history.undo.push(action)
    if (history.undo.length > MAX_HISTORY) history.undo.shift()
    history.redo = []
    bump()
  }

  // Raw mutations: change local state and tell the server, no history.
  const addRaw = (element) => {
    ownIdsRef.current.add(element.id)
    if (!elementsRef.current.some((item) => item.id === element.id)) elementsRef.current.push(element)
    emit('board:add', element)
  }
  const removeRaw = (id) => {
    elementsRef.current = elementsRef.current.filter((item) => item.id !== id)
    selectedRef.current = selectedRef.current.filter((s) => s !== id)
    emit('board:delete', id)
  }
  const replaceRaw = (element) => {
    const index = elementsRef.current.findIndex((item) => item.id === element.id)
    if (index !== -1) elementsRef.current[index] = element
    emit('board:update', element)
  }

  const applyAction = (action, direction) => {
    const ops = action.type === 'batch' ? action.actions : [action]
    for (const op of direction === 'undo' ? [...ops].reverse() : ops) {
      if (op.type === 'add') direction === 'undo' ? removeRaw(op.element.id) : addRaw(op.element)
      if (op.type === 'delete') direction === 'undo' ? addRaw(op.element) : removeRaw(op.element.id)
      if (op.type === 'update') replaceRaw(direction === 'undo' ? op.before : op.after)
    }
    scheduleRender()
    bump()
  }

  const undo = () => {
    const action = historyRef.current.undo.pop()
    if (!action) return
    applyAction(action, 'undo')
    historyRef.current.redo.push(action)
  }

  const redo = () => {
    const action = historyRef.current.redo.pop()
    if (!action) return
    applyAction(action, 'redo')
    historyRef.current.undo.push(action)
  }

  // --- Edits (recorded) -------------------------------------------------------

  const commitRef = useRef(null)
  const commit = (element) => {
    addRaw(element)
    record({ type: 'add', element: structuredClone(element) })
    scheduleRender()
  }
  commitRef.current = commit

  // Visual-only replace while dragging; the history entry is written on pointer up.
  const replace = (element) => {
    const index = elementsRef.current.findIndex((item) => item.id === element.id)
    if (index !== -1) elementsRef.current[index] = element
    scheduleRender()
  }

  const recordUpdates = (befores) => {
    const actions = []
    for (const before of befores) {
      const after = elementsRef.current.find((item) => item.id === before.id)
      if (after && JSON.stringify(after) !== JSON.stringify(before)) {
        actions.push({ type: 'update', before: structuredClone(before), after: structuredClone(after) })
      }
    }
    if (actions.length === 1) record(actions[0])
    else if (actions.length > 1) record({ type: 'batch', actions })
  }

  const remove = (ids) => {
    const gone = new Set(Array.isArray(ids) ? ids : [ids])
    const chosen = elementsRef.current.filter((item) => gone.has(item.id))
    const removed = chosen.filter(mayChange)
    if (removed.length < chosen.length) showToast("You can erase only what you wrote — the teacher's material stays")
    if (!removed.length) return
    for (const item of removed) removeRaw(item.id)
    for (const item of removed) if (item.mistakeId && onMistakeRemoved) onMistakeRemoved(item.id)
    const actions = removed.map((item) => ({ type: 'delete', element: structuredClone(item) }))
    record(actions.length === 1 ? actions[0] : { type: 'batch', actions })
    scheduleRender()
  }

  // --- Images -----------------------------------------------------------------

  // A textbook page (a JPEG data URL) goes onto the board where the teacher
  // is looking, about as wide as the screen so the print stays readable.
  const placePage = async (dataUrl) => {
    if (!onUploadImage) return
    const size = await new Promise((resolve) => {
      const probe = new Image()
      probe.onload = () => resolve({ w: probe.naturalWidth, h: probe.naturalHeight })
      probe.onerror = () => resolve({ w: 1400, h: 1980 })
      probe.src = dataUrl
    })
    const src = await onUploadImage(dataUrl)
    if (!src) throw new Error('The page could not be saved')
    const rect = canvasRef.current.getBoundingClientRect()
    const view = viewRef.current
    const w = (rect.width * 0.7) / view.scale
    const h = size.h * (w / size.w)
    const element = {
      id: newId(), type: 'image', color: '#000000', width: 1,
      x: (rect.width / 2 - view.x) / view.scale - w / 2,
      y: (rect.height * 0.08 - view.y) / view.scale,
      w, h, src
    }
    commitRef.current?.(element)
    selectedRef.current = []
    setTool('select')
    scheduleRender()
    bump()
  }

  const placeImage = useCallback(async (file) => {
    if (!onUploadImage) return
    if (!isImageFile(file)) {
      if (file) showToast('Only pictures can go on the board')
      return
    }

    let prepared
    try { prepared = await prepareImage(file) } catch {
      showToast('This picture could not be read — try a PNG or JPEG')
      return
    }
    const { dataUrl, size } = prepared

    const src = await onUploadImage(dataUrl)
    if (!src) return

    const rect = canvasRef.current.getBoundingClientRect()
    const view = viewRef.current
    const maxWidth = (rect.width * 0.6) / view.scale
    const scale = Math.min(1, maxWidth / size.w)
    const w = size.w * scale
    const h = size.h * scale

    const element = {
      id: newId(),
      type: 'image',
      color: '#000000',
      width: 1,
      x: (rect.width / 2 - view.x) / view.scale - w / 2,
      y: (rect.height / 2 - view.y) / view.scale - h / 2,
      w,
      h,
      src
    }
    commitRef.current?.(element)
    selectedRef.current = [element.id]
    setTool('select')
  }, [onUploadImage])

  // A picture dragged in from Finder or a fresh screenshot is caught anywhere
  // in the window, not only over the bare canvas: dropped on the toolbar or a
  // video tile it used to slip past, and the browser opened it instead.
  const [dragOver, setDragOver] = useState(false)
  useEffect(() => {
    if (!onUploadImage) return
    const hasFiles = (event) => [...(event.dataTransfer?.types ?? [])].includes('Files')
    const onDragOver = (event) => {
      if (!hasFiles(event) || event.defaultPrevented) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
      setDragOver(true)
    }
    const onDragLeave = (event) => { if (!event.relatedTarget) setDragOver(false) }
    const onDrop = (event) => {
      setDragOver(false)
      if (!hasFiles(event) || event.defaultPrevented) return
      event.preventDefault()
      const files = [...event.dataTransfer.files]
      const fromItems = [...(event.dataTransfer.items ?? [])].filter((i) => i.kind === 'file').map((i) => i.getAsFile()).filter(Boolean)
      const file = files.find(isImageFile) ?? fromItems.find(isImageFile) ?? files[0] ?? fromItems[0]
      if (!file) showToast('Nothing arrived from that app — copy the picture (⌘C) and paste it on the board (⌘V)')
      placeImage(file)
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [onUploadImage, placeImage])

  useEffect(() => {
    const onPaste = (event) => {
      // Typing or pasting anywhere else (Writing open next to the board in a
      // call, a form…) is not for the board: its letter shortcuts, Delete and
      // image paste would fire.
      if (textInput || event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.tagName === 'SELECT' || event.target.isContentEditable) return

      const image = [...(event.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'))
      if (image) {
        event.preventDefault()
        placeImage(image.getAsFile())
        return
      }

      const text = event.clipboardData?.getData('text/plain') ?? ''
      if (text.includes(CLIPBOARD_MARK)) {
        try {
          const parsed = JSON.parse(text)
          if (parsed.mark === CLIPBOARD_MARK && Array.isArray(parsed.elements)) {
            event.preventDefault()
            pasteElements(parsed.elements)
            return
          }
        } catch {
          // not ours after all
        }
      }

      if (clipboardRef.current.length) {
        event.preventDefault()
        pasteElements(clipboardRef.current)
      }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [placeImage, textInput])

  // --- Clipboard --------------------------------------------------------------

  const copySelection = async () => {
    const items = selectedElements()
    if (!items.length) return false
    clipboardRef.current = items.map((item) => structuredClone(item))
    pasteCountRef.current = 0
    try {
      await navigator.clipboard.writeText(JSON.stringify({ mark: CLIPBOARD_MARK, elements: clipboardRef.current }))
    } catch {
      // Clipboard access can be denied; the in-memory copy still works on this board.
    }
    return true
  }

  // Inserts copies shifted so they do not land exactly on the originals;
  // repeated pastes step further each time.
  const pasteElements = (source) => {
    if (!source?.length) return
    pasteCountRef.current += 1
    const shift = PASTE_OFFSET * pasteCountRef.current
    const copies = source.map((item) => ({ ...moveElement(structuredClone(item), shift, shift), id: newId() }))
    for (const copy of copies) addRaw(copy)
    const actions = copies.map((copy) => ({ type: 'add', element: structuredClone(copy) }))
    record(actions.length === 1 ? actions[0] : { type: 'batch', actions })
    selectedRef.current = copies.map((copy) => copy.id)
    setTool('select')
    scheduleRender()
    bump()
  }

  const duplicateSelection = () => {
    const items = selectedElements()
    if (!items.length) return
    pasteCountRef.current = 0
    pasteElements(items)
  }

  // --- Vocabulary ---------------------------------------------------------------

  const showToast = (text) => {
    setToast(text)
    clearTimeout(showToast.timer)
    showToast.timer = setTimeout(() => setToast(null), 3500)
  }

  // The highlighted word while editing, or the selected texts' items
  // (one per line or comma) — short ones only, so a sentence is never added whole.
  // A highlighted fragment goes in whole, as one card — a phrase or a short
  // sentence, not just single words (up to MAX_TERM_WORDS words).
  const MAX_TERM_WORDS = 10
  const wordsToAdd = () => {
    if (textInput) {
      const selection = window.getSelection()
      const text = editorHasSelection() ? selection.toString() : ''
      const term = text.trim().replace(/\s+/g, ' ').replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, '')
      return term && term.split(' ').length <= MAX_TERM_WORDS ? [term] : []
    }
    return selectedWords().map((w) => w.replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, '')).filter((w) => w && w.split(/\s+/).length <= MAX_TERM_WORDS)
  }

  const addWordsToVocabulary = () => {
    if (!onAddWords || addingWords) return
    const words = wordsToAdd()
    if (!words.length) { showToast(textInput ? `Highlight a word or a phrase (up to ${MAX_TERM_WORDS} words) first` : `Nothing to add: one word or phrase per line, up to ${MAX_TERM_WORDS} words`); return }
    withTarget((classroomId) => addWordsTo(words, classroomId))
  }
  const addWordsTo = async (words, classroomId) => {
    setAddingWords(true)
    try {
      const result = await onAddWords(words, classroomId)
      if (!result) return
      const where = result.student ? `${result.student}'s vocabulary` : 'From my board'
      const parts = []
      if (result.added) parts.push(`Added ${result.added} ${result.added === 1 ? 'card' : 'cards'} to ${where}`)
      else parts.push(`Already in ${where}`)
      if (result.skipped?.length) parts.push(`no entry: ${result.skipped.join(', ')}`)
      showToast(parts.join(' · '))
    } catch (err) {
      showToast(err.message)
    } finally {
      setAddingWords(false)
    }
  }

  // --- AI assist ----------------------------------------------------------------

  // Splits the selected text objects into words/phrases: one per line, or comma-separated.
  const selectedWords = () =>
    selectedElements()
      .filter((item) => item.type === 'text' || item.type === 'note')
      .flatMap((item) => String(item.text ?? '').split('\n').map((line) => textRuns(line).map((run) => run.text).join('')).flatMap((line) => line.split(/[,;]+/)))
      .map((w) => w.trim())
      .filter(Boolean)

  const runAssist = async (mode) => {
    if (!onAssist || assisting) return
    const words = selectedWords()
    if (!words.length) return

    setAssisting(mode)
    try {
      let items
      // A failed request is a note on the board, never the end of the lesson
      // (an error used to replace the whole call page — 2026-10-07).
      try { items = await onAssist(mode, words.slice(0, 40)) } catch (err) { showToast(`AI assistant: ${err?.message || 'request failed'}`); return }
      if (!items?.length) return

      const lines = mode === 'translate'
        ? items.map((i) => `${i.word}  ${i.transcription}  —  ${i.translation}`)
        : items.map((i) => i.question)
      // Questions: plain black, a blank line between them so each reads on
      // its own (and there's room to answer next to it).
      const questions = mode === 'questions'

      // Place the result just below the selection, matching its text size.
      const group = unionBounds(selectedElements())
      const sample = selectedElements().find((item) => item.type === 'text')
      const element = {
        id: newId(),
        type: 'text',
        color: questions ? COLORS[0] : '#a5b4fc',
        width: sample?.width ?? width,
        x: group.x,
        y: group.y + group.h + 24,
        text: lines.join(questions ? '\n\n' : '\n'),
        fontSize: sample?.fontSize ?? 16 + width * 2
      }
      commit(element)
      selectedRef.current = [element.id]
      bump()
    } finally {
      setAssisting(null)
    }
  }

  // --- Crop -------------------------------------------------------------------

  const finishCrop = () => {
    const cropped = cropRef.current
    if (!cropped) return
    cropRef.current = null
    const before = elementsRef.current.find((item) => item.id === cropped.id)
    replaceRaw(cropped)
    if (before) record({ type: 'update', before: structuredClone(before), after: structuredClone(cropped) })
    selectedRef.current = [cropped.id]
    scheduleRender()
    bump()
  }

  const cancelCrop = () => {
    cropRef.current = null
    scheduleRender()
    bump()
  }

  const resetCrop = () => {
    const selected = selectedElement()
    if (!selected || selected.type !== 'image' || !selected.crop) return
    const full = fullImageBox(selected)
    const restored = { ...selected, ...full }
    delete restored.crop
    replaceRaw(restored)
    record({ type: 'update', before: structuredClone(selected), after: structuredClone(restored) })
    scheduleRender()
    bump()
  }

  // --- Keyboard ---------------------------------------------------------------

  useEffect(() => {
    const onKey = (event) => {
      // Space held (not while typing anywhere): a temporary hand tool.
      const typing = textInput || ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) || event.target.isContentEditable
      if (event.code === 'Space' && !typing) {
        spaceHeldRef.current = true
        return
      }

      if (textInput && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b') {
        event.preventDefault()
        toggleBold()
        return
      }
      if (textInput && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'i') {
        event.preventDefault()
        toggleItalic()
        return
      }
      if (textInput && (event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'x') {
        event.preventDefault()
        toggleStrike()
        return
      }
      // Typing or pasting anywhere else (Writing open next to the board in a
      // call, a form…) is not for the board: its letter shortcuts, Delete and
      // image paste would fire.
      if (textInput || event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.tagName === 'SELECT' || event.target.isContentEditable) return

      if (cropRef.current) {
        if (event.key === 'Escape') cancelCrop()
        if (event.key === 'Enter') finishCrop()
        return
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedRef.current.length) {
        event.preventDefault()
        remove(selectedRef.current)
      }
      if (event.key === 'Escape') {
        // Escape: cancel tool and return to select, or just clear selection
        if (tool !== 'select') {
          pickTool('select')
          scheduleRender()
          bump()
        } else {
          selectedRef.current = []
          scheduleRender()
          bump()
        }
        return
      }

      const mod = event.metaKey || event.ctrlKey
      if (!mod && !event.altKey) {
        // H: Hand Tool (pan)
        if (event.key.toLowerCase() === 'h') {
          event.preventDefault()
          pickTool('hand')
          scheduleRender()
          bump()
          return
        }

        // Tool shortcuts from TOOLS array
        const shortcut = TOOLS.find((item) => item.key.toLowerCase() === event.key.toLowerCase())
          ?? null
        if (onMistake && event.key.toLowerCase() === 'x' && !shortcut) {
          event.preventDefault()
          setMistakesOpen((v) => !v)
          return
        }
        if (shortcut) {
          pickTool(shortcut.id)
          scheduleRender()
          bump()
          return
        }

        // Zoom hotkeys
        if (event.key === '1') {
          event.preventDefault()
          if (event.shiftKey) {
            // Shift+1: zoom to 100%
            zoomTo(1)
          } else {
            // 1: fit all on screen
            fitAll(1)
          }
          return
        }
        if (event.key === '+' || event.key === '=') {
          event.preventDefault()
          zoomAroundCentre(1.25)
          return
        }
        if (event.key === '-' || event.key === '_') {
          event.preventDefault()
          zoomAroundCentre(0.8)
          return
        }
      }

      // Cmd/Ctrl + zoom
      if (mod && (event.key === '+' || event.key === '=')) {
        event.preventDefault()
        zoomAroundCentre(1.25)
        return
      }
      if (mod && (event.key === '-' || event.key === '_')) {
        event.preventDefault()
        zoomAroundCentre(0.8)
        return
      }

      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        event.shiftKey ? redo() : undo()
        return
      }
      if (mod && event.key === 'y') { event.preventDefault(); redo(); return }
      if (mod && event.key === 'a' && tool === 'select') {
        event.preventDefault()
        selectedRef.current = elementsRef.current.map((item) => item.id)
        scheduleRender()
        bump()
      }
      if (mod && event.key === 'c' && selectedRef.current.length) {
        event.preventDefault()
        copySelection()
      }
      if (mod && event.key === 'x') {
        const ids = [...selectedRef.current]
        if (ids.length) {
          event.preventDefault()
          copySelection().then(() => remove(ids))
        }
      }
      if (mod && event.key === 'd') {
        event.preventDefault()
        duplicateSelection()
      }
      // Cmd+V is handled by the paste listener so image and object pastes share one path.
    }
    const zoomAroundCentre = (factor) => {
      const box = canvasRef.current?.getBoundingClientRect()
      if (box) zoomAround(factor, box.width / 2, box.height / 2)
    }
    const onBlur = () => { spaceHeldRef.current = false }
    window.addEventListener('blur', onBlur)
    const onKeyUp = (event) => {
      // Space released: return to previous tool
      if (event.code === 'Space') {
        spaceHeldRef.current = false
      }
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('keyup', onKeyUp)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  })

  // --- Pointer ----------------------------------------------------------------

  const toWorld = (event) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const view = viewRef.current
    return {
      x: (event.clientX - rect.left - view.x) / view.scale,
      y: (event.clientY - rect.top - view.y) / view.scale
    }
  }

  // Edit a text (or a note's text) in place: the text hides while the
  // editor sits over it. A note's editor sits inside its padding.
  const openEditor = (target, caretAt = null) => {
    if (!mayChange(target)) return
    // A mistake note is edited as the mistake (said / should be), so the
    // board and the student's notebook stay the same thing.
    if (target.type === 'note' && target.mistakeId && onMistake) { openMistakeEdit(target); return }
    if (phone) { openPhoneDraft({ mode: 'edit', element: target }); return }
    const note = target.type === 'note'
    hideTip()
    selectedRef.current = [target.id]
    liveCreatedRef.current = null
    setTextInput({
      caretAt,
      id: target.id,
      note,
      x: target.x + (note ? NOTE_PAD : 0),
      y: target.y + (note ? NOTE_PAD : 0),
      w: note ? Math.max(20, target.w - 2 * NOTE_PAD) : target.w,
      value: target.text ?? '',
      fontSize: target.fontSize ?? (note ? 18 : 20),
      color: target.color,
      before: structuredClone(target)
    })
    scheduleRender()
  }

  // The text as it reads (no colour/bold markup): what the phone box edits.
  const plainOf = (text) => String(text ?? '').split('\n').map((line) => textRuns(line).map((run) => run.text).join('')).join('\n')
  const openPhoneDraft = (draft) => {
    selectedRef.current = draft.element ? [draft.element.id] : []
    setPhoneDraft({ ...draft, value: draft.element ? plainOf(draft.element.text) : '' })
    scheduleRender()
  }
  const finishPhoneDraft = () => {
    const draft = phoneDraft
    setPhoneDraft(null)
    if (!draft) return
    const value = draft.value.replace(/\s+$/, '')
    if (draft.mode === 'new') {
      if (!value.trim()) return
      commit({ id: newId(), type: 'text', color, width, x: draft.x, y: draft.y, text: value, fontSize: lastFontSizeRef.current })
    } else {
      const before = elementsRef.current.find((item) => item.id === draft.element.id)
      if (!before || value === plainOf(before.text)) { selectedRef.current = []; scheduleRender(); return } // unchanged: formatting kept
      if (!value.trim() && before.type === 'text') { remove(before.id); return }
      const after = { ...before, text: value }
      replaceRaw(after)
      record({ type: 'update', before: structuredClone(before), after: structuredClone(after) })
    }
    selectedRef.current = []
    scheduleRender()
    bump()
  }

  const openMistakeEdit = (element) => {
    const rect = canvasRef.current?.getBoundingClientRect() ?? { width: 800, height: 600 }
    const v = viewRef.current
    const b = boundsOf(element)
    const x = Math.max(8, Math.min(b.x * v.scale + v.x, rect.width - 360))
    const y = Math.max(8, Math.min((b.y + b.h) * v.scale + v.y + 8, rect.height - 190))
    selectedRef.current = [element.id]
    setMistakeEdit({ element, ...mistakeNoteParts(element.text), x, y, busy: false, error: '' })
    scheduleRender()
  }
  const saveMistakeEdit = async (event) => {
    event.preventDefault()
    const edit = mistakeEdit
    if (!edit || edit.busy) return
    const said = edit.said.trim()
    const correct = edit.correct.trim()
    if (!said) { setMistakeEdit({ ...edit, error: 'What the student said is needed' }); return }
    setMistakeEdit({ ...edit, busy: true, error: '' })
    try {
      const { mistake } = await api.updateMistake(edit.element.mistakeId, { said, correct })
      const before = elementsRef.current.find((item) => item.id === edit.element.id) ?? edit.element
      const after = { ...before, text: mistakeNoteText(said, correct, mistake.labels ?? []) }
      replaceRaw(after)
      record({ type: 'update', before: structuredClone(before), after: structuredClone(after) })
      scheduleRender()
      setMistakeEdit(null)
      showToast('Mistake updated on the board and in the notebook')
    } catch (err) {
      setMistakeEdit((current) => current && { ...current, busy: false, error: err.message })
    }
  }

  const addTipWord = (word) => {
    withTarget(async (classroomId) => {
      setAddingWords(true)
      try {
        const result = await onAddWords([word], classroomId)
        const where = result?.student ? `${result.student}'s vocabulary` : 'From my board'
        showToast(result?.added ? `“${word}” added to ${where}` : `“${word}” is already in ${where}`)
      } catch (err) { showToast(err.message) } finally { setAddingWords(false) }
    })
  }
  // The word card's contents, shared by the hover card and pinned ones.
  const wordTipBody = (card, corner) => (
    <>
      <div className="word-tip-head">
        <strong>{card.word}</strong>
        {card.entry.transcription && <span className="muted"> {card.entry.transcription}</span>}
        <PlayButton src={card.entry.audio} small />
        {corner}
      </div>
      <div>{card.entry.translation}</div>
      {onAddWords && (
        <button type="button" className="tool word-tip-add" disabled={addingWords} onClick={() => addTipWord(card.word)}>
          {addingWords ? 'Adding…' : '+ Vocabulary'}
        </button>
      )}
    </>
  )

  const openWordCard = (word, event) => {
    const rect = canvasRef.current.getBoundingClientRect()
    tipWordRef.current = null; clearTimeout(tipTimer.current); setTip(null)
    setWordCard({ word: word.toLowerCase(), x: Math.max(8, Math.min(event.clientX - rect.left, rect.width - 300)), y: Math.max(8, Math.min(event.clientY - rect.top + 14, rect.height - 270)) })
    selectedRef.current = []
    scheduleRender()
  }

  const handleDoubleClick = (event) => {
    if (tool !== 'select' || cropRef.current) return
    const point = toWorld(event)
    const target = [...elementsRef.current].reverse().find((element) => hitTest(element, point.x, point.y))
    if (target?.type === 'text' || target?.type === 'note') {
      // For a student, a word under the double-click opens its card instead
      // of the editor (a click on the selected text still edits it).
      const word = wordPicker ? wordUnderPoint(target, point.x, point.y) : null
      clearTimeout(editClickTimer.current)
      if (word && isEnglishWord(word)) { openWordCard(word, event); return }
      openEditor(target)
      return
    }
    if (target?.type !== 'image') return

    // A screenshot or photo has no text elements to double-click into, only
    // pixels — OCR (started on first hover, see hoverDictionary) finds the
    // word under the point the same way wordUnderPoint does for real text.
    if (wordPicker) {
      const word = wordUnderImagePoint(target, point.x, point.y)
      if (word && isEnglishWord(word)) { openWordCard(word, event); return }
    }

    cropRef.current = { ...target }
    selectedRef.current = [target.id]
    scheduleRender()
    bump()
  }

  const handlePointerDown = (event) => {
    if (trackTouch(event)) return
    if (textInput) return
    hideTip()
    // Keep receiving moves even when the pointer crosses a floating bar.
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* not supported */ }
    setDragging(true)
    const point = toWorld(event)
    const scale = viewRef.current.scale
    clearTimeout(dwellTimerRef.current)
    workSpotRef.current = point

    // Middle mouse button (button === 1) or Alt key always enable panning, regardless of tool
    if (event.button === 1 || event.altKey) {
      pointerRef.current = { mode: 'pan', startX: event.clientX, startY: event.clientY, origin: { ...viewRef.current } }
      return
    }

    // Space key held: temporary hand tool for panning
    if (spaceHeldRef.current && event.button === 0) {
      pointerRef.current = { mode: 'pan', startX: event.clientX, startY: event.clientY, origin: { ...viewRef.current } }
      return
    }

    // Hand tool: left click + drag to pan
    if (tool === 'hand' && event.button === 0) {
      pointerRef.current = { mode: 'pan', startX: event.clientX, startY: event.clientY, origin: { ...viewRef.current } }
      return
    }

    // Crop mode: drag the crop corners, or click outside to apply.
    if (cropRef.current) {
      const corner = cornerAt(cropRef.current, point, scale)
      if (corner) {
        pointerRef.current = { mode: 'crop', corner, start: { ...cropRef.current } }
        return
      }
      const side = cropSideAt(cropRef.current, point, scale)
      if (side) {
        pointerRef.current = { mode: 'crop', side, start: { ...cropRef.current } }
        return
      }
      // Inside the frame: slide the frame over the picture, same size.
      if (hitTest(cropRef.current, point.x, point.y)) {
        pointerRef.current = { mode: 'crop', slide: point, start: { ...cropRef.current } }
        return
      }
      finishCrop()
      return
    }

    // On a phone nothing is decided until the finger either lifts (a tap:
    // type) or travels (a drag: move the thing under it, or the board).
    if (phone) {
      // A tap on the board while the typing box is open puts the text in.
      if (phoneDraft) { finishPhoneDraft(); return }
      const target = [...elementsRef.current].reverse().find((element) => hitTest(element, point.x, point.y))
      pointerRef.current = { mode: 'tap', target, point, startX: event.clientX, startY: event.clientY, origin: { ...viewRef.current } }
      return
    }

    if (tool === 'eraser') {
      const target = [...elementsRef.current].reverse().find((element) => hitTest(element, point.x, point.y))
      if (target) remove(target.id)
      return
    }

    if (tool === 'select') {
      const items = selectedElements()

      // A corner handle of the selection takes priority over what is under it.
      if (items.length && items.every(mayChange)) {
        const group = unionBounds(items)
        const handle = handleAt(group, point, scale)
        if (handle) {
          // The side handles of a text sit right at its line ends: a plain
          // click there (no drag) still opens the text, like a click inside.
          const only = items.length === 1 && (items[0].type === 'text' || items[0].type === 'note') ? items[0] : null
          const extra = {
            downAt: { x: event.clientX, y: event.clientY },
            moved: false,
            editOnClick: only ? { target: only, clientX: event.clientX, clientY: event.clientY } : null
          }
          pointerRef.current = isCorner(handle)
            ? { mode: 'resize', ids: items.map((i) => i.id), corner: handle, start: group, originals: items, ...extra }
            : { mode: 'resize', ids: items.map((i) => i.id), edge: handle, start: group, originals: items, ...extra }
          return
        }
      }

      const target = [...elementsRef.current].reverse().find((element) => hitTest(element, point.x, point.y))
      if (target) {
        const already = selectedRef.current.includes(target.id)
        if (event.shiftKey) {
          // Shift toggles membership without moving anything (the Select
          // tool adds on a plain click instead, see below).
          selectedRef.current = already
            ? selectedRef.current.filter((s) => s !== target.id)
            : [...selectedRef.current, target.id]
          scheduleRender()
          bump()
          return
        }
        // Clicking a member keeps the group so it can be dragged together.
        // A click (not a drag) on the one selected text opens it for editing
        // with the caret where the click landed.
        // With Select, a press on something new adds it to what's already
        // picked, and the whole group moves from there.
        if (!already) selectedRef.current = boxSelect ? [...selectedRef.current, target.id] : [target.id]
        pointerRef.current = {
          mode: 'move', ids: [...selectedRef.current], last: point, originals: selectedElements().map((i) => structuredClone(i)),
          editOnClick: !boxSelect && already && selectedRef.current.length === 1 && (target.type === 'text' || target.type === 'note') ? { target, clientX: event.clientX, clientY: event.clientY } : null,
          downAt: { x: event.clientX, y: event.clientY },
          moved: false
        }
      } else if (event.shiftKey || boxSelect) {
        // With Move, a plain drag on empty space pans (dragging the screen
        // around is what "Move" suggests), so the box is behind Shift there;
        // with Select it's the box straight away (a fresh one, unless Shift).
        marqueeRef.current = { x: point.x, y: point.y, w: 0, h: 0 }
        pointerRef.current = { mode: 'marquee', origin: point, additive: event.shiftKey, base: [...selectedRef.current] }
        if (!event.shiftKey) selectedRef.current = [] // a plain click on empty space lets go of everything
      } else {
        selectedRef.current = []
        pointerRef.current = { mode: 'pan', startX: event.clientX, startY: event.clientY, origin: { ...viewRef.current } }
      }
      scheduleRender()
      bump()
      return
    }

    // With the text or note tool, pressing on existing text (or a note)
    // selects it and switches to Move, so no text ever lands on top of other
    // text. Anything else — an image above all — takes a new text on top of
    // it. Pens and markers still draw over everything.
    const under = (tool === 'text' || tool === 'note')
      ? [...elementsRef.current].reverse().find((element) =>
          (element.type === 'text' || element.type === 'note') && hitTest(element, point.x, point.y))
      : null
    if (under) {
      setTool('select')
      selectedRef.current = [under.id]
      pointerRef.current = { mode: 'move', ids: [under.id], last: point, originals: [structuredClone(under)] }
      scheduleRender()
      bump()
      return
    }

    selectedRef.current = []

    if (tool === 'text') {
      // Open the editor on release: opening it on press let the browser's own
      // mousedown focus change blur the new textarea straight away.
      pointerRef.current = { mode: 'text', point }
      return
    }

    if (tool === 'pen' || tool === 'marker') {
      const marker = tool === 'marker'
      draftRef.current = {
        id: newId(), type: 'path', color, width: marker ? markerWidth(width) : width,
        points: [point.x, point.y], ...(marker ? { highlight: true } : {})
      }
      pointerRef.current = { mode: 'draw' }
      return
    }

    if (tool === 'note') {
      // A fresh note opens for typing straight away.
      const fill = NOTE_FILLS[Math.max(0, COLORS.indexOf(color))]
      const note = { id: newId(), type: 'note', color: COLORS[0], width, x: point.x, y: point.y, w: NOTE_SIZE, h: NOTE_SIZE, fill, text: '', fontSize: 18 }
      commit(note)
      setTool('select')
      pointerRef.current = { mode: 'open-editor', element: note }
      return
    }

    draftRef.current = { id: newId(), type: tool, color, width, x: point.x, y: point.y, w: 0, h: 0 }
    pointerRef.current = { mode: 'shape' }
  }

  // Cursor tells what a press would do: resize at a handle, move over an element.
  const updateHoverCursor = (event) => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Hand tool: always grab cursor (panning is always possible)
    if (tool === 'hand' || spaceHeldRef.current) {
      canvas.style.cursor = 'grab'
      return
    }

    // Crop mode: resize arrows on a corner or side, a move cross inside.
    if (cropRef.current) {
      const crop = cropRef.current
      const point = toWorld(event)
      const scale = viewRef.current.scale
      const corner = cornerAt(crop, point, scale)
      const side = corner ? null : cropSideAt(crop, point, scale)
      canvas.style.cursor = corner ? CURSOR_FOR[corner.id] : side ? CURSOR_FOR[side] : hitTest(crop, point.x, point.y) ? 'move' : ''
      return
    }

    // Pen/marker/shapes: crosshair (already set via CSS for tool-pen, etc.)
    if (tool !== 'select') {
      canvas.style.cursor = ''
      return
    }

    // Select tool: depends on what's under the cursor
    const point = toWorld(event)
    const scale = viewRef.current.scale
    const items = selectedElements()
    if (items.length) {
      const group = unionBounds(items)
      const handle = handleAt(group, point, scale)
      if (handle) { canvas.style.cursor = CURSOR_FOR[handle.id]; return }
    }
    const over = elementsRef.current.some((element) => hitTest(element, point.x, point.y))
    canvas.style.cursor = over ? 'move' : boxSelect ? 'crosshair' : 'grab'
  }

  const handlePointerMove = (event) => {
    if (canvasRef.current) {
      const world = toWorld(event)
      lastCursorWorldRef.current = world
      broadcastCursor(world)
      clearTimeout(dwellTimerRef.current)
      dwellTimerRef.current = setTimeout(() => { workSpotRef.current = world }, 500)
    }
    if (event.pointerType === 'touch' && touchesRef.current.has(event.pointerId)) {
      const rect = canvasRef.current.getBoundingClientRect()
      touchesRef.current.set(event.pointerId, { x: event.clientX - rect.left, y: event.clientY - rect.top })
      if (pinchRef.current) { movePinch(); return }
    }
    let pointer = pointerRef.current
    if (!pointer) { updateHoverCursor(event); hoverDictionary(event); return }

    if (pointer.mode === 'tap') {
      if (Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) < 8) return
      const target = pointer.target
      // Only staff rearrange the board (see the move branch below); for a
      // student a drag anywhere just moves around the board.
      pointer = pointerRef.current = target && !wordPicker
        ? { mode: 'move', ids: [target.id], last: pointer.point, originals: [structuredClone(target)], moved: true }
        : { mode: 'pan', startX: pointer.startX, startY: pointer.startY, origin: pointer.origin }
    }

    if (pointer.mode === 'pan') {
      pauseFollowing()
      viewRef.current = {
        ...viewRef.current,
        x: pointer.origin.x + (event.clientX - pointer.startX),
        y: pointer.origin.y + (event.clientY - pointer.startY)
      }
      scheduleRender()
      return
    }

    const point = toWorld(event)

    if (pointer.mode === 'draw' && draftRef.current) {
      draftRef.current.points.push(point.x, point.y)
      scheduleRender()
      return
    }

    if (pointer.mode === 'shape' && draftRef.current) {
      draftRef.current.w = point.x - draftRef.current.x
      draftRef.current.h = point.y - draftRef.current.y
      scheduleRender()
      return
    }

    if (pointer.mode === 'move') {
      // A hand never clicks perfectly still: under 5 px it is a click, and a
      // second click on a selected text must open it, not nudge it.
      if (!pointer.moved && pointer.downAt && Math.hypot(event.clientX - pointer.downAt.x, event.clientY - pointer.downAt.y) < 5) return
      const dx = point.x - pointer.last.x
      const dy = point.y - pointer.last.y
      if (Math.abs(dx) + Math.abs(dy) > 0) pointer.moved = true
      // A student can drag an element and see it move on their own screen —
      // it just never saves or reaches anyone else (see the emit gate below):
      // one student's fidgeting must never shift what the teacher or other
      // students on the same board see.
      const ids = new Set(pointer.ids)
      elementsRef.current = elementsRef.current.map((item) => (ids.has(item.id) ? moveElement(item, dx, dy) : item))
      pointer.last = point
      scheduleRender()
      return
    }

    if (pointer.mode === 'resize') {
      if (!pointer.moved && pointer.downAt && Math.hypot(event.clientX - pointer.downAt.x, event.clientY - pointer.downAt.y) < 5) return
      pointer.moved = true
      // Images, text and any group keep proportions; hold Shift to stretch. A lone shape is free.
      const lone = pointer.originals.length === 1 ? pointer.originals[0] : null
      const proportional = !lone || lone.type === 'image' || lone.type === 'text' || lone.type === 'sticker'
      const box = pointer.edge
        ? resizeBoxEdge(pointer.start, pointer.edge, point)
        : resizeBox(pointer.start, pointer.corner, point, proportional !== event.shiftKey)
      const updated = fitGroup(pointer.originals, pointer.start, box)
      const byId = new Map(updated.map((item) => [item.id, item]))
      elementsRef.current = elementsRef.current.map((item) => byId.get(item.id) ?? item)
      scheduleRender()
      return
    }

    if (pointer.mode === 'marquee') {
      const o = pointer.origin
      const box = { x: Math.min(o.x, point.x), y: Math.min(o.y, point.y), w: Math.abs(point.x - o.x), h: Math.abs(point.y - o.y) }
      marqueeRef.current = box
      const caught = elementsRef.current.filter((item) => insideBox(item, box)).map((item) => item.id)
      selectedRef.current = pointer.additive ? [...new Set([...pointer.base, ...caught])] : caught
      scheduleRender()
      return
    }

    if (pointer.mode === 'crop' && cropRef.current) {
      const start = pointer.start
      let box
      if (pointer.slide) {
        const full = fullImageBox(start)
        const x = Math.max(full.x, Math.min(start.x + point.x - pointer.slide.x, full.x + full.w - start.w))
        const y = Math.max(full.y, Math.min(start.y + point.y - pointer.slide.y, full.y + full.h - start.h))
        box = { x, y, w: start.w, h: start.h }
      } else if (pointer.side) box = moveSide(start, pointer.side, point)
      else box = resizeBox(start, pointer.corner, point, false)
      cropRef.current = cropFromBox(start, box)
      scheduleRender()
    }
  }

  const handlePointerUp = (event) => {
    setDragging(false)
    if (event) releaseTouch(event)
    const pointer = pointerRef.current
    pointerRef.current = null
    if (!pointer) return

    if (pointer.mode === 'tap') {
      if (event?.type !== 'pointerup') return // the finger slid off or was cancelled: no tap
      const now = Date.now()
      const last = lastTapRef.current
      const double = last && now - last.time < 320 && Math.hypot(event.clientX - last.x, event.clientY - last.y) < 30
      lastTapRef.current = double ? null : { time: now, x: event.clientX, y: event.clientY }
      // A double tap is a double-click: a student's word card, a teacher's crop.
      if (double) { clearTimeout(editClickTimer.current); handleDoubleClick(event); return }
      const target = pointer.target
      if (target?.type === 'text' || target?.type === 'note') {
        const at = { clientX: event.clientX, clientY: event.clientY }
        const open = () => openEditor(target, at)
        // A student's tap may be the first half of a double tap on a word.
        if (wordPicker) { clearTimeout(editClickTimer.current); editClickTimer.current = setTimeout(open, 300) } else open()
        return
      }
      if (target) return // a picture or a drawing: nothing to type into
      openPhoneDraft({ mode: 'new', x: pointer.point.x, y: pointer.point.y })
      return
    }

    if ((pointer.mode === 'move' || pointer.mode === 'resize') && !pointer.moved && pointer.editOnClick) {
      const open = () => openEditor(pointer.editOnClick.target, { clientX: pointer.editOnClick.clientX, clientY: pointer.editOnClick.clientY })
      // A student's second click may be the start of a double-click on a
      // word: wait a moment, and let the double-click cancel the editor.
      if (wordPicker) { clearTimeout(editClickTimer.current); editClickTimer.current = setTimeout(open, 280) } else open()
      return
    }

    // Every drag is saved, a student's included: what they moved stays where
    // they put it for everyone (Galina, 2026-10-06 — keeping the teacher's
    // material in place made a student's moves silently undo on reload).
    if (pointer.mode === 'move' || pointer.mode === 'resize') {
      const ids = new Set(pointer.ids)
      for (const element of elementsRef.current) if (ids.has(element.id)) emit('board:update', element)
      recordUpdates(pointer.originals)
      if (phone) selectedRef.current = [] // no handles cluttering a phone screen
      bump()
      return
    }

    if (pointer.mode === 'marquee') {
      const box = marqueeRef.current
      marqueeRef.current = null
      // With Select, a click (not a drag) on empty board is done selecting:
      // back to Move, so the next drag moves the board instead of drawing a box.
      const scale = viewRef.current.scale
      if (boxSelect && !pointer.additive && (!box || (box.w * scale < 4 && box.h * scale < 4))) setBoxSelect(false)
      scheduleRender()
      bump()
      return
    }

    if (pointer.mode === 'crop' || pointer.mode === 'pan') return

    if (pointer.mode === 'text') {
      liveCreatedRef.current = null
      setTextInput({ x: pointer.point.x, y: pointer.point.y, value: '', fontSize: lastFontSizeRef.current, color })
      return
    }
    if (pointer.mode === 'open-editor') {
      openEditor(pointer.element)
      return
    }

    const draft = draftRef.current
    draftRef.current = null
    if (!draft) return

    const isEmptyShape = draft.type !== 'path' && Math.abs(draft.w) < 3 && Math.abs(draft.h) < 3
    const isEmptyStroke = draft.type === 'path' && draft.points.length < 4
    if (isEmptyShape || isEmptyStroke) { scheduleRender(); return }

    // Boxes and circles dragged towards the top-left get normalised so the
    // corner handles land where they look. Arrows keep direction.
    if ((draft.type === 'rect' || draft.type === 'ellipse') && (draft.w < 0 || draft.h < 0)) {
      Object.assign(draft, boundsOf(draft))
    }
    commit(draft)
  }

  // Zoom by a factor around a point given in canvas pixels.
  const zoomAround = (factor, canvasX, canvasY) => {
    pauseFollowing()
    const view = viewRef.current
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * factor))
    viewRef.current = {
      scale,
      x: canvasX - (canvasX - view.x) * (scale / view.scale),
      y: canvasY - (canvasY - view.y) * (scale / view.scale)
    }
    scheduleRender()
    bumpSoon()
  }

  // Two fingers on a touch screen: spread to zoom in, pinch to zoom out,
  // and the board follows the fingers.
  const pinchGeometry = () => {
    const [a, b] = [...touchesRef.current.values()]
    return { distance: Math.hypot(b.x - a.x, b.y - a.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  }

  const trackTouch = (event) => {
    if (event.pointerType !== 'touch') return false
    const rect = canvasRef.current.getBoundingClientRect()
    touchesRef.current.set(event.pointerId, { x: event.clientX - rect.left, y: event.clientY - rect.top })
    if (touchesRef.current.size === 2 && !pinchRef.current) {
      // A second finger cancels whatever the first one started.
      draftRef.current = null
      pointerRef.current = null
      marqueeRef.current = null
      pinchRef.current = { ...pinchGeometry(), view: { ...viewRef.current } }
      scheduleRender()
    }
    return touchesRef.current.size >= 2
  }

  const movePinch = () => {
    const start = pinchRef.current
    if (!start || touchesRef.current.size < 2) return
    pauseFollowing()
    const now = pinchGeometry()
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, start.view.scale * (now.distance / Math.max(1, start.distance))))
    // Keep the world point that was under the fingers' midpoint under it still.
    const worldX = (start.x - start.view.x) / start.view.scale
    const worldY = (start.y - start.view.y) / start.view.scale
    viewRef.current = { scale, x: now.x - worldX * scale, y: now.y - worldY * scale }
    scheduleRender()
    bumpSoon()
  }

  const releaseTouch = (event) => {
    if (event.pointerType !== 'touch') return
    touchesRef.current.delete(event.pointerId)
    if (touchesRef.current.size < 2 && pinchRef.current) {
      pinchRef.current = null
      bump()
    }
  }

  // Safari on a Mac reports trackpad pinches as gesture events, not ctrl+wheel.
  // Registered once: the scale at gesture start lives in a ref, so re-renders
  // during the pinch cannot reset it.
  const gestureRef = useRef({ base: null })
  const zoomAroundRef = useRef(null)
  zoomAroundRef.current = zoomAround
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onStart = (event) => { event.preventDefault(); gestureRef.current.base = viewRef.current.scale }
    const onChange = (event) => {
      event.preventDefault()
      const base = gestureRef.current.base ?? viewRef.current.scale
      const rect = canvas.getBoundingClientRect()
      const target = Math.min(MAX_SCALE, Math.max(MIN_SCALE, base * event.scale))
      zoomAroundRef.current(target / viewRef.current.scale, event.clientX - rect.left, event.clientY - rect.top)
    }
    const onEnd = (event) => { event.preventDefault(); gestureRef.current.base = null }
    // React's wheel listener is passive, so the page would zoom too.
    const blockPageZoom = (event) => event.preventDefault()
    // A pinch that starts over the toolbar, a video or any other overlay
    // never reached the canvas, and the browser zoomed the whole page —
    // toolbars and videos went off screen. While the board is up, a pinch
    // (ctrl+wheel) anywhere on the page zooms the board instead.
    const pinchAnywhere = (event) => {
      if (!event.ctrlKey || event.target === canvas) return
      const rect = canvas.getBoundingClientRect()
      if (!rect.width) return // the board is hidden (Writing is open)
      event.preventDefault()
      if (gestureRef.current.base !== null) return
      zoomAroundRef.current(Math.exp(-event.deltaY * 0.006), event.clientX - rect.left, event.clientY - rect.top)
    }
    const gestureAnywhere = (event) => { if (event.target !== canvas && canvas.getBoundingClientRect().width) event.preventDefault() }
    canvas.addEventListener('wheel', blockPageZoom, { passive: false })
    canvas.addEventListener('gesturestart', onStart)
    canvas.addEventListener('gesturechange', onChange)
    canvas.addEventListener('gestureend', onEnd)
    window.addEventListener('wheel', pinchAnywhere, { passive: false })
    document.addEventListener('gesturestart', gestureAnywhere)
    document.addEventListener('gesturechange', gestureAnywhere)
    return () => {
      canvas.removeEventListener('wheel', blockPageZoom)
      canvas.removeEventListener('gesturestart', onStart)
      canvas.removeEventListener('gesturechange', onChange)
      canvas.removeEventListener('gestureend', onEnd)
      window.removeEventListener('wheel', pinchAnywhere)
      document.removeEventListener('gesturestart', gestureAnywhere)
      document.removeEventListener('gesturechange', gestureAnywhere)
    }
  }, [])

  const handleWheel = (event) => {
    const view = viewRef.current
    if (event.ctrlKey || event.metaKey) {
      // Trackpad pinches arrive as ctrl+wheel in Chrome and Firefox. Safari
      // sends both; while its gesture is running, the gesture handler zooms.
      if (gestureRef.current.base !== null) return
      const rect = canvasRef.current.getBoundingClientRect()
      // Pinches report small deltas; this rate feels like Figma's.
      zoomAround(Math.exp(-event.deltaY * 0.006), event.clientX - rect.left, event.clientY - rect.top)
      return
    } else {
      pauseFollowing()
      viewRef.current = { ...view, x: view.x - event.deltaX, y: view.y - event.deltaY }
    }
    scheduleRender()
  }

  const submitText = () => {
    // Closing the editor blurs it, which calls this again with the same draft.
    if (!textInput || submittedRef.current === textInput) return
    submittedRef.current = textInput
    const draft = withCreated(textInput)
    liveCreatedRef.current = null
    // The DOM is the source of truth while editing; read it one last time.
    const area = textAreaRef.current
    const latest = area ? htmlToMarkup(area, draft.color, draft.fontSize) : draft.value
    setTextInput(null)
    const text = latest.replace(/\s+$/, '')
    if (phone) selectedRef.current = [] // a phone shows no selection handles

    clearTimeout(liveTimerRef.current)
    if (draft.id) {
      if (!text.trim() && !draft.note) { remove(draft.id); return }
      const after = { ...liveBase(draft), text, fontSize: draft.fontSize, color: draft.color }
      if (draft.created) {
        // Born live a moment ago: finish it and record it as one addition.
        replaceRaw(after)
        record({ type: 'add', element: structuredClone(after) })
        if (!phone) selectedRef.current = [after.id]
        setTool('select')
        scheduleRender()
        bump()
        return
      }
      if (JSON.stringify(after) === JSON.stringify(draft.before)) { scheduleRender(); return }
      replaceRaw(after)
      record({ type: 'update', before: draft.before, after: structuredClone(after) })
      scheduleRender()
      bump()
      return
    }

    if (!text.trim()) { scheduleRender(); return }
    const element = { id: newId(), type: 'text', color: draft.color, width, x: draft.x, y: draft.y, text, fontSize: draft.fontSize }
    commit(element)
    // Done typing: the text is selected and ready to be moved.
    if (!phone) selectedRef.current = [element.id]
    setTool('select')
    bump()
  }

  // Reads the editor back into markup after any change.
  // Typing is visible to everyone as it happens: the first keystroke of a new
  // text creates the element, later ones update it (at most ~5 times a
  // second); the history entry is written once, when editing finishes.
  const submittedRef = useRef(null)
  const liveSentRef = useRef(0)
  const liveTimerRef = useRef(null)
  // The element as it is on the board now: someone may have moved it while
  // it was open, and a save must not pull it back to where it was.
  const liveBase = (draft) => elementsRef.current.find((item) => item.id === draft.id) ?? draft.before
  const pushLive = (draft, value) => {
    if (!draft.id || !draft.before) return
    const element = { ...liveBase(draft), text: value, fontSize: draft.fontSize, color: draft.color }
    const send = () => { liveSentRef.current = Date.now(); replace(element); emit('board:update', element) }
    clearTimeout(liveTimerRef.current)
    if (Date.now() - liveSentRef.current > 200) send()
    else liveTimerRef.current = setTimeout(send, 200)
  }
  const syncEditor = () => {
    const area = textAreaRef.current
    if (!area || !textInput) return
    const value = htmlToMarkup(area, textInput.color, textInput.fontSize)
    // A paste fires several input events before React has stored the new
    // element's id, so the id lives in a ref as well: one element per editor.
    const live = liveCreatedRef.current
    if (!textInput.id && !live) {
      if (!value.trim()) { setTextInput({ ...textInput, value }); return }
      // First real character of a new text: put it on the board for everyone.
      const element = { id: newId(), type: 'text', color: textInput.color, width, x: textInput.x, y: textInput.y, text: value, fontSize: textInput.fontSize }
      addRaw(element)
      scheduleRender()
      liveCreatedRef.current = { id: element.id, before: structuredClone(element) }
      setTextInput({ ...textInput, id: element.id, value, before: liveCreatedRef.current.before, created: true })
      return
    }
    const draft = withCreated(textInput)
    setTextInput({ ...draft, value })
    pushLive(draft, value)
  }

  // Is the editor's selection collapsed (nothing highlighted)?
  const editorHasSelection = () => {
    const area = textAreaRef.current
    const selection = window.getSelection()
    return Boolean(area && selection && selection.rangeCount && !selection.isCollapsed && area.contains(selection.anchorNode))
  }

  // Formatting goes through the browser's own editing commands, which split
  // the selection correctly; with nothing selected the whole text is styled.
  const runCommand = (command, argument) => {
    const area = textAreaRef.current
    if (!area || !textInput) return
    area.focus({ preventScroll: true })
    if (!editorHasSelection()) {
      const range = document.createRange()
      range.selectNodeContents(area)
      const selection = window.getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
    }
    document.execCommand('styleWithCSS', false, true)
    document.execCommand(command, false, argument)
    syncEditor()
  }
  const toggleBold = () => runCommand('bold')
  const toggleItalic = () => runCommand('italic')
  const toggleStrike = () => runCommand('strikeThrough')

  // Colours the selection; with nothing selected, recolours the whole text
  // (or the note itself).
  const colorSelection = (value) => {
    const area = textAreaRef.current
    if (!area || !textInput) return
    if (!editorHasSelection()) {
      if (textInput.note) {
        const fill = NOTE_FILLS[Math.max(0, COLORS.indexOf(value))]
        setTextInput({ ...textInput, before: { ...textInput.before, fill } })
        replace({ ...textInput.before, fill })
      } else {
        // Whole text: drop per-word colours so the new colour shows everywhere.
        for (const span of area.querySelectorAll('[style*="color"], font[color]')) {
          span.style && (span.style.color = '')
          span.removeAttribute?.('color')
        }
        setTextInput({ ...textInput, color: value, value: htmlToMarkup(area, value, textInput.fontSize) })
      }
      requestAnimationFrame(() => area.focus({ preventScroll: true }))
      return
    }
    runCommand('foreColor', inkOf(value))
  }

  // Styles applied to selected (not edited) text elements as a whole.
  const wrapSelectedTexts = (open, close) => {
    const items = selectedElements().filter((item) => (item.type === 'text' || item.type === 'note') && item.text)
    if (!items.length) return
    const befores = items.map((item) => structuredClone(item))
    const allWrapped = items.every((item) => item.text.startsWith(open) && item.text.endsWith(close))
    for (const item of items) {
      const text = allWrapped
        ? item.text.slice(open.length, item.text.length - close.length)
        : open + item.text + close
      replaceRaw({ ...item, text })
    }
    recordUpdates(befores)
    scheduleRender()
    bump()
  }
  const colorSelectedTexts = (value) => {
    const items = selectedElements().filter((item) => item.type === 'text' || item.type === 'note')
    if (!items.length) return
    const befores = items.map((item) => structuredClone(item))
    const fill = NOTE_FILLS[Math.max(0, COLORS.indexOf(value))]
    // A text's own coloured words used to keep their colour, so "the colour
    // doesn't change" — the whole text takes the new one, as in the editor.
    for (const item of items) replaceRaw(item.type === 'note' ? { ...item, fill } : { ...item, color: value, text: stripColorMarkup(item.text) })
    recordUpdates(befores)
    scheduleRender()
    bump()
  }

  // A colour from the bottom dock: the colour for what comes next, and — as
  // people expect — for what is being edited or is selected right now
  // (before, it only set the next pen/text colour, so a selected text
  // "didn't change colour").
  const recolor = (value) => {
    setColor(value)
    if (textInput) { colorSelection(value); return }
    const items = selectedElements()
    if (!items.length) return
    if (items.some((item) => item.type === 'text' || item.type === 'note')) colorSelectedTexts(value)
    const others = items.filter((item) => item.type !== 'text' && item.type !== 'note' && item.type !== 'image' && 'color' in item)
    if (!others.length) return
    const befores = others.map((item) => structuredClone(item))
    for (const item of others) replaceRaw({ ...item, color: value })
    recordUpdates(befores)
    scheduleRender()
    bump()
  }

  // Changes the size of the text being edited, or of the selected text elements.
  const setFontSize = (size) => {
    // Only a size picked here carries over to the next new text — editing a
    // big heading must not make every later text heading-sized.
    lastFontSizeRef.current = size
    if (textInput) {
      const area = textAreaRef.current
      const at = area && (editorOffsets(area) ?? sizePickRef.current)
      sizePickRef.current = null
      if (!area || !at) {
        setTextInput({ ...textInput, fontSize: size })
        requestAnimationFrame(() => textAreaRef.current?.focus({ preventScroll: true }))
        return
      }
      // The size goes to every line the caret or highlight touches — the
      // whole line, so a line never mixes sizes. All lines → the text's own size.
      const base = textInput.fontSize
      const lines = htmlToMarkup(area, textInput.color, base).split('\n')
      const plain = editorPlain(area)
      const from = plain.slice(0, at.start).split('\n').length - 1
      const to = plain.slice(0, at.end).split('\n').length - 1
      const whole = from === 0 && to >= lines.length - 1
      const nextBase = whole ? size : base
      const value = lines.map((line, index) => {
        const { size: own, body } = splitLineSize(line, base)
        return withLineSize(body, whole || (index >= from && index <= to) ? size : own, nextBase)
      }).join('\n')
      area.innerHTML = markupToHtml(value, nextBase)
      // The size <select> keeps the focus until its change is over, so the
      // caret goes back once that settles.
      const restore = () => { area.focus({ preventScroll: true }); setEditorOffsets(area, at) }
      restore()
      requestAnimationFrame(restore)
      const draft = { ...withCreated(textInput), value, fontSize: nextBase }
      setTextInput(draft)
      pushLive(draft, value)
      setEditorLineSize(size)
      return
    }
    const items = selectedElements().filter((item) => item.type === 'text' || item.type === 'note')
    if (!items.length) return
    const befores = items.map((item) => structuredClone(item))
    for (const item of items) replaceRaw({ ...item, fontSize: size, text: stripLineSizes(item.text) })
    recordUpdates(befores)
    scheduleRender()
    bump()
  }

  // The editor is filled once per opening; afterwards the DOM is the source
  // of truth and only read back. The caret goes where the click landed.
  const editorKey = textInput ? `${textInput.id ?? 'new'}:${textInput.x},${textInput.y}` : null
  // The size box shows the size of the line the caret is on.
  const [editorLineSize, setEditorLineSize] = useState(null)
  const editorBase = textInput?.fontSize
  useEffect(() => {
    if (!editorBase) { setEditorLineSize(null); return }
    const onSelection = () => {
      const area = textAreaRef.current
      const node = window.getSelection()?.anchorNode
      if (!area || !node || !area.contains(node)) return
      const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node
      const px = parseFloat(getComputedStyle(element).fontSize)
      const rootPx = parseFloat(getComputedStyle(area).fontSize)
      if (px && rootPx) setEditorLineSize(roundSize(editorBase * px / rootPx))
    }
    onSelection()
    document.addEventListener('selectionchange', onSelection)
    return () => document.removeEventListener('selectionchange', onSelection)
  }, [editorBase])
  useEffect(() => {
    const area = textAreaRef.current
    if (!area || !textInput) return
    area.innerHTML = markupToHtml(textInput.value, textInput.fontSize)
    area.focus({ preventScroll: true })
    // An overflow-hidden box still scrolls to a focused child; keep it put.
    if (area.parentElement) { area.parentElement.scrollLeft = 0; area.parentElement.scrollTop = 0 }
    const at = textInput.caretAt
    let range = null
    if (at && document.caretRangeFromPoint) range = document.caretRangeFromPoint(at.clientX, at.clientY)
    else if (at && document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(at.clientX, at.clientY)
      if (pos) { range = document.createRange(); range.setStart(pos.offsetNode, pos.offset); range.collapse(true) }
    }
    if (!range || !area.contains(range.startContainer)) {
      range = document.createRange()
      range.selectNodeContents(area)
      range.collapse(false)
    }
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorKey])

  const handleClear = () => {
    if (!window.confirm('Clear the board for everyone?')) return
    const all = elementsRef.current.map((item) => structuredClone(item))
    elementsRef.current = []
    selectedRef.current = []
    emit('board:clear')
    if (all.length) record({ type: 'batch', actions: all.map((element) => ({ type: 'delete', element })) })
    scheduleRender()
  }

  const zoomTo = (scale, aroundX, aroundY) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const cx = aroundX ?? rect.width / 2
    const cy = aroundY ?? rect.height / 2
    const view = viewRef.current
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
    viewRef.current = {
      scale: next,
      x: cx - (cx - view.x) * (next / view.scale),
      y: cy - (cy - view.y) * (next / view.scale)
    }
    scheduleRender()
    bump()
  }

  // Show every element on the board, never larger than maxScale.
  const fitAll = (maxScale = 1) => {
    const canvas = canvasRef.current
    if (!canvas || !elementsRef.current.length) return
    const rect = canvas.getBoundingClientRect()
    const box = unionBounds(elementsRef.current)
    // A phone fits the content's width only — fitting everything would make
    // the text unreadable — and shows its end, where the latest lesson is.
    const phone = rect.width < 720
    const pad = phone ? 16 : 60
    const scale = Math.min(maxScale, Math.max(MIN_SCALE, phone
      ? (rect.width - pad * 2) / Math.max(box.w, 1)
      : Math.min((rect.width - pad * 2) / Math.max(box.w, 1), (rect.height - pad * 2) / Math.max(box.h, 1))))
    const overflow = phone && box.h * scale > rect.height - pad * 2
    viewRef.current = {
      scale,
      x: (rect.width - box.w * scale) / 2 - box.x * scale,
      y: overflow ? rect.height - 170 - (box.y + box.h) * scale : (rect.height - box.h * scale) / 2 - box.y * scale
    }
    scheduleRender()
    bump()
  }

  const resetView = () => {
    viewRef.current = { x: 0, y: 0, scale: 1 }
    scheduleRender()
    bump()
  }

  // Everything from every lesson stays on the one board: a new lesson starts
  // with a dated heading below all existing content, and the view jumps
  // straight there — no animation (it used to glide over a third of a
  // second, which a manual pan/zoom in that window would fight until it
  // finished; simpler and sturdier to just land on the target directly).
  const glideTo = (target) => {
    viewRef.current = target
    scheduleRender()
    bump()
  }

  // A new section heading goes where the teacher is working (the last click
  // or resting point on the board, see workSpot), selected so it can be
  // dragged into place. It used to go under everything on the board, which
  // on a long board meant somewhere far off screen. Doesn't move the view.
  // addBlock (below) still puts its block under everything and reveals it.
  const addHeading = (text, color, { below = false } = {}) => {
    const items = elementsRef.current
    const { point, view } = workSpot()
    const box = below && items.length ? unionBounds(items) : null
    const x = box ? Math.min(box.x, view.x + 400) : Math.min(point.x, view.x + view.w - 480 / viewRef.current.scale)
    const y = box ? box.y + box.h + 100 : point.y
    const element = { id: newId(), type: 'text', color, width: 6, x, y, text, fontSize: 28 }
    commit(element)
    selectedRef.current = [element.id]
    setTool('select')
    scheduleRender()
    bump()
  }
  // A sticker — an emoji or a short phrase — in the middle of the current
  // view, selected so it can be dragged where it belongs.
  const addSticker = (sticker) => {
    const rect = canvasRef.current?.getBoundingClientRect() ?? { width: 800, height: 600 }
    const v = viewRef.current
    const jitter = () => (Math.random() - 0.5) * 80
    const cx = (rect.width / 2 - v.x) / v.scale + jitter()
    const cy = (rect.height / 2 - v.y) / v.scale + jitter()
    const element = { id: newId(), type: 'sticker', kind: sticker.kind, color: COLORS[0], width: 1, x: cx - 55, y: cy - 21, w: 110, h: 42 }
    commit(element)
    selectedRef.current = [element.id]
    setTool('select')
    bump()
  }
  useImperativeHandle(ref, () => ({ addSticker }), [addSticker])

  // A heading with a block of lines under it (numbered), below everything.
  // Unlike addHeading's other callers, this one is triggered from outside
  // the board entirely (a lesson summary's "insert" button) — the person
  // isn't already looking at the board, so it's the one case that still
  // needs to bring the new content into view.
  const addBlock = (title, lines, color) => {
    const rect = canvasRef.current?.getBoundingClientRect() ?? { width: 800, height: 600 }
    const v = viewRef.current
    const cx = (rect.width / 2 - v.x) / v.scale
    const cy = (rect.height / 2 - v.y) / v.scale
    viewRef.current = { scale: 1, x: rect.width / 2 - cx, y: rect.height / 2 - cy }
    addHeading(title, color, { below: true })
    const heading = elementsRef.current[elementsRef.current.length - 1]
    if (!heading) return
    glideTo({ scale: 1, x: 40 - heading.x, y: 80 - heading.y })
    const text = lines.map((line, i) => `${i + 1}. ${line}`).join('\n')
    commit({ id: newId(), type: 'text', color: COLORS[0], width: 6, x: heading.x, y: heading.y + 48, text, fontSize: 20, w: 720 })
    setTool('select')
  }
  const startLesson = () => {
    const date = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
    addHeading(`— Lesson · ${date} —`, COLORS[0])
  }
  // A homework heading in the accent colour so it stands out.
  const startHomework = () => addHeading('— Homework —', COLORS[5])
  // The trial lesson's placement test — a heading and two columns of
  // sentences — where the teacher last clicked; one undo step.
  const [addingTest, setAddingTest] = useState(false)
  const addPlacementTest = async () => {
    if (addingTest) return
    setAddingTest(true)
    try {
      const { items } = await api.trialTestItems()
      const { point, view } = workSpot()
      const x = Math.min(point.x, view.x + view.w - 480 / viewRef.current.scale)
      const y = point.y
      const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      const column = (list, cx) => ({ id: newId(), type: 'text', color: COLORS[0], width: 6, x: cx, y: y + 56, w: 640, fontSize: 20, text: list.map((i) => `${i.n}. ${i.ru}`).join('\n') })
      const made = [
        { id: newId(), type: 'text', color: COLORS[3], width: 6, x, y, text: `— Placement test · ${date} —`, fontSize: 28 },
        column(items.slice(0, 18), x),
        column(items.slice(18), x + 700)
      ]
      for (const element of made) addRaw(element)
      record({ type: 'batch', actions: made.map((element) => ({ type: 'add', element: structuredClone(element) })) })
      selectedRef.current = made.map((element) => element.id)
      setTool('select')
      scheduleRender()
      bump()
    } catch (err) {
      showToast(err.message)
    } finally {
      setAddingTest(false)
    }
  }

  const view = viewRef.current
  const cropping = Boolean(cropRef.current)
  // Floating text bar: above the text being edited, or the selected text.
  const textBar = (() => {
    if (cropping) return null
    let box = null
    let barColor = null
    if (textInput) {
      // Where the text is now: someone may have moved it while it is open.
      const live = textInput.id && elementsRef.current.find((item) => item.id === textInput.id)
      box = live ? { x: live.x, y: live.y } : { x: textInput.x, y: textInput.y }
      barColor = textInput.color
    } else if (tool === 'select') {
      const items = selectedElements()
      if (!items.length) return null
      const first = items.find((i) => i.type === 'text' || i.type === 'note')
      // Pictures and shapes get no bar (Delete/⌘D still work); a cropped
      // picture keeps one for Uncrop.
      const cropped = items.length === 1 && items[0].type === 'image' && items[0].crop
      if (!first && !cropped) return null
      box = unionBounds(items)
      barColor = first?.color ?? null
    } else return null
    const wrapWidth = canvasRef.current?.getBoundingClientRect().width ?? 800
    return {
      x: Math.min(Math.max(8, box.x * view.scale + view.x), Math.max(8, wrapWidth - 560)),
      y: Math.max(8, box.y * view.scale + view.y - 52),
      // Screen-space top/bottom of what the bar is for (the open editor is measured after render).
      boxTop: box.y * view.scale + view.y,
      boxBottom: box.h != null ? (box.y + box.h) * view.scale + view.y : null,
      color: barColor
    }
  })()
  // Zoomed in, the text's spot can be off screen or near an edge: the bar
  // is nudged back inside the board after every render.
  const textToolbarRef = useRef(null)
  useLayoutEffect(() => {
    const bar = textToolbarRef.current
    const host = canvasRef.current?.getBoundingClientRect()
    if (!bar || !host) return
    bar.style.transform = ''
    const r = bar.getBoundingClientRect()
    const right = Math.min(host.right, window.innerWidth) - 8
    const bottom = Math.min(host.bottom, window.innerHeight) - 8
    const dx = r.right > right ? right - r.right : r.left < host.left + 8 ? host.left + 8 - r.left : 0
    let dy = r.bottom > bottom ? bottom - r.bottom : r.top < host.top + 8 ? host.top + 8 - r.top : 0
    // A text near the top edge: the bar would sit on its first line and eat
    // the clicks meant for the caret, so it goes underneath instead.
    const editor = textAreaRef.current?.getBoundingClientRect()
    const boxTop = editor ? editor.top : host.top + (textBar?.boxTop ?? Infinity)
    const boxBottom = editor ? editor.bottom : textBar?.boxBottom != null ? host.top + textBar.boxBottom : null
    if (boxBottom != null && r.bottom + dy > boxTop && boxBottom + 8 + r.height <= bottom) dy = boxBottom + 8 - r.top
    if (dx || dy) bar.style.transform = `translate(${Math.round(dx)}px, ${Math.round(dy)}px)`
  })
  // Where the open text is drawn now (it can be moved by someone else while open).
  const editorAt = (() => {
    if (!textInput) return null
    const live = textInput.id && elementsRef.current.find((item) => item.id === textInput.id)
    if (!live) return { x: textInput.x, y: textInput.y }
    const pad = live.type === 'note' ? NOTE_PAD : 0
    return { x: live.x + pad, y: live.y + pad }
  })()
  const textLike = textInput ? [] : selectedElements().filter((i) => i.type === 'text' || i.type === 'note')
  const showTextControls = Boolean(textInput) || textLike.length > 0

  // A corner-dragged text can have any size; the list shows it alongside the presets.
  const currentFontSize = Math.round(textInput ? (editorLineSize ?? textInput.fontSize) : (textLike[0]?.fontSize ?? 20))
  const fontSizeOptions = FONT_SIZES.includes(currentFontSize) ? FONT_SIZES : [...FONT_SIZES, currentFontSize].sort((a, b) => a - b)
  const selected = selectedElement()

  return (
    <div className={`whiteboard${dragOver ? ' drag-over' : ''}`}>
      <div className="board-canvas-wrap">
        <canvas
          ref={canvasRef}
          className={`board-canvas tool-${cropping ? 'crop' : tool}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={(e) => { clearTimeout(dwellTimerRef.current); handlePointerUp(e) }}
          onPointerCancel={handlePointerUp}
          // iOS raises the keyboard only for a focus made inside a touch
          // handler; the tap's editor has just opened, so focus it here too.
          onTouchEnd={() => {
            const area = phoneDraftRef.current ?? textAreaRef.current
            if (phone && area && document.activeElement !== area) area.focus({ preventScroll: true })
          }}
          onDoubleClick={handleDoubleClick}
          onWheel={handleWheel}
          onContextMenu={(e) => e.preventDefault()}
        />

        {/* Corner chip with the board's name, like a Figma file tab. On a
            phone only the way back stays. */}
        {phone ? (
          <div className="board-phone-corner">
            {onClose && <button className="chip-back board-back-phone" onClick={onClose} title="Back">{backLabel}</button>}
            {/* Lost somewhere on a big board: one tap shows all of it. */}
            <button className="board-back-phone board-fit-phone" onClick={() => fitAll(2)} title="Show the whole board" aria-label="Show the whole board">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
            </button>
          </div>
        ) : (
        <div className="board-chip">
          {onClose && <button className="chip-back" onClick={onClose} title="Back">{backLabel}</button>}
          <strong>{title ?? 'Board'}</strong>
          {subtitle && <span className="muted"> · {subtitle}</span>}
          {students?.length > 1 && (
            // A pair/group board: whose notebook and vocabulary the saves go to.
            // Remembered per board, so it must stay switchable right here.
            <select className="chip-call ghost-chip chip-select" value={target ?? ''} onChange={(e) => e.target.value && chooseTarget(e.target.value)} title="Mistakes and words saved from this board go to this student">
              {!target && <option value="">Mistakes & words for…</option>}
              {students.map((s) => <option key={s.classroomId} value={s.classroomId}>For {s.name}</option>)}
            </select>
          )}
          {onOpenWriting && (writingStudents?.length > 1 ? (
            // A board shared with several students: pick whose writing.
            <select className="chip-call ghost-chip chip-select" value="" onChange={(e) => { if (e.target.value) onOpenWriting(e.target.value) }} title="Open a student's writing document">
              <option value="">Writing…</option>
              {writingStudents.map((s) => <option key={s.classroomId} value={s.classroomId}>{s.name}</option>)}
            </select>
          ) : (
            <button className="chip-call ghost-chip" onClick={() => onOpenWriting()} title="Open this student's writing document">
              Writing
            </button>
          ))}
          {canSpotlight && (
            <button className={`chip-call ${spotlighting ? 'on' : 'ghost-chip'}`} onClick={toggleSpotlight} title="Everyone on this board follows your view">
              {spotlighting ? 'Spotlight on' : 'Spotlight me'}
            </button>
          )}
          {onStartCall && (
            <button className="chip-call" onClick={onStartCall} title="Start a call on this board and get a link to send">
              Start call
            </button>
          )}
        </div>
        )}

        {Object.entries(cursors).map(([id, c]) => (
          <div key={id} className="peer-cursor" style={{ left: c.x * view.scale + view.x, top: c.y * view.scale + view.y }}>
            <svg width="16" height="20" viewBox="0 0 16 20"><path d="M1 1 L15 10 L8 11 L4.5 19 Z" fill="#f4b9d9" stroke="#14453f" strokeWidth="1.2" /></svg>
            <span>{c.name}</span>
          </div>
        ))}

        {wordCard && <WordCard word={wordCard.word} x={wordCard.x} y={wordCard.y} onClose={() => setWordCard(null)} />}
        {toast && <div className="board-toast">{toast}</div>}
        {studentPrompt && (
          <div className="board-toast student-prompt">
            <span>Add to whose vocabulary?</span>
            {students.map((s) => (
              <button key={s.classroomId} type="button" className="tool" onClick={() => studentPrompt.run(s.classroomId)}>{s.name}</button>
            ))}
            <button type="button" className="chip-close" onClick={() => setStudentPrompt(null)} title="Cancel">×</button>
          </div>
        )}

        {mistakesOpen && onMistake && (
          <div className="mistakes-panel" onPointerDown={(e) => e.stopPropagation()}>
            <div className="mistakes-head">
              <strong>Mistakes this lesson</strong>
              <button type="button" className="word-card-close" onClick={() => setMistakesOpen(false)} title="Close">×</button>
            </div>
            {students?.length > 1 && (
              <label className="mistakes-target">
                <span className="muted">For</span>
                <select className="tool" value={target ?? ''} onChange={(e) => chooseTarget(e.target.value)}>
                  {!target && <option value="">Choose…</option>}
                  {students.map((s) => <option key={s.classroomId} value={s.classroomId}>{s.name}</option>)}
                </select>
              </label>
            )}
            <p className="muted small-hint">Each saved line appears on the board for the student right away and goes into their notebook.</p>
            <form
              className="mistakes-rows"
              onSubmit={async (e) => {
                e.preventDefault()
                // The correct form is welcome but not required — jot down
                // just the error to keep the lesson moving, add the fix
                // later from the notebook (Classroom > Mistake notebook > edit).
                const filled = mistakeRows.map((r) => ({ said: r.said.trim(), correct: r.correct.trim() })).filter((r) => r.said)
                if (!filled.length || mistakeBusy) return
                if (students?.length && !target) { setMistakeError('Choose the student first'); return }
                setMistakeBusy(true)
                setMistakeError('')
                // Anchored to where the teacher is working (last click or
                // resting point, see workSpot) — not the raw last pointer
                // position, which the trip over to this panel had already
                // dragged to the edge of the board. Several rows saved in
                // one go stack downward from there.
                const { point: spot } = workSpot()
                let nextPos = { x: spot.x + 24, y: spot.y + 24 }
                try {
                  for (const { said, correct } of filled) {
                    const elementId = newId()
                    const { mistake } = await onMistake({ said, correct, elementId }, target)
                    const { x, y } = nextPos
                    const note = {
                      id: elementId, type: 'note', color: COLORS[0], width, x, y, w: 320, h: 90,
                      fill: '#fecaca', fontSize: 12, mistakeId: mistake.id,
                      text: mistakeNoteText(said, correct, mistake.labels ?? [])
                    }
                    commit(note)
                    nextPos = { x, y: y + boundsOf(note).h + 16 }
                  }
                  // The panel stays a clean form: what was saved is on the
                  // board (double-click a note there to change it).
                  showToast(`${filled.length === 1 ? 'Mistake' : `${filled.length} mistakes`} saved to the board and the notebook`)
                  setMistakeRows([emptyRow(), emptyRow(), emptyRow()])
                  e.target.querySelector('input')?.focus()
                } catch (err) {
                  setMistakeError(err.message)
                } finally {
                  setMistakeBusy(false)
                }
              }}
            >
              {mistakeRows.map((row, i) => (
                <div key={i} className="mistakes-row">
                  <input
                    autoFocus={i === 0}
                    placeholder={i === 0 ? 'What the student said' : ''}
                    value={row.said}
                    onChange={(e) => setMistakeRows((rows) => rows.map((r, j) => (j === i ? { ...r, said: e.target.value } : r)))}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.parentElement.querySelectorAll('input')[1]?.focus() } }}
                  />
                  <input
                    placeholder={i === 0 ? 'How it should be (optional)' : ''}
                    value={row.correct}
                    onChange={(e) => setMistakeRows((rows) => rows.map((r, j) => (j === i ? { ...r, correct: e.target.value } : r)))}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return
                      e.preventDefault()
                      // Enter on the last row adds one (up to 10); ⌘Enter saves everything.
                      if (e.metaKey || e.ctrlKey) { e.currentTarget.form.requestSubmit(); return }
                      const next = e.currentTarget.closest('.mistakes-row').nextElementSibling
                      if (next) next.querySelector('input')?.focus()
                      else if (mistakeRows.length < 10) setMistakeRows((rows) => [...rows, emptyRow()])
                    }}
                  />
                </div>
              ))}
              {mistakeError && <div className="error">{mistakeError}</div>}
              <div className="row-actions">
                <button type="submit" disabled={mistakeBusy || !mistakeRows.some((r) => r.said.trim())}>
                  {mistakeBusy ? 'Saving…' : 'Save to board and notebook'}
                </button>
                {mistakeRows.length < 10 && (
                  <button type="button" className="ghost" onClick={() => setMistakeRows((rows) => [...rows, emptyRow()])}>+ Row</button>
                )}
                <span className="small-hint muted">{mistakeRows.length} / 10</span>
              </div>
            </form>
            <div className="muted small-hint">Left: as it was said. Right: how it should be (leave blank to add it later). Enter moves along, ⌘Enter saves. To change a saved one, double-click its note on the board.</div>
          </div>
        )}

        {phoneDraft && (
          <div className="phone-draft" onPointerDown={(e) => e.stopPropagation()}>
            <textarea
              ref={phoneDraftRef}
              autoFocus
              rows={3}
              value={phoneDraft.value}
              placeholder={phoneDraft.mode === 'new' ? 'Type here — it goes on the board where you tapped' : ''}
              onChange={(e) => setPhoneDraft({ ...phoneDraft, value: e.target.value })}
            />
            <div className="row-actions">
              <button type="button" className="ghost" onClick={() => { setPhoneDraft(null); selectedRef.current = []; scheduleRender() }}>Cancel</button>
              <button type="button" onClick={finishPhoneDraft}>Done</button>
            </div>
          </div>
        )}

        {mistakeEdit && (
          <form
            className="mistake-edit"
            style={{ left: mistakeEdit.x, top: mistakeEdit.y }}
            onSubmit={saveMistakeEdit}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => { if (e.key === 'Escape') setMistakeEdit(null) }}
          >
            <div className="muted small-hint">Changes the note here and the entry in the student’s notebook</div>
            <input autoFocus value={mistakeEdit.said} placeholder="What the student said" onChange={(e) => setMistakeEdit({ ...mistakeEdit, said: e.target.value })} />
            <input value={mistakeEdit.correct} placeholder="How it should be" onChange={(e) => setMistakeEdit({ ...mistakeEdit, correct: e.target.value })} />
            {mistakeEdit.error && <div className="error">{mistakeEdit.error}</div>}
            <div className="row-actions">
              <button type="submit" disabled={mistakeEdit.busy}>{mistakeEdit.busy ? 'Saving…' : 'Save'}</button>
              <button type="button" className="ghost" onClick={() => setMistakeEdit(null)}>Cancel</button>
            </div>
          </form>
        )}

        {tip && !wordCard && !pins.some((p) => p.word === tip.word) && (
          <div
            className="word-tip"
            style={{ left: tip.x + 12, top: tip.y + 16 }}
            onMouseEnter={() => { tipHoverRef.current = true; clearTimeout(tipHideTimer.current); clearTimeout(tipTimer.current) }}
            onMouseLeave={() => {
              tipHoverRef.current = false
              tipWordRef.current = null
              clearTimeout(tipHideTimer.current)
              tipHideTimer.current = setTimeout(() => { if (!tipHoverRef.current) setTip(null) }, 300)
            }}
          >
            {wordTipBody(tip, (
              <button type="button" className="word-tip-pin" onClick={pinTip} title="Pin this card so it stays open">📌</button>
            ))}
          </div>
        )}
        {dictionaryOpen && (
          <DictionaryPanel
            onClose={() => setDictionaryOpen(false)}
            onAdd={onAddWords ? (term) => new Promise((resolve, reject) => {
              withTarget((classroomId) => addWordsTo([term], classroomId).then(resolve, reject))
            }) : undefined}
          />
        )}
        {pins.map((pin) => (
          <div key={pin.id} className="word-tip pinned" style={{ left: pin.x, top: pin.y }} onPointerDown={(e) => dragPin(e, pin.id)}>
            {wordTipBody(pin, (
              <button type="button" className="word-tip-pin" onClick={() => unpin(pin.id)} title="Close" aria-label="Close">×</button>
            ))}
          </div>
        ))}

        {following && !spotlighting && (
          <div className="board-following">Following {following.name}’s view</div>
        )}

        {!phone && <div className="board-corner-right">
          <div className="dock-group">
            <button className="tool" onClick={undo} disabled={!historyRef.current.undo.length} title="Undo (⌘Z)">↶</button>
            <button className="tool" onClick={redo} disabled={!historyRef.current.redo.length} title="Redo (⌘⇧Z)">↷</button>
          </div>
          <div className="dock-group">
            <button className="tool" onClick={() => zoomTo(view.scale / 1.25)} title="Zoom out">−</button>
            <button className="tool" onClick={resetView} title="100%">{Math.round(view.scale * 100)}%</button>
            <button className="tool" onClick={() => zoomTo(view.scale * 1.25)} title="Zoom in">+</button>
            <button className="tool" onClick={() => fitAll(2)} title="Show everything">Fit</button>
          </div>
        </div>}

        {cropping ? (
          <div className="board-dock">
            <span className="muted">Drag a corner or a side to crop, drag inside to move the frame, then press Enter</span>
            <button className="tool active" onClick={finishCrop}>Done</button>
            <button className="tool" onClick={cancelCrop}>Cancel</button>
          </div>
        ) : !phone && (
          <div className="board-dock" ref={dockRef}>
            <div className="dock-group">
              {TOOLS.map((item) => (
                <button
                  key={item.id}
                  className={`tool ${(item.id === 'area' ? tool === 'select' && boxSelect : item.id === 'select' ? tool === 'select' && !boxSelect : tool === item.id) ? 'active' : ''}`}
                  onClick={() => { pickTool(item.id); scheduleRender(); bump() }}
                  title={item.title ?? `${item.label} (${item.key})`}
                >
                  {item.label}
                </button>
              ))}
              {onMistake && (
                <button
                  className={`tool ${mistakesOpen ? 'active' : ''}`}
                  onClick={() => setMistakesOpen((v) => !v)}
                  title="The lesson's mistakes: what the student said and how it should be. Each goes on the board and into their notebook (X)"
                >
                  Mistakes
                </button>
              )}
              <button className={`tool ${dictionaryOpen ? 'active' : ''}`} onClick={() => setDictionaryOpen((v) => !v)} title="Dictionary: any word or phrase, Russian ⇄ English">Dictionary</button>
              {onUploadImage && (
                <>
                  <button className="tool" onClick={() => fileInputRef.current?.click()} title="Add an image">Image</button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    hidden
                    onChange={(e) => { placeImage(e.target.files?.[0]); e.target.value = '' }}
                  />
                </>
              )}
            </div>

            <div className="dock-group">
              {COLORS.map((value, index) => (
                <button
                  key={value}
                  className={`swatch ${color === value ? 'active' : ''}`}
                  style={{ background: swatchFor(tool, value, index) }}
                  // Keeps an open text editor (a click elsewhere would close it).
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => recolor(value)}
                  title={value}
                />
              ))}
              <input type="range" min="1" max="24" value={width} onChange={(e) => setWidth(Number(e.target.value))} title="Thickness" />
            </div>

            <div className="dock-group">
              {onUploadImage && <button className="tool" onClick={startLesson} title="Add a dated heading where you last clicked on the board">New lesson</button>}
              {onUploadImage && <button className="tool" onClick={startHomework} title="Add a Homework heading where you last clicked on the board">Homework</button>}
              {onUploadImage && <button className="tool" onClick={addPlacementTest} disabled={addingTest} title="Put the trial lesson's placement test where you last clicked on the board">{addingTest ? 'Adding…' : 'Test'}</button>}
              <button
                className="tool"
                disabled={exporting}
                onClick={async () => {
                  setExporting(true)
                  try { await exportBoardPdf(elementsRef.current, title ?? 'Board') } finally { setExporting(false) }
                }}
                title="Save the whole board as a PDF, one section per lesson"
              >
                {exporting ? 'Exporting…' : 'PDF'}
              </button>
              {/* Wiping the board is the teacher's call (canSpotlight = staff); the server refuses students. */}
              {canSpotlight && <button className="tool danger" onClick={handleClear}>Clear</button>}
            </div>
          </div>
        )}

        {/* Floating bar above the selection: text styling, and actions for whatever is selected. */}
        {textBar && !dragging && !phone && (
          <div
            ref={textToolbarRef}
            className="text-toolbar"
            style={{ left: textBar.x, top: textBar.y }}
            onMouseDown={(e) => {
              toolbarInteractingRef.current = true
              setTimeout(() => { toolbarInteractingRef.current = false }, 300)
              if (e.target.tagName === 'SELECT') {
                const area = textAreaRef.current
                sizePickRef.current = area ? editorOffsets(area) : null
              } else e.preventDefault()
            }}
          >
            {showTextControls && (
              <>
                <div className="text-toolbar-group">
                  {COLORS.map((value, index) => (
                    <button
                      key={value}
                      className={`swatch small ${textBar.color === value ? 'active' : ''}`}
                      style={{ background: (textInput?.note || (!textInput && textLike.every((i) => i.type === 'note'))) ? NOTE_FILLS[index] : value }}
                      onClick={() => (textInput ? colorSelection(value) : colorSelectedTexts(value))}
                      title="Colour the selected words, or the whole text"
                    />
                  ))}
                </div>
                <div className="text-toolbar-group">
                  <select
                    className="tool"
                    value={currentFontSize}
                    onChange={(e) => setFontSize(Number(e.target.value))}
                    onBlur={(e) => {
                      // Closed without a pick and the click went off the text: done editing.
                      if (!textInput || !sizePickRef.current) return
                      sizePickRef.current = null
                      if (!e.relatedTarget?.closest?.('.text-toolbar, .board-text-input')) submitText()
                    }}
                    title="Text size"
                  >
                    {fontSizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}
                  </select>
                </div>
                <div className="text-toolbar-group">
                  <button className="tool" onClick={() => (textInput ? toggleBold() : wrapSelectedTexts('**', '**'))} title="Bold (⌘B)"><b>B</b></button>
                  <button className="tool" onClick={() => (textInput ? toggleItalic() : wrapSelectedTexts('__', '__'))} title="Italic (⌘I)"><i>I</i></button>
                  <button className="tool" onClick={() => (textInput ? toggleStrike() : wrapSelectedTexts('~~', '~~'))} title="Strikethrough (⌘⇧X)"><s>S</s></button>
                </div>
              </>
            )}
            {onAssist && (textInput || textLike.length > 0) && (
              <div className="text-toolbar-group">
                <button
                  className="tool assist"
                  onClick={() => {
                    // An open text is finished first; it stays selected, so the questions go under it.
                    if (textInput) submitText()
                    runAssist('questions')
                  }}
                  disabled={Boolean(assisting) || !assistEnabled}
                  title={assistEnabled ? 'Make a practice question for each word' : 'AI assistant is not configured'}
                >
                  {assisting === 'questions' ? 'Writing…' : 'Questions'}
                </button>
              </div>
            )}
            {onAddWords && (textInput || textLike.length > 0) && (
              <div className="text-toolbar-group">
                <button
                  className="tool"
                  onClick={addWordsToVocabulary}
                  disabled={addingWords}
                  title={textInput ? 'Put the highlighted word or phrase into the vocabulary, as one card' : 'Put these into the vocabulary: each line (or comma-separated part) becomes one card'}
                >
                  {addingWords ? 'Adding…' : '+ Vocabulary'}
                </button>
              </div>
            )}
            {!textInput && (
              <div className="text-toolbar-group">
                {selected?.type === 'image' && selected.crop && (
                  <button className="tool" onClick={resetCrop}>Uncrop</button>
                )}
              </div>
            )}
            {textInput && <span className="small-hint">⌘Enter to finish · Esc to finish</span>}
          </div>
        )}

        {textInput && (
          <div
            key={editorKey}
            ref={textAreaRef}
            className="board-text-input notranslate"
            translate="no"
            contentEditable
            suppressContentEditableWarning
            spellCheck={false}
            style={{
              left: editorAt.x * view.scale + view.x - 1,
              // The canvas draws a line's letters from its very top; a browser
              // line box adds half the extra line height above them. Lifted by
              // that much, the words stay exactly where they were.
              top: (editorAt.y - ((LINE_HEIGHT - 1) / 2) * Math.max(textInput.fontSize, splitLineSize(String(textInput.value ?? '').split('\n')[0], textInput.fontSize).size)) * view.scale + view.y - 1,
              fontSize: textInput.fontSize * view.scale,
              lineHeight: LINE_HEIGHT,
              color: inkOf(textInput.color),
              width: textInput.w ? `${textInput.w * view.scale + 2}px` : undefined,
              maxWidth: textInput.w ? undefined : '70vw'
            }}
            onInput={syncEditor}
            onClick={(e) => {
              // A triple-click selects the whole text, not just one line
              // (the browser stops at line breaks).
              if (e.detail >= 3) {
                const range = document.createRange()
                range.selectNodeContents(e.currentTarget)
                const selection = window.getSelection()
                selection.removeAllRanges()
                selection.addRange(range)
              }
            }}
            onBlur={(e) => {
              // Clicking the text toolbar must not close the editor. A
              // native <select> opening its dropdown blurs us with no
              // usable relatedTarget, so toolbarInteractingRef (set
              // synchronously on the toolbar's own mousedown) is checked too.
              if (toolbarInteractingRef.current || e.relatedTarget?.closest?.('.text-toolbar')) {
                if (!sizePickRef.current) requestAnimationFrame(() => e.target.focus({ preventScroll: true }))
                return
              }
              submitText()
            }}
            onKeyDown={(e) => {
              // Esc finishes and keeps what is there. Reverting an existing
              // text undid the other side's words too (both type into one
              // text in a lesson), and the blur afterwards saved it anyway.
              if (e.key === 'Escape') { e.preventDefault(); submitText() }
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submitText() }
              if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
                // A plain line break, never a nested block.
                e.preventDefault()
                document.execCommand('insertLineBreak')
                syncEditor()
              }
            }}
            onPaste={(e) => {
              // Plain text only, so nothing foreign gets into the markup.
              e.preventDefault()
              const raw = e.clipboardData.getData('text/plain')
              // Copying an element elsewhere on a board overwrites the
              // system clipboard with this board's own JSON copy format
              // (see copySelection) — pasting that here used to dump the
              // raw JSON into the text. Recover the words those elements
              // actually held instead, markup stripped, same as any other
              // plain-text paste.
              let text = raw
              if (raw.includes(CLIPBOARD_MARK)) {
                try {
                  const parsed = JSON.parse(raw)
                  if (parsed.mark === CLIPBOARD_MARK && Array.isArray(parsed.elements)) {
                    text = parsed.elements
                      .map((el) => String(el.text ?? '').split('\n').map((line) => textRuns(line).map((r) => r.text).join('')).join('\n'))
                      .filter(Boolean)
                      .join('\n')
                  }
                } catch { /* not ours after all — paste as plain text below */ }
              }
              document.execCommand('insertText', false, text)
              syncEditor()
            }}
          />
        )}

        {cropping && <div className="board-hint">Enter to apply · Esc to cancel</div>}
      </div>
    </div>
  )
})

export default Whiteboard
