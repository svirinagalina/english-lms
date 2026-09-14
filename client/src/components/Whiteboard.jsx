import { useEffect, useRef, useState, useCallback } from 'react'
import '../styles/whiteboard.css'

const COLORS = ['#e8eaed', '#ef4444', '#22c55e', '#3b82f6', '#eab308', '#a855f7']
const TOOLS = [
  { id: 'select', label: 'Move' },
  { id: 'pen', label: 'Pen' },
  { id: 'rect', label: 'Box' },
  { id: 'ellipse', label: 'Circle' },
  { id: 'arrow', label: 'Arrow' },
  { id: 'text', label: 'Text' },
  { id: 'eraser', label: 'Erase' }
]

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
    const size = element.fontSize ?? 20
    const lines = element.text.split('\n')
    const longest = Math.max(...lines.map((line) => line.length))
    return { x: element.x, y: element.y, w: longest * size * 0.6, h: lines.length * size * 1.25 }
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

  if (element.type === 'text') {
    const size = element.fontSize ?? 20
    return { ...element, x: box.x, y: box.y, fontSize: Math.max(8, Math.min(200, size * sy)) }
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
    const ratio = box.w / box.h
    if (w / h > ratio) h = w / ratio
    else w = h * ratio
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
  ctx.strokeStyle = element.color
  ctx.fillStyle = element.color
  ctx.lineWidth = element.width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  if (element.type === 'image') return drawImageElement(ctx, element)

  if (element.type === 'path') {
    const points = element.points ?? []
    if (points.length < 4) return
    ctx.beginPath()
    ctx.moveTo(points[0], points[1])
    for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1])
    ctx.stroke()
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
    ctx.font = `${size}px -apple-system, BlinkMacSystemFont, sans-serif`
    ctx.textBaseline = 'top'
    element.text.split('\n').forEach((line, index) => {
      ctx.fillText(line, element.x, element.y + index * size * 1.25)
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
  ctx.restore()
}

// --- Component ----------------------------------------------------------------

export default function Whiteboard({ socketRef, boardId, onUploadImage, onAssist, assistEnabled }) {
  const [assisting, setAssisting] = useState(null)
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
  const [color, setColor] = useState('#e8eaed')
  const [width, setWidth] = useState(3)
  const [textInput, setTextInput] = useState(null)
  const [, forceRender] = useState(0)
  const bump = () => forceRender((value) => value + 1)

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
    for (const element of elementsRef.current) {
      if (cropping && element.id === cropping.id) continue
      drawElement(ctx, element)
    }
    if (draftRef.current) drawElement(ctx, draftRef.current)

    if (cropping) {
      // Show the whole picture faded, the kept part solid, and handles on it.
      const full = fullImageBox(cropping)
      drawImageElement(ctx, { ...cropping, ...full, crop: FULL_CROP }, 0.35)
      drawImageElement(ctx, cropping)
      drawHandles(ctx, cropping, view.scale, '#eab308')
    } else if (tool === 'select') {
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
  }, [tool])

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
      scheduleRender()
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

  const handleDoubleClick = (event) => {
    if (tool !== 'select' || cropRef.current) return
    const point = toWorld(event)
    const target = [...elementsRef.current].reverse().find((element) => hitTest(element, point.x, point.y))
    if (target?.type !== 'image') return

    cropRef.current = { ...target }
    selectedRef.current = [target.id]
    scheduleRender()
    bump()
  }

  const handlePointerDown = (event) => {
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
        const corner = cornerAt(group, point, scale)
        if (corner) {
          pointerRef.current = { mode: 'resize', ids: items.map((i) => i.id), corner, start: group, originals: items }
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

    selectedRef.current = []

    if (tool === 'text') {
      setTextInput({ x: point.x, y: point.y, value: '' })
      return
    }

    if (tool === 'pen') {
      draftRef.current = { id: newId(), type: 'path', color, width, points: [point.x, point.y] }
      pointerRef.current = { mode: 'draw' }
      return
    }

    draftRef.current = { id: newId(), type: tool, color, width, x: point.x, y: point.y, w: 0, h: 0 }
    pointerRef.current = { mode: 'shape' }
  }

  const handlePointerMove = (event) => {
    const pointer = pointerRef.current
    if (!pointer) return

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
      const box = resizeBox(pointer.start, pointer.corner, point, proportional !== event.shiftKey)
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

  const handlePointerUp = () => {
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

  const handleWheel = (event) => {
    const view = viewRef.current
    if (event.ctrlKey || event.metaKey) {
      const rect = canvasRef.current.getBoundingClientRect()
      const mouseX = event.clientX - rect.left
      const mouseY = event.clientY - rect.top
      const factor = Math.exp(-event.deltaY * 0.002)
      const scale = Math.min(5, Math.max(0.15, view.scale * factor))
      viewRef.current = {
        scale,
        x: mouseX - (mouseX - view.x) * (scale / view.scale),
        y: mouseY - (mouseY - view.y) * (scale / view.scale)
      }
    } else {
      viewRef.current = { ...view, x: view.x - event.deltaX, y: view.y - event.deltaY }
    }
    scheduleRender()
  }

  const submitText = () => {
    const draft = textInput
    setTextInput(null)
    if (!draft || draft.value.trim() === '') return
    commit({ id: newId(), type: 'text', color, width, x: draft.x, y: draft.y, text: draft.value, fontSize: 16 + width * 2 })
  }

  const handleClear = () => {
    if (!window.confirm('Clear the board for everyone?')) return
    const all = elementsRef.current.map((item) => structuredClone(item))
    elementsRef.current = []
    selectedRef.current = []
    emit('board:clear')
    if (all.length) record({ type: 'batch', actions: all.map((element) => ({ type: 'delete', element })) })
    scheduleRender()
  }

  const resetView = () => {
    viewRef.current = { x: 0, y: 0, scale: 1 }
    scheduleRender()
    bump()
  }

  const view = viewRef.current
  const cropping = Boolean(cropRef.current)
  const selected = selectedElement()
  const selectedCount = selectedRef.current.length

  return (
    <div className="whiteboard">
      <div className="board-toolbar">
        {cropping ? (
          <div className="tool-group">
            <span className="muted">Drag the corners to crop, then press Enter</span>
            <button className="tool active" onClick={finishCrop}>Done</button>
            <button className="tool" onClick={cancelCrop}>Cancel</button>
          </div>
        ) : (
          <>
            <div className="tool-group">
              {TOOLS.map((item) => (
                <button
                  key={item.id}
                  className={`tool ${tool === item.id ? 'active' : ''}`}
                  onClick={() => { setTool(item.id); if (item.id !== 'select') selectedRef.current = [] }}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="tool-group">
              {COLORS.map((value) => (
                <button
                  key={value}
                  className={`swatch ${color === value ? 'active' : ''}`}
                  style={{ background: value }}
                  onClick={() => setColor(value)}
                  title={value}
                />
              ))}
            </div>

            <div className="tool-group">
              <button className="tool" onClick={undo} disabled={!historyRef.current.undo.length} title="Undo (⌘Z)">Undo</button>
              <button className="tool" onClick={redo} disabled={!historyRef.current.redo.length} title="Redo (⌘⇧Z)">Redo</button>
            </div>

            <div className="tool-group">
              <input type="range" min="1" max="24" value={width} onChange={(e) => setWidth(Number(e.target.value))} title="Thickness" />
              {onUploadImage && (
                <>
                  <button className="tool" onClick={() => fileInputRef.current?.click()}>Image</button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    hidden
                    onChange={(e) => { placeImage(e.target.files?.[0]); e.target.value = '' }}
                  />
                </>
              )}
              {selected?.type === 'image' && selected.crop && (
                <button className="tool" onClick={resetCrop}>Uncrop</button>
              )}
              {onAssist && tool === 'select' && selectedElements().some((i) => i.type === 'text') && (
                <>
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
                </>
              )}
              {selectedCount > 0 && tool === 'select' && (
                <>
                  <button className="tool" onClick={duplicateSelection} title="Duplicate (⌘D)">Duplicate</button>
                  <button className="tool" onClick={() => remove(selectedRef.current)}>
                    Delete{selectedCount > 1 ? ` (${selectedCount})` : ''}
                  </button>
                </>
              )}
              <button className="tool" onClick={resetView}>Reset view</button>
              <button className="tool danger" onClick={handleClear}>Clear</button>
            </div>
          </>
        )}
      </div>

      <div className="board-canvas-wrap">
        <canvas
          ref={canvasRef}
          className={`board-canvas tool-${cropping ? 'crop' : tool}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
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

        {textInput && (
          <textarea
            className="board-text-input"
            autoFocus
            value={textInput.value}
            style={{
              left: textInput.x * view.scale + view.x,
              top: textInput.y * view.scale + view.y,
              fontSize: (16 + width * 2) * view.scale
            }}
            onChange={(e) => setTextInput({ ...textInput, value: e.target.value })}
            onBlur={submitText}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setTextInput(null)
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitText() }
            }}
          />
        )}

        <div className="board-hint">
          {cropping
            ? 'Enter to apply · Esc to cancel'
            : <>
                Scroll to pan · {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+scroll to zoom · Alt+drag to pan
                {' · Shift+click or drag a box to select several · ⌘C / ⌘V to copy and paste'}
                {onUploadImage && ' · paste or drop an image · double-click an image to crop'}
              </>}
        </div>
      </div>
    </div>
  )
}
