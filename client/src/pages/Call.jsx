import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { io } from 'socket.io-client'
import { useAuth } from '../AuthContext'
import { api } from '../api'
import VideoGrid from '../components/VideoGrid'
import Controls from '../components/Controls'
import { videoProcessor } from '../utils/videoProcessor'

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
]

export default function Call() {
  const { token } = useParams()
  const { user, loading: authLoading } = useAuth()
  const [call, setCall] = useState(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('idle')
  const [mediaWarning, setMediaWarning] = useState('')
  const [peers, setPeers] = useState({})
  const [screenStream, setScreenStream] = useState(null)
  const [isBlurEnabled, setIsBlurEnabled] = useState(false)
  const [blurAmount, setBlurAmount] = useState(12)
  const [copied, setCopied] = useState(false)
  const [joined, setJoined] = useState(false)
  const [noiseSuppression, setNoiseSuppression] = useState(false)

  const socketRef = useRef(null)
  const localStreamRef = useRef(null)
  const connectionsRef = useRef({})
  const localVideoRef = useRef(null)
  const screenVideoRef = useRef(null)
  const drawingCanvasRef = useRef(null)
  const processingCanvasRef = useRef(null)
  const backgroundCanvasRef = useRef(null)
  const animationRef = useRef(null)

  useEffect(() => {
    if (!user) return
    api.getCall(token)
      .then(({ call }) => setCall(call))
      .catch((err) => setError(err.message))
  }, [token, user])

  // Joining follows a click: browsers only play the other side's sound after
  // a gesture on the page, and it lets people settle the camera first.
  const canJoin = Boolean(user && call && joined)

  useEffect(() => {
    if (!canJoin) return
    let disposed = false

    const createConnection = (peerId, peerName) => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
      const stream = localStreamRef.current
      if (stream) stream.getTracks().forEach((track) => pc.addTrack(track, stream))

      pc.ontrack = (event) => {
        setPeers((prev) => ({ ...prev, [peerId]: { name: peerName, stream: event.streams[0] } }))
      }
      pc.onicecandidate = (event) => {
        if (event.candidate) socketRef.current.emit('ice-candidate', { to: peerId, candidate: event.candidate })
      }
      connectionsRef.current[peerId] = pc
      return pc
    }

    const start = async () => {
      setStatus('requesting-media')
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: true },
          video: true
        })
        if (disposed) { stream.getTracks().forEach((t) => t.stop()); return }
        localStreamRef.current = stream
        if (localVideoRef.current) localVideoRef.current.srcObject = stream
      } catch {
        setMediaWarning('Camera and microphone are off — others will not see or hear you.')
      }
      if (disposed) return
      setStatus('connecting')

      const socket = io({ withCredentials: true })
      socketRef.current = socket

      socket.on('connect_error', (err) => setError(err.message))

      socket.on('offer', async ({ from, offer }) => {
        const pc = connectionsRef.current[from] ?? createConnection(from, peers[from]?.name ?? 'Participant')
        await pc.setRemoteDescription(new RTCSessionDescription(offer))
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        socket.emit('answer', { to: from, answer })
      })
      socket.on('answer', async ({ from, answer }) => {
        await connectionsRef.current[from]?.setRemoteDescription(new RTCSessionDescription(answer))
      })
      socket.on('ice-candidate', async ({ from, candidate }) => {
        const pc = connectionsRef.current[from]
        if (pc && candidate) {
          try { await pc.addIceCandidate(new RTCIceCandidate(candidate)) } catch (err) { console.error('ICE error:', err) }
        }
      })
      socket.on('user-joined', ({ id: peerId, name }) => {
        setPeers((prev) => ({ ...prev, [peerId]: { name, stream: null } }))
      })
      socket.on('user-left', (peerId) => {
        connectionsRef.current[peerId]?.close()
        delete connectionsRef.current[peerId]
        setPeers((prev) => { const next = { ...prev }; delete next[peerId]; return next })
      })
      socket.on('drawing', ({ x0, y0, x1, y1, color }) => {
        const canvas = drawingCanvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        ctx.strokeStyle = color ?? '#ff3b30'
        ctx.lineWidth = 3
        ctx.lineCap = 'round'
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke()
      })

      socket.emit('join-call', token, async (response) => {
        if (response?.error) { setError(response.error); return }
        for (const peer of response.peers) {
          const pc = createConnection(peer.id, peer.name)
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)
          socket.emit('offer', { to: peer.id, offer })
        }
        setStatus('live')
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
  }, [canJoin, token])

  useEffect(() => {
    if (!isBlurEnabled) return
    let cancelled = false
    videoProcessor.onFrame = (results) => {
      const canvas = processingCanvasRef.current
      const background = backgroundCanvasRef.current
      const video = localVideoRef.current
      if (!canvas || !background || !video) return
      const width = video.videoWidth || 640
      const height = video.videoHeight || 480
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height }
      if (background.width !== width || background.height !== height) { background.width = width; background.height = height }

      // The whole frame goes on a canvas blurred by CSS (Safari has no
      // canvas filter); the person, cut out by the mask, is drawn on top.
      background.getContext('2d').drawImage(results.image, 0, 0, width, height)

      const ctx = canvas.getContext('2d')
      ctx.save()
      ctx.clearRect(0, 0, width, height)
      ctx.imageSmoothingEnabled = true
      ctx.drawImage(results.segmentationMask, 0, 0, width, height)
      ctx.globalCompositeOperation = 'source-in'
      ctx.drawImage(results.image, 0, 0, width, height)
      ctx.restore()
    }
    const loop = async () => {
      if (cancelled) return
      const video = localVideoRef.current
      if (video && video.readyState >= 2) {
        try { await videoProcessor.send(video) } catch (err) { console.error('Segmentation error:', err) }
      }
      if (!cancelled) animationRef.current = requestAnimationFrame(loop)
    }
    videoProcessor.initialize()
      .then(() => { if (!cancelled) loop() })
      .catch((err) => {
        console.error(err)
        setMediaWarning(`Blur could not start: ${err?.message ?? err}`)
        setIsBlurEnabled(false)
      })
    return () => {
      cancelled = true
      videoProcessor.onFrame = null
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [isBlurEnabled, blurAmount])

  const toggleTrack = (kind) => () => {
    localStreamRef.current?.getTracks().filter((t) => t.kind === kind).forEach((t) => { t.enabled = !t.enabled })
  }

  const toggleNoiseSuppression = async () => {
    const next = !noiseSuppression
    setNoiseSuppression(next)
    for (const track of localStreamRef.current?.getAudioTracks() ?? []) {
      try {
        await track.applyConstraints({ noiseSuppression: next, echoCancellation: true, autoGainControl: next })
      } catch (err) {
        console.error('Noise suppression not supported:', err)
      }
    }
  }

  const shareScreen = async () => {
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

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      window.prompt('Copy this link:', window.location.href)
    }
  }

  if (error) {
    return (
      <div className="centered">
        <div className="card">
          <h2>Cannot join</h2>
          <p className="error">{error}</p>
          <Link className="button" to="/classroom">Back</Link>
        </div>
      </div>
    )
  }

  if (authLoading) return <div className="centered">Loading…</div>
  // Calls are for people on the platform: sign in first, then come back here.
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(`/call/${token}`)}`} replace />
  if (!call) return <div className="centered">Loading…</div>

  if (!joined) {
    return (
      <div className="auth-page">
        <div className="card">
          <h1>{call.title ?? 'Video call'}</h1>
          <p className="muted">{call.host} · {call.schoolName}</p>
          <p className="muted">Your camera and microphone switch on when you join.</p>
          <button onClick={() => setJoined(true)} autoFocus>Join call</button>
          <Link className="ghost button" to="/classroom">Back</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="lesson-page">
      <header className="topbar">
        <div className="nav-identity">
          <strong>{call.title ?? 'Video call'}</strong>
          <span className="muted"> · {call.host}</span>
        </div>
        <div className="row-actions">
          <button className="ghost" onClick={copyLink}>{copied ? 'Link copied' : 'Copy invite link'}</button>
          <Link className="ghost" to="/classroom">Leave</Link>
        </div>
      </header>

      {status === 'requesting-media' && (
        <div className="banner">Waiting for camera and microphone access — please allow it in the browser prompt.</div>
      )}
      {status !== 'requesting-media' && mediaWarning && <div className="banner warning">{mediaWarning}</div>}

      <div className="view-pane">
        <VideoGrid
          peers={peers}
          screenStream={screenStream}
          localVideoRef={localVideoRef}
          screenVideoRef={screenVideoRef}
          drawingCanvasRef={drawingCanvasRef}
          processingCanvasRef={processingCanvasRef}
          backgroundCanvasRef={backgroundCanvasRef}
          blurAmount={blurAmount}
          isBlurEnabled={isBlurEnabled}
          socketRef={socketRef}
        />
      </div>

      <Controls
        onToggleCamera={toggleTrack('video')}
        onToggleMicrophone={toggleTrack('audio')}
        onShareScreen={shareScreen}
        hasScreenStream={Boolean(screenStream)}
        isBlurEnabled={isBlurEnabled}
        onBlurToggle={() => setIsBlurEnabled((v) => !v)}
        blurAmount={blurAmount}
        onBlurChange={setBlurAmount}
        noiseSuppression={noiseSuppression}
        onNoiseToggle={toggleNoiseSuppression}
      />
    </div>
  )
}
