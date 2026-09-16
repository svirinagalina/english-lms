import { useEffect, useRef } from 'react'

function PeerVideo({ stream, name }) {
  const ref = useRef(null)

  // Attach after mount, not during render: a peer whose stream is already
  // known when its tile first appears would otherwise never get it.
  useEffect(() => {
    const video = ref.current
    if (!video) return
    if (video.srcObject !== stream) video.srcObject = stream
    if (stream) video.play().catch(() => { /* autoplay policy: retried on the next click */ })
  }, [stream])

  return (
    <div className="video-tile">
      <video ref={ref} autoPlay playsInline />
      <span className="tile-label">{name ?? 'Participant'}</span>
    </div>
  )
}

export default function VideoGrid({
  peers,
  board,
  screenStream,
  localVideoRef,
  screenVideoRef,
  drawingCanvasRef,
  processingCanvasRef,
  backgroundCanvasRef,
  blurAmount,
  isBlurEnabled,
  socketRef
}) {
  const drawing = useRef(false)
  const lastPoint = useRef(null)

  const pointerPosition = (event) => {
    const rect = drawingCanvasRef.current.getBoundingClientRect()
    return {
      x: (event.clientX - rect.left) * (drawingCanvasRef.current.width / rect.width),
      y: (event.clientY - rect.top) * (drawingCanvasRef.current.height / rect.height)
    }
  }

  const startDrawing = (event) => {
    drawing.current = true
    lastPoint.current = pointerPosition(event)
  }

  const draw = (event) => {
    if (!drawing.current) return

    const point = pointerPosition(event)
    const from = lastPoint.current
    const ctx = drawingCanvasRef.current.getContext('2d')

    ctx.strokeStyle = '#ff3b30'
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(point.x, point.y)
    ctx.stroke()

    socketRef.current?.emit('drawing', {
      x0: from.x,
      y0: from.y,
      x1: point.x,
      y1: point.y,
      color: '#ff3b30'
    })

    lastPoint.current = point
  }

  const stopDrawing = () => {
    drawing.current = false
    lastPoint.current = null
  }

  const handleScreenLoaded = () => {
    const video = screenVideoRef.current
    const canvas = drawingCanvasRef.current
    if (video && canvas) {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
    }
  }

  return (
    <div className={`stage ${screenStream || board ? 'with-screen' : ''}`}>
      {board && <div className="board-area">{board}</div>}
      {screenStream && !board && (
        <div className="screen-area">
          <video
            ref={screenVideoRef}
            autoPlay
            playsInline
            muted
            onLoadedMetadata={handleScreenLoaded}
          />
          <canvas
            ref={drawingCanvasRef}
            className="drawing-layer"
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
          />
        </div>
      )}

      <div className="tiles">
        <div className="video-tile local">
          <video ref={localVideoRef} autoPlay muted playsInline />
          <canvas
            ref={backgroundCanvasRef}
            className={isBlurEnabled ? 'blur-layer' : 'blur-layer hidden'}
            style={{ filter: `blur(${blurAmount}px)`, transform: 'scale(1.12)' }}
          />
          <canvas
            ref={processingCanvasRef}
            className={isBlurEnabled ? 'blur-layer' : 'blur-layer hidden'}
          />
          <span className="tile-label">You</span>
        </div>

        {Object.entries(peers).map(([peerId, peer]) => (
          <PeerVideo key={peerId} stream={peer.stream} name={peer.name} />
        ))}
      </div>
    </div>
  )
}
