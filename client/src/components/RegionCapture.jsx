import { useEffect, useRef, useState } from 'react'

export const canCaptureScreen = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getDisplayMedia)

// Grabs one frame of a screen, window or tab and lets you drag out the part
// you want — a chart for a Task 1 essay, say — before it goes into the text.
export default function RegionCapture({ onDone, onCancel }) {
  const [shot, setShot] = useState(null) // { url, width, height }
  const [rect, setRect] = useState(null) // in displayed-image pixels
  const [error, setError] = useState('')
  const imgRef = useRef(null)
  const dragRef = useRef(null)

  const capture = async () => {
    setError('')
    setRect(null)
    let stream
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
    } catch {
      if (!shot) onCancel() // the picker was dismissed
      return
    }
    try {
      const video = document.createElement('video')
      video.muted = true
      video.playsInline = true
      video.srcObject = stream
      await video.play()
      // The first frame can still be black; give the stream a moment.
      await new Promise((resolve) => setTimeout(resolve, 250))
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      canvas.getContext('2d').drawImage(video, 0, 0)
      setShot({ url: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height })
    } catch (err) {
      setError(err.message || 'Could not capture the screen')
    } finally {
      stream.getTracks().forEach((track) => track.stop())
    }
  }

  useEffect(() => { capture() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const pointAt = (event) => {
    const box = imgRef.current.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(event.clientX - box.left, box.width)),
      y: Math.max(0, Math.min(event.clientY - box.top, box.height))
    }
  }

  const onPointerDown = (event) => {
    if (!imgRef.current) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const p = pointAt(event)
    dragRef.current = p
    setRect({ x: p.x, y: p.y, w: 0, h: 0 })
  }
  const onPointerMove = (event) => {
    const start = dragRef.current
    if (!start) return
    const p = pointAt(event)
    setRect({ x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) })
  }
  const onPointerUp = () => { dragRef.current = null }

  const insert = () => {
    if (!shot) return
    const box = imgRef.current.getBoundingClientRect()
    const scale = shot.width / box.width
    const area = rect && rect.w > 4 && rect.h > 4
      ? { x: rect.x * scale, y: rect.y * scale, w: rect.w * scale, h: rect.h * scale }
      : { x: 0, y: 0, w: shot.width, h: shot.height }
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(area.w)
      canvas.height = Math.round(area.h)
      canvas.getContext('2d').drawImage(image, area.x, area.y, area.w, area.h, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => {
        if (blob) onDone(new File([blob], 'screenshot.png', { type: 'image/png' }))
      }, 'image/png')
    }
    image.src = shot.url
  }

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onCancel()
      else if (event.key === 'Enter') insert()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const selected = rect && rect.w > 4 && rect.h > 4

  return (
    <div className="region-capture">
      <div className="region-bar">
        <span>{shot ? 'Drag over the part you need' : 'Choose a window, tab or screen…'}</span>
        <div className="row-actions">
          {shot && <button className="tool" onClick={capture}>Retake</button>}
          <button className="tool" onClick={onCancel}>Cancel</button>
          {shot && <button className="tool accept" onClick={insert}>{selected ? 'Insert selection' : 'Insert whole picture'}</button>}
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      {shot && (
        <div className="region-stage">
          <div className="region-frame" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
            <img ref={imgRef} src={shot.url} alt="" draggable={false} />
            {selected && <div className="region-rect" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} />}
          </div>
        </div>
      )}
    </div>
  )
}
