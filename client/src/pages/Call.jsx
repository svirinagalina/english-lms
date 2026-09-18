import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { io } from 'socket.io-client'
import { useAuth } from '../AuthContext'
import { api } from '../api'
import VideoGrid from '../components/VideoGrid'
import Controls from '../components/Controls'
import Whiteboard from '../components/Whiteboard'
import Writing from '../components/Writing'
import { videoProcessor } from '../utils/videoProcessor'
import { denoiseTrack } from '../utils/noiseSuppressor'

// Older Safari cannot blur inside a canvas; there the layer is blurred by CSS.
const CANVAS_FILTER = typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype

// Floating chat panel for the call.
function CallChat({ messages, onSend, onClose }) {
  const [draft, setDraft] = useState('')
  const listRef = useRef(null)
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }) }, [messages])
  const submit = (event) => {
    event.preventDefault()
    onSend(draft)
    setDraft('')
  }
  return (
    <div className="call-chat">
      <div className="call-chat-head">
        <strong>Chat</strong>
        <button className="chip-close" onClick={onClose} title="Close chat">×</button>
      </div>
      <div className="call-chat-list" ref={listRef}>
        {messages.length === 0 && <div className="muted">No messages yet.</div>}
        {messages.map((m, i) => (
          <div key={i} className={`call-chat-msg ${m.mine ? 'mine' : ''}`}>
            <div className="call-chat-meta">{m.mine ? 'You' : m.name} · {new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
            <div className="call-chat-text">{m.text}</div>
          </div>
        ))}
      </div>
      <form className="call-chat-form" onSubmit={submit}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write a message…" autoFocus />
        <button type="submit" disabled={!draft.trim()}>Send</button>
      </form>
    </div>
  )
}

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

const RECONNECTING = 'Connection lost — reconnecting…'

export default function Call() {
  const { token } = useParams()
  const [searchParams] = useSearchParams()
  // A call started from a board opens on that board.
  const requestedBoard = searchParams.get('board')
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [call, setCall] = useState(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('idle')
  const [mediaWarning, setMediaWarning] = useState('')
  const [peers, setPeers] = useState({})
  const [screenStream, setScreenStream] = useState(null)
  // Blur is on from the start; it can be switched off in the call.
  const [isBlurEnabled, setIsBlurEnabled] = useState(true)
  const [blurAmount, setBlurAmount] = useState(20)
  const [copied, setCopied] = useState(false)
  const [micOn, setMicOn] = useState(true)
  const [cameraOn, setCameraOn] = useState(true)
  const micOnRef = useRef(true)
  const [joined, setJoined] = useState(false)
  const [noiseSuppression, setNoiseSuppression] = useState(true)
  const rawMicRef = useRef(null)
  const denoiserRef = useRef(null)
  const [blurStatus, setBlurStatus] = useState('')
  // The student's board, shown inside the call for everyone in it.
  // Boards this person may show in the call (students' boards, own boards).
  const [boards, setBoards] = useState([])
  // Writing document open in the call, by classroom id; it covers the board.
  const [writingId, setWritingId] = useState(null)
  // In-call text chat (not stored; lives as long as the call page).
  const [chatOpen, setChatOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [unread, setUnread] = useState(0)
  const chatOpenRef = useRef(false)
  chatOpenRef.current = chatOpen
  const [boardId, setBoardId] = useState(null)
  const isStaff = user && user.role !== 'STUDENT'
  const isStaffRef = useRef(isStaff)
  isStaffRef.current = isStaff
  const boardsRef = useRef([])

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
        api.allBoards().then(({ boards }) => setBoards(boards)).catch(() => {})
      })
      .catch((err) => setError(err.message))
  }, [token, user])

  // Joining follows a click: browsers only play the other side's sound after
  // a gesture on the page, and it lets people settle the camera first.
  const canJoin = Boolean(user && call && joined)

  useEffect(() => {
    if (!canJoin) return
    let disposed = false

    let iceServers = ICE_SERVERS
    const createConnection = (peerId, peerName) => {
      const pc = new RTCPeerConnection({ iceServers })
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
      // TURN relay credentials, when the server has a relay configured.
      try { iceServers = (await api.iceServers()).iceServers } catch { /* STUN only */ }
      setStatus('requesting-media')
      try {
        const raw = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: true
        })
        if (disposed) { raw.getTracks().forEach((t) => t.stop()); return }
        rawMicRef.current = raw.getAudioTracks()[0] ?? null
        const stream = new MediaStream(raw.getVideoTracks())
        // Outgoing audio: the neural denoiser's output when available.
        let audio = rawMicRef.current
        if (audio) {
          try {
            const cleaned = await denoiseTrack(audio)
            denoiserRef.current = cleaned
            audio = cleaned.track
          } catch (err) {
            console.error('Noise suppressor unavailable, using the plain microphone:', err)
            setNoiseSuppression(false)
          }
        }
        if (audio) stream.addTrack(audio)
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
      socket.on('user-joined', ({ id: peerId, name, userId }) => {
        setPeers((prev) => ({ ...prev, [peerId]: { name, stream: null, muted: false, userId } }))
        // A student arriving in a call with no board yet brings their board up.
        if (isStaffRef.current && userId) {
          setBoardId((current) => current ?? boardsRef.current.find((b) => b.studentId === userId)?.id ?? null)
        }
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
      socket.on('screen-share-started', ({ from }) => {
        setPeers((prev) => (prev[from] ? { ...prev, [from]: { ...prev[from], sharing: true } } : prev))
      })
      socket.on('screen-share-stopped', ({ from }) => {
        setPeers((prev) => (prev[from] ? { ...prev, [from]: { ...prev[from], sharing: false } } : prev))
      })
      socket.on('chat:message', (message) => {
        setMessages((prev) => [...prev.slice(-200), { ...message, mine: message.from === socket.id }])
        if (!chatOpenRef.current) setUnread((n) => n + 1)
      })
      socket.on('doc:switched', (id) => setWritingId(id))
      socket.on('doc:closed', () => setWritingId(null))
      socket.on('drawing', ({ x0, y0, x1, y1, color }) => {
        const canvas = drawingCanvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        ctx.strokeStyle = color ?? '#ff3b30'
        ctx.lineWidth = 3
        ctx.lineCap = 'round'
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke()
      })

      // Runs on the first connection and again after every reconnect (a
      // Wi-Fi blip, a laptop waking up, a server restart): the room is
      // joined afresh and every peer connection is made again, since the
      // others now know us under a new id.
      let connectedBefore = false
      socket.on('connect', () => {
        if (connectedBefore) {
          Object.values(connectionsRef.current).forEach((pc) => pc.close())
          connectionsRef.current = {}
          setPeers({})
        }
        connectedBefore = true
        setMediaWarning((w) => (w === RECONNECTING ? '' : w))
        socket.emit('join-call', token, async (response) => {
          if (response?.error) { setError(response.error); return }
          if (response.boardId) setBoardId(response.boardId)
          if (response.docId) setWritingId(response.docId)
          for (const peer of response.peers) {
            setPeers((prev) => ({ ...prev, [peer.id]: { name: peer.name, stream: prev[peer.id]?.stream ?? null, muted: Boolean(peer.muted) } }))
            const pc = createConnection(peer.id, peer.name)
            const offer = await pc.createOffer()
            await pc.setLocalDescription(offer)
            socket.emit('offer', { to: peer.id, offer })
          }
          socket.emit('mic:state', { muted: !micOnRef.current })
          setStatus('live')
        })
      })
      socket.on('disconnect', () => setMediaWarning(RECONNECTING))
    }

    start()

    return () => {
      disposed = true
      socketRef.current?.disconnect()
      Object.values(connectionsRef.current).forEach((pc) => pc.close())
      connectionsRef.current = {}
      localStreamRef.current?.getTracks().forEach((track) => track.stop())
      rawMicRef.current?.stop()
      denoiserRef.current?.stop()
      denoiserRef.current = null
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
      if (rawMicRef.current) rawMicRef.current.enabled = next
      if (denoiserRef.current) denoiserRef.current.track.enabled = next
      micOnRef.current = next
      setMicOn(next)
      socketRef.current?.emit('mic:state', { muted: !next })
    } else {
      setCameraOn((v) => !v)
    }
  }

  // Switches the outgoing audio between the denoised track and the plain
  // microphone; the microphone itself stays open.
  const toggleNoiseSuppression = async () => {
    const next = !noiseSuppression
    const raw = rawMicRef.current
    if (!raw) return
    try {
      let track = raw
      if (next) {
        if (!denoiserRef.current) denoiserRef.current = await denoiseTrack(raw)
        track = denoiserRef.current.track
      }
      const stream = localStreamRef.current
      const old = stream?.getAudioTracks()[0]
      track.enabled = micOnRef.current
      for (const pc of Object.values(connectionsRef.current)) {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'audio')
        if (sender) await sender.replaceTrack(track)
      }
      if (stream) { if (old && old !== track) stream.removeTrack(old); if (!stream.getAudioTracks().includes(track)) stream.addTrack(track) }
      setNoiseSuppression(next)
    } catch (err) {
      setMediaWarning(`Noise reduction is not available here: ${err?.message ?? err}`)
    }
  }

  // The screen goes out in place of the camera on every connection (no
  // renegotiation needed); the camera comes back when sharing stops.
  const screenStreamRef = useRef(null)
  const swapOutgoingVideo = async (track) => {
    for (const pc of Object.values(connectionsRef.current)) {
      const sender = pc.getSenders().find((s) => s.track?.kind === 'video')
      if (sender && track) await sender.replaceTrack(track).catch(() => {})
    }
  }
  const stopSharing = async () => {
    const stream = screenStreamRef.current
    screenStreamRef.current = null
    stream?.getTracks().forEach((t) => t.stop())
    setScreenStream(null)
    await swapOutgoingVideo(localStreamRef.current?.getVideoTracks()[0])
    socketRef.current?.emit('screen-share-stop')
  }
  const shareScreen = async () => {
    if (screenStreamRef.current) { await stopSharing(); return }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      screenStreamRef.current = stream
      setScreenStream(stream)
      if (screenVideoRef.current) screenVideoRef.current.srcObject = stream
      await swapOutgoingVideo(stream.getVideoTracks()[0])
      socketRef.current?.emit('screen-share-start')
      stream.getVideoTracks()[0].onended = () => { if (screenStreamRef.current) stopSharing() }
    } catch (err) {
      console.error('Screen share cancelled:', err)
    }
  }

  boardsRef.current = boards
  const currentBoard = boards.find((b) => b.id === boardId) ?? null

  // A call started from a student's page opens that student's board as soon
  // as the teacher is in; the student follows through board:switched.
  const autoOpened = useRef(false)
  useEffect(() => {
    if (status !== 'live' || !isStaff || autoOpened.current) return
    const wanted = requestedBoard
      ? boards.find((b) => b.id === requestedBoard)
      : call?.classroomId ? boards.find((b) => b.classroomId === call.classroomId) : null
    if (!wanted) return
    autoOpened.current = true
    setBoardId((current) => current ?? wanted.id)
  }, [status, isStaff, call, boards, requestedBoard])

  // Classrooms whose writing can be opened here: the call's own, else the
  // one behind the open board, else those of the students present.
  const writingChoices = (() => {
    const seen = new Map()
    const add = (classroomId, label) => { if (classroomId && !seen.has(classroomId)) seen.set(classroomId, label) }
    if (call?.classroomId) {
      add(call.classroomId, boards.find((b) => b.classroomId === call.classroomId)?.student ?? 'Student')
      return [...seen].map(([id, label]) => ({ id, label }))
    }
    if (currentBoard?.studentId) add(currentBoard.classroomId, currentBoard.student)
    for (const peer of Object.values(peers)) {
      const board = boards.find((b) => b.studentId && b.studentId === peer.userId)
      if (board) add(board.classroomId, board.student)
    }
    if (!isStaff) for (const b of boards) if (b.studentId === user.id) add(b.classroomId, 'My writing')
    // Nothing contextual (no student here yet): offer every student's writing.
    if (!seen.size && isStaff) for (const b of boards) if (b.studentId) add(b.classroomId, b.student)
    return [...seen].map(([id, label]) => ({ id, label }))
  })()
  const openWriting = (id) => setWritingId(id)
  const closeWriting = () => {
    setWritingId(null)
    socketRef.current?.emit('doc:close')
  }

  const sendChat = (text) => {
    if (text.trim()) socketRef.current?.emit('chat:message', { text })
  }
  const toggleChat = () => {
    setChatOpen((open) => !open)
    setUnread(0)
  }

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
    <div className={`lesson-page ${boardId || writingId ? 'board-mode' : ''}`}>
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
          board={writingId ? (
            <Writing
              socketRef={socketRef}
              classroomId={writingId}
              user={user}
              title="Writing"
              subtitle={writingChoices.find((c) => c.id === writingId)?.label ?? boards.find((b) => b.classroomId === writingId)?.student}
              onClose={closeWriting}
              embedded
            />
          ) : boardId ? (
            <Whiteboard
              socketRef={socketRef}
              boardId={boardId}
              title={currentBoard?.title ?? 'Board'}
              subtitle={currentBoard?.student ?? currentBoard?.owner ?? undefined}
              onClose={closeBoard}
              onOpenWriting={currentBoard?.studentId ? () => openWriting(currentBoard.classroomId) : (writingChoices.length === 1 ? () => openWriting(writingChoices[0].id) : undefined)}
              canSpotlight={isStaff}
              onUploadImage={isStaff && currentBoard
                ? async (dataUrl) => {
                    try {
                      const { src } = await api.uploadBoardImage(currentBoard.classroomId, boardId, dataUrl)
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

      {chatOpen && (
        <CallChat messages={messages} onSend={sendChat} onClose={toggleChat} />
      )}

      <Controls
        onToggleCamera={toggleTrack('video')}
        onToggleMicrophone={toggleTrack('audio')}
        cameraOn={cameraOn}
        micOn={micOn}
        onLeave={boardId || writingId ? () => navigate('/classroom') : undefined}
        onCopyLink={boardId || writingId ? copyLink : undefined}
        copied={copied}
        chatOpen={chatOpen}
        unread={unread}
        onToggleChat={toggleChat}
        writingChoices={writingChoices}
        writingId={writingId}
        onOpenWriting={openWriting}
        onCloseWriting={closeWriting}
        onShareScreen={shareScreen}
        hasScreenStream={Boolean(screenStream)}
        boards={boards}
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
