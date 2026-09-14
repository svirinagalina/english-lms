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

const newId = () => crypto.randomUUID().slice(0, 32)

function drawElement(ctx, element) {
  ctx.strokeStyle = element.color
  ctx.fillStyle = element.color
  ctx.lineWidth = element.width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

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
      element.x + element.w / 2,
      element.y + element.h / 2,
      Math.abs(element.w / 2),
      Math.abs(element.h / 2),
      0, 0, Math.PI * 2
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

export default function Whiteboard({ socketRef, boardId }) {
  const canvasRef = useRef(null)
  const elementsRef = useRef([])
  const draftRef = useRef(null)
  const viewRef = useRef({ x: 0, y: 0, scale: 1 })
  const pointerRef = useRef(null)
  const frameRef = useRef(null)

  const [tool, setTool] = useState('pen')
  const [color, setColor] = useState('#e8eaed')
  const [width, setWidth] = useState(3)
  const [textInput, setTextInput] = useState(null)
  const [, forceRender] = useState(0)

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

    for (const element of elementsRef.current) drawElement(ctx, element)
    if (draftRef.current) drawElement(ctx, draftRef.current)
  }, [])

  const scheduleRender = useCallback(() => {
    if (frameRef.current) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      render()
    })
  }, [render])

  useEffect(() => {
    const socket = socketRef.current
    if (!socket || !boardId) return

    elementsRef.current = []
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
      scheduleRender()
    }
    const onClear = () => { elementsRef.current = []; scheduleRender() }

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

  // Browsers suspend requestAnimationFrame in hidden tabs, so anything that
  // arrived while the tab was in the background needs a repaint on return.
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

  const toWorld = (event) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const view = viewRef.current
    return {
      x: (event.clientX - rect.left - view.x) / view.scale,
      y: (event.clientY - rect.top - view.y) / view.scale
    }
  }

  const emit = (event, payload) => socketRef.current?.emit(event, payload)

  const commit = (element) => {
    elementsRef.current.push(element)
    emit('board:add', element)
    scheduleRender()
  }

  const handlePointerDown = (event) => {
    if (textInput) return
    const point = toWorld(event)

    if (event.button === 1 || event.altKey) {
      pointerRef.current = { mode: 'pan', startX: event.clientX, startY: event.clientY, origin: { ...viewRef.current } }
      return
    }

    if (tool === 'eraser') {
      const target = [...elementsRef.current].reverse().find((element) => hitTest(element, point.x, point.y))
      if (target) {
        elementsRef.current = elementsRef.current.filter((item) => item.id !== target.id)
        emit('board:delete', target.id)
        scheduleRender()
      }
      return
    }

    if (tool === 'select') {
      const target = [...elementsRef.current].reverse().find((element) => hitTest(element, point.x, point.y))
      if (target) {
        pointerRef.current = { mode: 'move', id: target.id, last: point }
      } else {
        pointerRef.current = { mode: 'pan', startX: event.clientX, startY: event.clientY, origin: { ...viewRef.current } }
      }
      return
    }

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
      const index = elementsRef.current.findIndex((item) => item.id === pointer.id)
      if (index === -1) return

      const moved = moveElement(elementsRef.current[index], point.x - pointer.last.x, point.y - pointer.last.y)
      elementsRef.current[index] = moved
      pointer.last = point
      scheduleRender()
    }
  }

  const handlePointerUp = () => {
    const pointer = pointerRef.current
    pointerRef.current = null
    if (!pointer) return

    if (pointer.mode === 'move') {
      const element = elementsRef.current.find((item) => item.id === pointer.id)
      if (element) emit('board:update', element)
      return
    }

    const draft = draftRef.current
    draftRef.current = null
    if (!draft) return

    const isEmptyShape = draft.type !== 'path' && Math.abs(draft.w) < 3 && Math.abs(draft.h) < 3
    const isEmptyStroke = draft.type === 'path' && draft.points.length < 4

    if (isEmptyShape || isEmptyStroke) {
      scheduleRender()
      return
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

    commit({
      id: newId(),
      type: 'text',
      color,
      width,
      x: draft.x,
      y: draft.y,
      text: draft.value,
      fontSize: 16 + width * 2
    })
  }

  const handleClear = () => {
    if (!window.confirm('Clear the board for everyone?')) return
    elementsRef.current = []
    emit('board:clear')
    scheduleRender()
  }

  const resetView = () => {
    viewRef.current = { x: 0, y: 0, scale: 1 }
    scheduleRender()
    forceRender((value) => value + 1)
  }

  const view = viewRef.current

  return (
    <div className="whiteboard">
      <div className="board-toolbar">
        <div className="tool-group">
          {TOOLS.map((item) => (
            <button
              key={item.id}
              className={`tool ${tool === item.id ? 'active' : ''}`}
              onClick={() => setTool(item.id)}
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
          <input
            type="range"
            min="1"
            max="24"
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
            title="Thickness"
          />
          <button className="tool" onClick={resetView}>Reset view</button>
          <button className="tool danger" onClick={handleClear}>Clear</button>
        </div>
      </div>

      <div className="board-canvas-wrap">
        <canvas
          ref={canvasRef}
          className={`board-canvas tool-${tool}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onWheel={handleWheel}
          onContextMenu={(e) => e.preventDefault()}
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
          Scroll to pan · {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+scroll to zoom · Alt+drag to pan
        </div>
      </div>
    </div>
  )
}
