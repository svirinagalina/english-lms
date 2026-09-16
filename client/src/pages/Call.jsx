import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { io } from 'socket.io-client'
import { useAuth } from '../AuthContext'
import { api } from '../api'
import VideoGrid from '../components/VideoGrid'
import Controls from '../components/Controls'
import Whiteboard from '../components/Whiteboard'
import { videoProcessor } from '../utils/videoProcessor'

// Older Safari cannot blur inside a canvas; there the layer is blurred by CSS.
const CANVAS_FILTER = typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype

const hasWebGL = () => {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
]

export default function Call() {
  const { token } = useParams()
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [call, setCall] = useState(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('idle')
  const [mediaWarning, setMediaWarning] = useState('')
  const [peers, setPeers] = useState({})
  const [screenStream, setScreenStream] = useState(null)
  const [isBlurEnabled, setIsBlurEnabled] = useState(false)
  const [blurAmount, setBlurAmount] = useState(20)
  const [copied, setCopied] = useState(false)
  const [micOn, setMicOn] = useState(true)
  const [cameraOn, setCameraOn] = useState(true)
  const micOnRef = useRef(true)
  const [joined, setJoined] = useState(false)
  const [noiseSuppression, setNoiseSuppression] = useState(false)
  const [blurStatus, setBlurStatus] = useState('')
  // The student's board, shown inside the call for everyone in it.
  const [classroom, setClassroom] = useState(null)
  const [boardId, setBoardId] = useState(null)
  const isStaff = user && user.role !== 'STUDENT'

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
      .then(({ call }) => {
        setCall(call)
        if (call.classroomId) api.getClassroom(call.classroomId).then(({ classroom }) => setClassroom(classroom)).catch(() => {})
      })
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
        setPeers((prev) => ({ ...prev, [peerId]: { ...(prev[peerId] ?? { name: peerName }), stream: event.streams[0] } }))
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
        setPeers((prev) => ({ ...prev, [peerId]: { name, stream: null, muted: false } }))
        // The newcomer needs to know whether I am muted.
        socket.emit('mic:state', { muted: !micOnRef.current })
      })
      socket.on('mic:state', ({ from, muted }) => {
        setPeers((prev) => (prev[from] ? { ...prev, [from]: { ...prev[from], muted } } : prev))
      })
      socket.on('user-left', (peerId) => {
        connectionsRef.current[peerId]?.close()
        delete connectionsRef.current[peerId]
        setPeers((prev) => { const next = { ...prev }; delete next[peerId]; return next })
      })
      // Follow the other side's board: opening or closing it there does it here too.
      socket.on('board:switched', (id) => setBoardId(id))
      socket.on('board:closed', () => setBoardId(null))
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
          setPeers((prev) => ({ ...prev, [peer.id]: { name: peer.name, stream: prev[peer.id]?.stream ?? null, muted: Boolean(peer.muted) } }))
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

      // The blurred frame goes on its own canvas, the person (cut out by the
      // mask) on top. Blurring happens at the video's own resolution, and the
      // frame is drawn a little past the edges so the blur has no transparent
      // rim that would let the sharp video underneath show through.
      const bg = background.getContext('2d')
      const margin = blurAmount * 2
      if (CANVAS_FILTER) {
        bg.save()
        bg.filter = `blur(${blurAmount}px)`
        bg.drawImage(results.image, -margin, -margin, width + 2 * margin, height + 2 * margin)
        bg.restore()
      } else {
        bg.drawImage(results.image, 0, 0, width, height)
      }

      const ctx = canvas.getContext('2d')
      ctx.save()
      ctx.clearRect(0, 0, width, height)
      ctx.imageSmoothingEnabled = true
      ctx.drawImage(results.segmentationMask, 0, 0, width, height)
      ctx.globalCompositeOperation = 'source-in'
      ctx.drawImage(results.image, 0, 0, width, height)
      ctx.restore()
    }
    // A frame that fails stops the blur and says why, instead of leaving the
    // toggle on with nothing happening.
    let frames = 0
    const fail = (stage, err) => {
      console.error(`Blur ${stage}:`, err)
      cancelled = true
      setMediaWarning(`Blur could not ${stage}: ${err?.message ?? String(err)}`)
      setIsBlurEnabled(false)
    }
    const loop = async () => {
      if (cancelled) return
      const video = localVideoRef.current
      if (video && video.readyState >= 2) {
        try {
          if (await videoProcessor.send(video)) {
            frames += 1
            if (frames === 1) setMediaWarning((w) => (w.startsWith('Blur') ? '' : w))
          }
        } catch (err) {
          fail('process a frame', err)
          return
        }
      }
      if (!cancelled) animationRef.current = requestAnimationFrame(loop)
    }
    // The runtime and model are a few megabytes: say so while they load,
    // and only once they are in, treat "no frames" as a failure.
    let watchdog = null
    if (!hasWebGL()) {
      fail('start', new Error('WebGL is disabled in this browser; the blur needs it'))
    } else {
      if (!videoProcessor.initialized) setBlurStatus('Loading the blur model…')
      videoProcessor.initialize()
        .then(() => {
          if (cancelled) return
          setBlurStatus('')
          loop()
          watchdog = setTimeout(() => {
            if (!cancelled && frames === 0) {
              const video = localVideoRef.current
              fail('start', new Error(`no frames were processed (camera ${video?.videoWidth ?? 0}×${video?.videoHeight ?? 0}, ready ${video?.readyState ?? '?'})`))
            }
          }, 8000)
        })
        .catch((err) => fail('start', err))
    }
    return () => {
      cancelled = true
      if (watchdog) clearTimeout(watchdog)
      setBlurStatus('')
      videoProcessor.onFrame = null
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [isBlurEnabled, blurAmount])

  const toggleTrack = (kind) => () => {
    localStreamRef.current?.getTracks().filter((t) => t.kind === kind).forEach((t) => { t.enabled = !t.enabled })
    if (kind === 'audio') {
      const next = !micOnRef.current
      micOnRef.current = next
      setMicOn(next)
      socketRef.current?.emit('mic:state', { muted: !next })
    } else {
      setCameraOn((v) => !v)
    }
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

  // A lesson opens on the student's board as soon as the teacher is in;
  // the student follows through board:switched.
  const autoOpened = useRef(false)
  useEffect(() => {
    if (status !== 'live' || !isStaff || !classroom?.boards?.[0] || autoOpened.current) return
    autoOpened.current = true
    setBoardId((current) => current ?? classroom.boards[0].id)
  }, [status, isStaff, classroom])

  const openBoard = (id) => setBoardId(id)
  const closeBoard = () => {
    setBoardId(null)
    socketRef.current?.emit('board:close')
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
    <div className={`lesson-page ${boardId && classroom ? 'board-mode' : ''}`}>
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
      {blurStatus && <div className="banner">{blurStatus}</div>}

      <div className="view-pane">
        <VideoGrid
          peers={peers}
          micOn={micOn}
          board={boardId && classroom ? (
            <Whiteboard
              socketRef={socketRef}
              boardId={boardId}
              title={classroom.boards.find((b) => b.id === boardId)?.title ?? 'Board'}
              subtitle={classroom.student?.name}
              onClose={closeBoard}
              onUploadImage={isStaff
                ? async (dataUrl) => {
                    try {
                      const { src } = await api.uploadBoardImage(classroom.id, boardId, dataUrl)
                      return src
                    } catch (err) {
                      setError(err.message)
                      return null
                    }
                  }
                : undefined}
            />
          ) : null}
          screenStream={screenStream}
          localVideoRef={localVideoRef}
          screenVideoRef={screenVideoRef}
          drawingCanvasRef={drawingCanvasRef}
          processingCanvasRef={processingCanvasRef}
          backgroundCanvasRef={backgroundCanvasRef}
          cssBlur={CANVAS_FILTER ? 0 : blurAmount}
          isBlurEnabled={isBlurEnabled}
          socketRef={socketRef}
        />
      </div>

      <Controls
        onToggleCamera={toggleTrack('video')}
        onToggleMicrophone={toggleTrack('audio')}
        cameraOn={cameraOn}
        micOn={micOn}
        onLeave={boardId && classroom ? () => navigate('/classroom') : undefined}
        onShareScreen={shareScreen}
        hasScreenStream={Boolean(screenStream)}
        boards={classroom?.boards ?? []}
        boardId={boardId}
        onOpenBoard={openBoard}
        onCloseBoard={closeBoard}
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
