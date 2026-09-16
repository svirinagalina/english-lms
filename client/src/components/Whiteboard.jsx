import { useEffect, useRef, useState, useCallback } from 'react'
import '../styles/whiteboard.css'

const COLORS = ['#111827', '#ef4444', '#16a34a', '#2563eb', '#f59e0b', '#9333ea']
// Ink drawn while the board was dark, shown dark on the white board.
const LEGACY_INK = { '#e8eaed': '#111827', '#22c55e': '#16a34a', '#3b82f6': '#2563eb', '#eab308': '#f59e0b', '#a855f7': '#9333ea' }
const inkOf = (color) => LEGACY_INK[color] ?? color

const MIN_SCALE = 0.05
const MAX_SCALE = 8
const TOOLS = [
  { id: 'select', label: 'Move', key: 'V' },
  { id: 'pen', label: 'Pen', key: 'P' },
  { id: 'marker', label: 'Marker', key: 'M' },
  { id: 'rect', label: 'Box', key: 'R' },
  { id: 'ellipse', label: 'Circle', key: 'O' },
  { id: 'arrow', label: 'Arrow', key: 'A' },
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

const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
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

// "a **b** c" → [{text:'a ', bold:false}, {text:'b', bold:true}, {text:' c', bold:false}]
// Markup: **bold**, __italic__ and {{#rrggbb:coloured}} spans, nestable.
const COLOR_OPEN = /^\{\{(#[0-9a-fA-F]{6}):/
function textRuns(line) {
  const runs = []
  let bold = false
  let italic = false
  const colors = []
  let buffer = ''
  const flush = () => {
    if (buffer) runs.push({ text: buffer, bold, italic, color: colors[colors.length - 1] })
    buffer = ''
  }
  let i = 0
  while (i < line.length) {
    if (line.startsWith('**', i)) { flush(); bold = !bold; i += 2; continue }
    if (line.startsWith('__', i)) { flush(); italic = !italic; i += 2; continue }
    const open = line.slice(i).match(COLOR_OPEN)
    if (open) { flush(); colors.push(open[1]); i += open[0].length; continue }
    if (colors.length && line.startsWith('}}', i)) { flush(); colors.pop(); i += 2; continue }
    buffer += line[i]
    i += 1
  }
  flush()
  return runs
}

const sameStyle = (a, b) => a.bold === b.bold && a.italic === b.italic && a.color === b.color
const styleOf = (run) => ({ bold: run.bold, italic: run.italic, color: run.color })


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
  const lines = element.w
    ? paragraphs.flatMap((line) => wrapLine(line, size, element.w))
    : paragraphs.map((line) => textRuns(line))
  if (layoutCache.size > 2000) layoutCache.clear()
  layoutCache.set(key, lines)
  return lines
}

function textSize(text, size, maxWidth) {
  const lines = textLines({ text, fontSize: size, w: maxWidth })
  const widths = lines.map((runs) => runs.reduce((sum, run) => sum + measureWidth(run.text, size, run.bold, run.italic), 0))
  return {
    w: maxWidth ?? Math.max(8, ...widths),
    h: Math.max(1, lines.length) * size * LINE_HEIGHT
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
    crop: {
      x: (clampedX - full.x) / full.w,
      y: (clampedY - full.y) / full.h,
      w: clampedW / full.w,
      h: clampedH / full.h
    }
  }
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

function drawElement(ctx, element) {
  ctx.strokeStyle = inkOf(element.color)
  ctx.fillStyle = inkOf(element.color)
  ctx.lineWidth = element.width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  if (element.type === 'image') return drawImageElement(ctx, element)

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
    textLines({ text: element.text, fontSize: size, w: Math.max(20, box.w - 2 * NOTE_PAD) }).forEach((runs, index) => {
      let x = box.x + NOTE_PAD
      const y = box.y + NOTE_PAD + index * size * LINE_HEIGHT
      for (const run of runs) {
        ctx.font = fontFor(size, run.bold, run.italic)
        ctx.fillStyle = inkOf(run.color ?? element.color)
        ctx.fillText(run.text, x, y)
        x += measureWidth(run.text, size, run.bold, run.italic)
      }
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
    const size = element.fontSize ?? 20
    ctx.textBaseline = 'top'
    textLines(element).forEach((runs, index) => {
      let x = element.x
      const y = element.y + index * size * LINE_HEIGHT
      for (const run of runs) {
        ctx.font = fontFor(size, run.bold, run.italic)
        ctx.fillStyle = inkOf(run.color ?? element.color)
        ctx.fillText(run.text, x, y)
        x += measureWidth(run.text, size, run.bold, run.italic)
      }
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

export default function Whiteboard({ socketRef, boardId, title, subtitle, onClose, onUploadImage, onAssist, assistEnabled }) {
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

  const [tool, setTool] = useState('pen')
  // render() reads the tool through a ref so its identity never changes:
  // the sync effect below must not re-open the board on every tool switch.
  const toolRef = useRef(tool)
  toolRef.current = tool
  const [color, setColor] = useState(COLORS[0])
  const lastFontSizeRef = useRef(24)
  const [width, setWidth] = useState(3)
  const [textInput, setTextInput] = useState(null)
  // Fingers currently on the canvas (touch screens): two of them pinch-zoom.
  const touchesRef = useRef(new Map())
  const pinchRef = useRef(null)
  const editingTextRef = useRef(null)
  editingTextRef.current = textInput?.id ?? null
  const textAreaRef = useRef(null)
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
      if (editingId && element.id === editingId) {
        if (element.type === 'note') drawElement(ctx, { ...element, text: '' })
        continue
      }
      drawElement(ctx, element)
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
      if (items.length) {
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

  const scheduleRender = useCallback(() => {
    if (frameRef.current) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      render()
    })
  }, [render])

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

    socket.emit('board:open', boardId, (response) => {
      elementsRef.current = response?.elements ?? []
      // A board with content opens showing all of it; an empty one at 100%.
      if (elementsRef.current.length) fitAll(1)
      else viewRef.current = { x: 0, y: 0, scale: 1 }
      scheduleRender()
      bump()
    })

    const onAdd = (element) => { elementsRef.current.push(element); scheduleRender() }
    const onUpdate = (element) => {
      const index = elementsRef.current.findIndex((item) => item.id === element.id)
      if (index !== -1) elementsRef.current[index] = element
      scheduleRender()
    }
    const onDelete = (id) => {
      elementsRef.current = elementsRef.current.filter((item) => item.id !== id)
      selectedRef.current = selectedRef.current.filter((s) => s !== id)
      scheduleRender()
    }
    const onClear = () => { elementsRef.current = []; selectedRef.current = []; scheduleRender() }

    socket.on('board:add', onAdd)
    socket.on('board:update', onUpdate)
    socket.on('board:delete', onDelete)
    socket.on('board:clear', onClear)

    return () => {
      socket.off('board:add', onAdd)
      socket.off('board:update', onUpdate)
      socket.off('board:delete', onDelete)
      socket.off('board:clear', onClear)
    }
  }, [socketRef, boardId, scheduleRender])

  useEffect(() => {
    const repaint = () => scheduleRender()
    window.addEventListener('resize', repaint)
    document.addEventListener('visibilitychange', repaint)
    scheduleRender()
    return () => {
      window.removeEventListener('resize', repaint)
      document.removeEventListener('visibilitychange', repaint)
    }
  }, [scheduleRender])

  const emit = (event, payload) => socketRef.current?.emit(event, payload)

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
    const removed = elementsRef.current.filter((item) => gone.has(item.id))
    if (!removed.length) return
    for (const item of removed) removeRaw(item.id)
    const actions = removed.map((item) => ({ type: 'delete', element: structuredClone(item) }))
    record(actions.length === 1 ? actions[0] : { type: 'batch', actions })
    scheduleRender()
  }

  // --- Images -----------------------------------------------------------------

  const placeImage = useCallback(async (file) => {
    if (!onUploadImage || !file || !file.type.startsWith('image/')) return

    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })

    const size = await new Promise((resolve) => {
      const probe = new Image()
      probe.onload = () => resolve({ w: probe.naturalWidth, h: probe.naturalHeight })
      probe.onerror = () => resolve({ w: 400, h: 300 })
      probe.src = dataUrl
    })

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

  useEffect(() => {
    const onPaste = (event) => {
      if (textInput || event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return

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

  // --- AI assist ----------------------------------------------------------------

  // Splits the selected text objects into words/phrases: one per line, or comma-separated.
  const selectedWords = () =>
    selectedElements()
      .filter((item) => item.type === 'text')
      .flatMap((item) => item.text.split(/[\n,;]+/))
      .map((w) => w.trim())
      .filter(Boolean)

  const runAssist = async (mode) => {
    if (!onAssist || assisting) return
    const words = selectedWords()
    if (!words.length) return

    setAssisting(mode)
    try {
      const items = await onAssist(mode, words)
      if (!items?.length) return

      const lines = mode === 'translate'
        ? items.map((i) => `${i.word}  ${i.transcription}  —  ${i.translation}`)
        : items.map((i) => i.question)

      // Place the result just below the selection, matching its text size.
      const group = unionBounds(selectedElements())
      const sample = selectedElements().find((item) => item.type === 'text')
      const element = {
        id: newId(),
        type: 'text',
        color: mode === 'translate' ? '#a5b4fc' : '#86efac',
        width: sample?.width ?? width,
        x: group.x,
        y: group.y + group.h + 24,
        text: lines.join('\n'),
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
      if (textInput || event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return

      if (cropRef.current) {
        if (event.key === 'Escape') cancelCrop()
        if (event.key === 'Enter') finishCrop()
        return
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedRef.current.length) {
        event.preventDefault()
        remove(selectedRef.current)
      }
      if (event.key === 'Escape') { selectedRef.current = []; scheduleRender(); bump() }
      const mod = event.metaKey || event.ctrlKey
      if (!mod && !event.altKey) {
        const shortcut = TOOLS.find((item) => item.key.toLowerCase() === event.key.toLowerCase())
        if (shortcut) { setTool(shortcut.id); if (shortcut.id !== 'select') selectedRef.current = []; scheduleRender(); bump(); return }
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
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
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
  const openEditor = (target) => {
    const note = target.type === 'note'
    selectedRef.current = [target.id]
    setTextInput({
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

  const handleDoubleClick = (event) => {
    if (tool !== 'select' || cropRef.current) return
    const point = toWorld(event)
    const target = [...elementsRef.current].reverse().find((element) => hitTest(element, point.x, point.y))
    if (target?.type === 'text' || target?.type === 'note') {
      openEditor(target)
      return
    }
    if (target?.type !== 'image') return

    cropRef.current = { ...target }
    selectedRef.current = [target.id]
    scheduleRender()
    bump()
  }

  const handlePointerDown = (event) => {
    if (trackTouch(event)) return
    if (textInput) return
    const point = toWorld(event)
    const scale = viewRef.current.scale

    if (event.button === 1 || event.altKey) {
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
      if (!hitTest(cropRef.current, point.x, point.y)) finishCrop()
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
      if (items.length) {
        const group = unionBounds(items)
        const handle = handleAt(group, point, scale)
        if (handle) {
          pointerRef.current = isCorner(handle)
            ? { mode: 'resize', ids: items.map((i) => i.id), corner: handle, start: group, originals: items }
            : { mode: 'resize', ids: items.map((i) => i.id), edge: handle, start: group, originals: items }
          return
        }
      }

      const target = [...elementsRef.current].reverse().find((element) => hitTest(element, point.x, point.y))
      if (target) {
        const already = selectedRef.current.includes(target.id)
        if (event.shiftKey) {
          // Shift toggles membership without moving anything.
          selectedRef.current = already
            ? selectedRef.current.filter((s) => s !== target.id)
            : [...selectedRef.current, target.id]
          scheduleRender()
          bump()
          return
        }
        // Clicking a member keeps the group so it can be dragged together.
        if (!already) selectedRef.current = [target.id]
        pointerRef.current = { mode: 'move', ids: [...selectedRef.current], last: point, originals: selectedElements().map((i) => structuredClone(i)) }
      } else {
        if (!event.shiftKey) selectedRef.current = []
        marqueeRef.current = { x: point.x, y: point.y, w: 0, h: 0 }
        pointerRef.current = { mode: 'marquee', origin: point, additive: event.shiftKey, base: [...selectedRef.current] }
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
    if (tool !== 'select' || cropRef.current) { canvas.style.cursor = ''; return }
    const point = toWorld(event)
    const scale = viewRef.current.scale
    const items = selectedElements()
    if (items.length) {
      const group = unionBounds(items)
      const handle = handleAt(group, point, scale)
      if (handle) { canvas.style.cursor = CURSOR_FOR[handle.id]; return }
    }
    const over = elementsRef.current.some((element) => hitTest(element, point.x, point.y))
    canvas.style.cursor = over ? 'move' : ''
  }

  const handlePointerMove = (event) => {
    if (event.pointerType === 'touch' && touchesRef.current.has(event.pointerId)) {
      const rect = canvasRef.current.getBoundingClientRect()
      touchesRef.current.set(event.pointerId, { x: event.clientX - rect.left, y: event.clientY - rect.top })
      if (pinchRef.current) { movePinch(); return }
    }
    const pointer = pointerRef.current
    if (!pointer) { updateHoverCursor(event); return }

    if (pointer.mode === 'pan') {
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
      const dx = point.x - pointer.last.x
      const dy = point.y - pointer.last.y
      const ids = new Set(pointer.ids)
      elementsRef.current = elementsRef.current.map((item) => (ids.has(item.id) ? moveElement(item, dx, dy) : item))
      pointer.last = point
      scheduleRender()
      return
    }

    if (pointer.mode === 'resize') {
      // Images, text and any group keep proportions; hold Shift to stretch. A lone shape is free.
      const lone = pointer.originals.length === 1 ? pointer.originals[0] : null
      const proportional = !lone || lone.type === 'image' || lone.type === 'text'
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
      const box = resizeBox(pointer.start, pointer.corner, point, false)
      cropRef.current = cropFromBox(pointer.start, box)
      scheduleRender()
    }
  }

  const handlePointerUp = (event) => {
    if (event) releaseTouch(event)
    const pointer = pointerRef.current
    pointerRef.current = null
    if (!pointer) return

    if (pointer.mode === 'move' || pointer.mode === 'resize') {
      const ids = new Set(pointer.ids)
      for (const element of elementsRef.current) if (ids.has(element.id)) emit('board:update', element)
      recordUpdates(pointer.originals)
      bump()
      return
    }

    if (pointer.mode === 'marquee') {
      marqueeRef.current = null
      scheduleRender()
      bump()
      return
    }

    if (pointer.mode === 'crop' || pointer.mode === 'pan') return

    if (pointer.mode === 'text') {
      setTextInput({ x: pointer.point.x, y: pointer.point.y, value: '', fontSize: textInput?.fontSize ?? lastFontSizeRef.current, color })
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
    canvas.addEventListener('wheel', blockPageZoom, { passive: false })
    canvas.addEventListener('gesturestart', onStart)
    canvas.addEventListener('gesturechange', onChange)
    canvas.addEventListener('gestureend', onEnd)
    return () => {
      canvas.removeEventListener('wheel', blockPageZoom)
      canvas.removeEventListener('gesturestart', onStart)
      canvas.removeEventListener('gesturechange', onChange)
      canvas.removeEventListener('gestureend', onEnd)
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
      viewRef.current = { ...view, x: view.x - event.deltaX, y: view.y - event.deltaY }
    }
    scheduleRender()
  }

  const submitText = () => {
    const draft = textInput
    if (!draft) return
    setTextInput(null)
    lastFontSizeRef.current = draft.fontSize
    const text = draft.value.replace(/\s+$/, '')

    if (draft.id) {
      if (!text.trim() && !draft.note) { remove(draft.id); return }
      const after = { ...draft.before, text, fontSize: draft.fontSize, color: draft.color }
      if (JSON.stringify(after) === JSON.stringify(draft.before)) { scheduleRender(); return }
      replaceRaw(after)
      record({ type: 'update', before: draft.before, after: structuredClone(after) })
      scheduleRender()
      bump()
      return
    }

    if (!text.trim()) { scheduleRender(); return }
    commit({ id: newId(), type: 'text', color: draft.color, width, x: draft.x, y: draft.y, text, fontSize: draft.fontSize })
  }

  const cancelText = () => {
    setTextInput(null)
    scheduleRender()
  }

  // Current selection in the editor; with nothing selected, the whole text.
  const editorSelection = () => {
    const area = textAreaRef.current
    if (!area) return null
    const { selectionStart: start, selectionEnd: end, value } = area
    return start === end ? { start: 0, end: value.length, value } : { start, end, value }
  }

  // Wraps the selection in open…close, or unwraps it when it already is.
  const toggleSpan = (open, close) => {
    const area = textAreaRef.current
    const sel = editorSelection()
    if (!area || !textInput || !sel) return
    const { start, end, value } = sel
    const inner = value.slice(start, end)
    let next, cursorEnd
    if (inner.startsWith(open) && inner.endsWith(close) && inner.length >= open.length + close.length) {
      next = value.slice(0, start) + inner.slice(open.length, inner.length - close.length) + value.slice(end)
      cursorEnd = end - open.length - close.length
    } else if (value.slice(start - open.length, start) === open && value.slice(end, end + close.length) === close) {
      next = value.slice(0, start - open.length) + inner + value.slice(end + close.length)
      cursorEnd = end - open.length
    } else {
      next = value.slice(0, start) + open + inner + close + value.slice(end)
      cursorEnd = end + open.length + close.length
    }
    setTextInput({ ...textInput, value: next })
    requestAnimationFrame(() => { area.focus(); area.setSelectionRange(start, cursorEnd) })
  }
  const toggleBold = () => toggleSpan('**', '**')
  const toggleItalic = () => toggleSpan('__', '__')

  // Colours the selection; with nothing selected, recolours the whole text.
  const colorSelection = (value) => {
    const area = textAreaRef.current
    if (!area || !textInput) return
    const { selectionStart: start, selectionEnd: end, value: text } = area
    if (start === end) {
      if (textInput.note) {
        // Nothing selected in a note: recolour the note itself.
        const fill = NOTE_FILLS[Math.max(0, COLORS.indexOf(value))]
        setTextInput({ ...textInput, before: { ...textInput.before, fill } })
        replace({ ...textInput.before, fill })
      } else {
        setTextInput({ ...textInput, color: value })
      }
      requestAnimationFrame(() => area.focus())
      return
    }
    // Strip colour marks inside the selection so colours do not pile up.
    const inner = text.slice(start, end).replace(/\{\{#[0-9a-fA-F]{6}:/g, '').replace(/\}\}/g, '')
    const wrapped = `{{${value}:${inner}}}`
    const next = text.slice(0, start) + wrapped + text.slice(end)
    setTextInput({ ...textInput, value: next })
    requestAnimationFrame(() => { area.focus(); area.setSelectionRange(start, start + wrapped.length) })
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
    for (const item of items) replaceRaw(item.type === 'note' ? { ...item, fill } : { ...item, color: value })
    recordUpdates(befores)
    scheduleRender()
    bump()
  }

  // Changes the size of the text being edited, or of the selected text elements.
  const setFontSize = (size) => {
    if (textInput) {
      setTextInput({ ...textInput, fontSize: size })
      requestAnimationFrame(() => textAreaRef.current?.focus())
      return
    }
    const items = selectedElements().filter((item) => item.type === 'text' || item.type === 'note')
    if (!items.length) return
    const befores = items.map((item) => structuredClone(item))
    for (const item of items) replaceRaw({ ...item, fontSize: size })
    recordUpdates(befores)
    lastFontSizeRef.current = size
    scheduleRender()
    bump()
  }

  // The editor grows with its text so every line stays visible.
  const fitTextArea = () => {
    const area = textAreaRef.current
    if (!area || !textInput) return
    const scale = viewRef.current.scale
    const { w, h } = textSize(textInput.value || ' ', textInput.fontSize, textInput.w)
    area.style.whiteSpace = textInput.w ? 'pre-wrap' : 'pre'
    area.style.width = textInput.w
      ? `${textInput.w * scale + 2}px`
      : `${Math.max(120, w * scale + 2 * textInput.fontSize * scale)}px`
    area.style.height = `${h * scale + 4}px`
  }
  useEffect(fitTextArea)

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
    const pad = 60
    const scale = Math.min(maxScale, Math.max(MIN_SCALE,
      Math.min((rect.width - pad * 2) / Math.max(box.w, 1), (rect.height - pad * 2) / Math.max(box.h, 1))))
    viewRef.current = {
      scale,
      x: (rect.width - box.w * scale) / 2 - box.x * scale,
      y: (rect.height - box.h * scale) / 2 - box.y * scale
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
  // with a dated heading below all existing content, and the view goes there.
  const startLesson = () => {
    const items = elementsRef.current
    const box = items.length ? unionBounds(items) : { x: 0, y: 0, w: 0, h: 0 }
    const x = items.length ? box.x : 40
    const y = items.length ? box.y + box.h + 120 : 40
    const date = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
    commit({ id: newId(), type: 'text', color: COLORS[0], width: 6, x, y, text: `— Lesson · ${date} —`, fontSize: 28 })
    viewRef.current = { scale: 1, x: 60 - x, y: 60 - y }
    setTool('pen')
    scheduleRender()
    bump()
  }

  const view = viewRef.current
  const cropping = Boolean(cropRef.current)
  // Floating text bar: above the text being edited, or the selected text.
  const textBar = (() => {
    if (cropping) return null
    let box = null
    let barColor = null
    if (textInput) {
      box = { x: textInput.x, y: textInput.y }
      barColor = textInput.color
    } else if (tool === 'select') {
      const items = selectedElements()
      if (!items.length) return null
      box = unionBounds(items)
      const first = items.find((i) => i.type === 'text' || i.type === 'note')
      barColor = first?.color ?? null
    } else return null
    return { x: Math.max(8, box.x * view.scale + view.x), y: Math.max(8, box.y * view.scale + view.y - 52), color: barColor }
  })()
  const textLike = textInput ? [] : selectedElements().filter((i) => i.type === 'text' || i.type === 'note')
  const showTextControls = Boolean(textInput) || textLike.length > 0

  // A corner-dragged text can have any size; the list shows it alongside the presets.
  const currentFontSize = Math.round(textInput ? textInput.fontSize : (textLike[0]?.fontSize ?? 20))
  const fontSizeOptions = FONT_SIZES.includes(currentFontSize) ? FONT_SIZES : [...FONT_SIZES, currentFontSize].sort((a, b) => a - b)
  const selected = selectedElement()
  const selectedCount = selectedRef.current.length

  return (
    <div className="whiteboard">
      <div className="board-canvas-wrap">
        <canvas
          ref={canvasRef}
          className={`board-canvas tool-${cropping ? 'crop' : tool}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onDoubleClick={handleDoubleClick}
          onWheel={handleWheel}
          onContextMenu={(e) => e.preventDefault()}
          onDragOver={(e) => { if (onUploadImage) e.preventDefault() }}
          onDrop={(e) => {
            if (!onUploadImage) return
            e.preventDefault()
            placeImage(e.dataTransfer.files?.[0])
          }}
        />

        {/* Corner chip with the board's name, like a Figma file tab. */}
        <div className="board-chip">
          <strong>{title ?? 'Board'}</strong>
          {subtitle && <span className="muted"> · {subtitle}</span>}
          {onClose && <button className="chip-close" onClick={onClose} title="Close board">×</button>}
        </div>

        <div className="board-corner-right">
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
        </div>

        {cropping ? (
          <div className="board-dock">
            <span className="muted">Drag the corners to crop, then press Enter</span>
            <button className="tool active" onClick={finishCrop}>Done</button>
            <button className="tool" onClick={cancelCrop}>Cancel</button>
          </div>
        ) : (
          <div className="board-dock">
            <div className="dock-group">
              {TOOLS.map((item) => (
                <button
                  key={item.id}
                  className={`tool ${tool === item.id ? 'active' : ''}`}
                  onClick={() => { setTool(item.id); if (item.id !== 'select') selectedRef.current = [] }}
                  title={`${item.label} (${item.key})`}
                >
                  {item.label}
                </button>
              ))}
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
                  onClick={() => setColor(value)}
                  title={value}
                />
              ))}
              <input type="range" min="1" max="24" value={width} onChange={(e) => setWidth(Number(e.target.value))} title="Thickness" />
            </div>

            <div className="dock-group">
              {onUploadImage && <button className="tool" onClick={startLesson} title="Add a dated heading below everything and start there">New lesson</button>}
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
              <button className="tool danger" onClick={handleClear}>Clear</button>
            </div>
          </div>
        )}

        {/* Floating bar above the selection: text styling, and actions for whatever is selected. */}
        {textBar && (
          <div
            className="text-toolbar"
            style={{ left: textBar.x, top: textBar.y }}
            onMouseDown={(e) => { if (e.target.tagName !== 'SELECT') e.preventDefault() }}
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
                    title="Text size"
                  >
                    {fontSizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}
                  </select>
                </div>
                <div className="text-toolbar-group">
                  <button className="tool" onClick={() => (textInput ? toggleBold() : wrapSelectedTexts('**', '**'))} title="Bold (⌘B)"><b>B</b></button>
                  <button className="tool" onClick={() => (textInput ? toggleItalic() : wrapSelectedTexts('__', '__'))} title="Italic (⌘I)"><i>I</i></button>
                </div>
              </>
            )}
            {!textInput && onAssist && textLike.length > 0 && (
              <div className="text-toolbar-group">
                <button
                  className="tool assist"
                  onClick={() => runAssist('translate')}
                  disabled={Boolean(assisting) || !assistEnabled}
                  title={assistEnabled ? 'Translate the selected words with transcription' : 'AI assistant is not configured'}
                >
                  {assisting === 'translate' ? 'Translating…' : 'Translate'}
                </button>
                <button
                  className="tool assist"
                  onClick={() => runAssist('questions')}
                  disabled={Boolean(assisting) || !assistEnabled}
                  title={assistEnabled ? 'Make a practice question for each word' : 'AI assistant is not configured'}
                >
                  {assisting === 'questions' ? 'Writing…' : 'Questions'}
                </button>
              </div>
            )}
            {!textInput && (
              <div className="text-toolbar-group">
                {selected?.type === 'image' && selected.crop && (
                  <button className="tool" onClick={resetCrop}>Uncrop</button>
                )}
                <button className="tool" onClick={duplicateSelection} title="Duplicate (⌘D)">Duplicate</button>
                <button className="tool" onClick={() => remove(selectedRef.current)} title="Delete">
                  Delete{selectedCount > 1 ? ` (${selectedCount})` : ''}
                </button>
              </div>
            )}
            {textInput && <span className="small-hint">⌘Enter to finish · Esc {textInput.id ? 'to cancel' : 'to finish'}</span>}
          </div>
        )}

        {textInput && (
          <textarea
            ref={textAreaRef}
            className="board-text-input"
            autoFocus
            value={textInput.value}
            style={{
              left: textInput.x * view.scale + view.x - 1,
              top: textInput.y * view.scale + view.y - 1,
              fontSize: textInput.fontSize * view.scale,
              lineHeight: LINE_HEIGHT,
              color: inkOf(textInput.color)
            }}
            onChange={(e) => setTextInput({ ...textInput, value: e.target.value })}
            onClick={(e) => {
              // One click takes the line under the cursor, a double click the whole text.
              if (e.detail >= 2) { e.target.select(); return }
              const { value, selectionStart } = e.target
              const start = value.lastIndexOf('\n', selectionStart - 1) + 1
              const end = value.indexOf('\n', selectionStart)
              e.target.setSelectionRange(start, end === -1 ? value.length : end)
            }}
            onBlur={(e) => {
              // Clicking the text toolbar must not close the editor.
              if (e.relatedTarget?.closest?.('.text-toolbar')) { requestAnimationFrame(() => e.target.focus()); return }
              submitText()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { e.preventDefault(); textInput.id ? cancelText() : submitText() }
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submitText() }
            }}
          />
        )}

        {textBar && (
          <div
            className="text-toolbar"
            style={{ left: textBar.x, top: textBar.y }}
            onMouseDown={(e) => { if (e.target.tagName !== 'SELECT') e.preventDefault() }}
          >
            <div className="text-toolbar-group">
              {COLORS.map((value) => (
                <button
                  key={value}
                  className={`swatch small ${textBar.color === value ? 'active' : ''}`}
                  style={{ background: value }}
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
                title="Text size"
              >
                {fontSizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </div>
            <div className="text-toolbar-group">
              <button className="tool" onClick={() => (textInput ? toggleBold() : wrapSelectedTexts('**', '**'))} title="Bold (⌘B)"><b>B</b></button>
              <button className="tool" onClick={() => (textInput ? toggleItalic() : wrapSelectedTexts('__', '__'))} title="Italic (⌘I)"><i>I</i></button>
            </div>
            {textInput && <span className="small-hint">⌘Enter to finish · Esc {textInput.id ? 'to cancel' : 'to finish'}</span>}
          </div>
        )}

        <div className="board-hint">
          {cropping
            ? 'Enter to apply · Esc to cancel'
            : <>
                Scroll to pan · pinch or {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+scroll to zoom · Alt+drag to pan
                {' · Shift+click or drag a box to select several · ⌘C / ⌘V to copy and paste · double-click text to edit it'}
                {onUploadImage && ' · paste or drop an image · double-click an image to crop'}
              </>}
        </div>
      </div>
    </div>
  )
}
