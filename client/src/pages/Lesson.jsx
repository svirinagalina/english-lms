import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { io } from 'socket.io-client'
import { api } from '../api'
import VideoGrid from '../components/VideoGrid'
import Controls from '../components/Controls'
import Whiteboard from '../components/Whiteboard'
import { videoProcessor } from '../utils/videoProcessor'

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
]

export default function Lesson() {
  const { id } = useParams()
  const [lesson, setLesson] = useState(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('requesting-media')
  const [mediaWarning, setMediaWarning] = useState('')
  const [view, setView] = useState('call')
  const [peers, setPeers] = useState({})
  const [screenStream, setScreenStream] = useState(null)
  const [isBlurEnabled, setIsBlurEnabled] = useState(false)
  const [blurAmount, setBlurAmount] = useState(12)

  const socketRef = useRef(null)
  const localStreamRef = useRef(null)
  const connectionsRef = useRef({})
  const localVideoRef = useRef(null)
  const screenVideoRef = useRef(null)
  const drawingCanvasRef = useRef(null)
  const processingCanvasRef = useRef(null)
  const animationRef = useRef(null)

  useEffect(() => {
    let disposed = false

    const createConnection = (peerId, peerName) => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })

      const stream = localStreamRef.current
      if (stream) {
        stream.getTracks().forEach((track) => pc.addTrack(track, stream))
      }

      pc.ontrack = (event) => {
        setPeers((prev) => ({ ...prev, [peerId]: { name: peerName, stream: event.streams[0] } }))
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socketRef.current.emit('ice-candidate', { to: peerId, candidate: event.candidate })
        }
      }

      connectionsRef.current[peerId] = pc
      return pc
    }

    const start = async () => {
      try {
        const { lesson } = await api.getLesson(id)
        if (disposed) return
        setLesson(lesson)
      } catch (err) {
        setError(err.message)
        return
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: true
        })
        if (disposed) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        localStreamRef.current = stream
        if (localVideoRef.current) localVideoRef.current.srcObject = stream
      } catch (err) {
        setMediaWarning('Camera and microphone are off — others will not see or hear you.')
      }

      if (disposed) return
      setStatus('connecting')

      const socket = io({ withCredentials: true })
      socketRef.current = socket

      socket.on('connect_error', (err) => setError(err.message))

      socket.on('offer', async ({ from, offer }) => {
        const pc = connectionsRef.current[from] ?? createConnection(from, 'Participant')
        await pc.setRemoteDescription(new RTCSessionDescription(offer))
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        socket.emit('answer', { to: from, answer })
      })

      socket.on('answer', async ({ from, answer }) => {
        const pc = connectionsRef.current[from]
        if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer))
      })

      socket.on('ice-candidate', async ({ from, candidate }) => {
        const pc = connectionsRef.current[from]
        if (pc && candidate) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate))
          } catch (err) {
            console.error('ICE error:', err)
          }
        }
      })

      socket.on('user-joined', ({ id: peerId, name }) => {
        setPeers((prev) => ({ ...prev, [peerId]: { name, stream: null } }))
      })

      socket.on('user-left', (peerId) => {
        connectionsRef.current[peerId]?.close()
        delete connectionsRef.current[peerId]
        setPeers((prev) => {
          const next = { ...prev }
          delete next[peerId]
          return next
        })
      })

      socket.on('drawing', ({ x0, y0, x1, y1, color }) => {
        const canvas = drawingCanvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        ctx.strokeStyle = color ?? '#ff3b30'
        ctx.lineWidth = 3
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(x0, y0)
        ctx.lineTo(x1, y1)
        ctx.stroke()
      })

      socket.emit('join-lesson', id, async (response) => {
        if (response?.error) {
          setError(response.error)
          return
        }

        for (const peer of response.peers) {
          const pc = createConnection(peer.id, peer.name)
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)
          socket.emit('offer', { to: peer.id, offer })
        }

        setStatus('ready')
      })
    }

    start()

    return () => {
      disposed = true
      socketRef.current?.disconnect()
      Object.values(connectionsRef.current).forEach((pc) => pc.close())
      connectionsRef.current = {}
      localStreamRef.current?.getTracks().forEach((track) => track.stop())
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [id])

  useEffect(() => {
    if (!isBlurEnabled) return
    let cancelled = false

    videoProcessor.onFrame = (results) => {
      const canvas = processingCanvasRef.current
      const video = localVideoRef.current
      if (!canvas || !video) return

      const width = video.videoWidth || 640
      const height = video.videoHeight || 480
      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d')
      ctx.save()
      ctx.clearRect(0, 0, width, height)
      ctx.drawImage(results.segmentationMask, 0, 0, width, height)
      ctx.globalCompositeOperation = 'source-in'
      ctx.drawImage(results.image, 0, 0, width, height)
      ctx.globalCompositeOperation = 'destination-over'
      ctx.filter = `blur(${blurAmount}px)`
      ctx.drawImage(results.image, 0, 0, width, height)
      ctx.restore()
    }

    const loop = async () => {
      if (cancelled) return
      const video = localVideoRef.current
      if (video && video.readyState >= 2) {
        try {
          await videoProcessor.send(video)
        } catch (err) {
          console.error('Segmentation error:', err)
        }
      }
      if (!cancelled) animationRef.current = requestAnimationFrame(loop)
    }

    videoProcessor.initialize()
      .then(() => { if (!cancelled) loop() })
      .catch((err) => console.error('Segmentation init failed:', err))

    return () => {
      cancelled = true
      videoProcessor.onFrame = null
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [isBlurEnabled, blurAmount])

  const toggleTrack = (kind) => () => {
    localStreamRef.current?.getTracks()
      .filter((track) => track.kind === kind)
      .forEach((track) => { track.enabled = !track.enabled })
  }

  const handleShareScreen = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      setScreenStream(stream)
      if (screenVideoRef.current) screenVideoRef.current.srcObject = stream
      socketRef.current?.emit('screen-share-start')

      stream.getVideoTracks()[0].onended = () => {
        setScreenStream(null)
        socketRef.current?.emit('screen-share-stop')
      }
    } catch (err) {
      console.error('Screen share cancelled:', err)
    }
  }

  if (error) {
    return (
      <div className="centered">
        <div className="card">
          <h2>Cannot open this lesson</h2>
          <p className="error">{error}</p>
          <Link className="button" to="/">Back to dashboard</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="lesson-page">
      <header className="topbar">
        <strong>{lesson?.title ?? 'Lesson'}</strong>

        <div className="lesson-tabs">
          <button
            className={`lesson-tab ${view === 'call' ? 'active' : ''}`}
            onClick={() => setView('call')}
          >
            Call
          </button>
          <button
            className={`lesson-tab ${view === 'board' ? 'active' : ''}`}
            onClick={() => setView('board')}
          >
            Whiteboard
          </button>
        </div>

        <Link className="ghost" to="/">Leave</Link>
      </header>

      {status === 'requesting-media' && (
        <div className="banner">
          Waiting for camera and microphone access — please allow it in the browser prompt.
        </div>
      )}
      {status !== 'requesting-media' && mediaWarning && (
        <div className="banner warning">{mediaWarning}</div>
      )}

      {/* The call stays mounted while the whiteboard is open, otherwise the
          media streams and peer connections would be torn down on every switch. */}
      <div className="view-pane" hidden={view !== 'call'}>
        <VideoGrid
          peers={peers}
          screenStream={screenStream}
          localVideoRef={localVideoRef}
          screenVideoRef={screenVideoRef}
          drawingCanvasRef={drawingCanvasRef}
          processingCanvasRef={processingCanvasRef}
          isBlurEnabled={isBlurEnabled}
          socketRef={socketRef}
        />
      </div>

      {view === 'board' && (
        <div className="view-pane">
          <Whiteboard socketRef={socketRef} connected={status === 'ready'} />
        </div>
      )}

      <Controls
        onToggleCamera={toggleTrack('video')}
        onToggleMicrophone={toggleTrack('audio')}
        onShareScreen={handleShareScreen}
        hasScreenStream={Boolean(screenStream)}
        isBlurEnabled={isBlurEnabled}
        onBlurToggle={() => setIsBlurEnabled((value) => !value)}
        blurAmount={blurAmount}
        onBlurChange={setBlurAmount}
      />
    </div>
  )
}
