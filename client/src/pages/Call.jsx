import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { io } from 'socket.io-client'
import { useAuth } from '../AuthContext'
import { api } from '../api'
import VideoGrid from '../components/VideoGrid'
import Controls from '../components/Controls'
import Reactions from '../components/Reactions'
import Whiteboard from '../components/Whiteboard'
import Writing from '../components/Writing'
import { videoProcessor } from '../utils/videoProcessor'
import { denoiseTrack, primeDenoiser, isDenoiserSupported } from '../utils/noiseSuppressor'
import { isMobile, useNarrow } from '../utils/device'

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

// The browser's own processing first (echo, gain, its noise filter), one
// channel: the neural denoiser then works on top of that.
const AUDIO_CONSTRAINTS = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: { ideal: 1 } }
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
  const [isBlurEnabled, setIsBlurEnabled] = useState(() => !isMobile())
  const [blurAmount, setBlurAmount] = useState(20)
  const [copied, setCopied] = useState(false)
  const [micOn, setMicOn] = useState(true)
  const [cameraOn, setCameraOn] = useState(true)
  const micOnRef = useRef(true)
  const [joined, setJoined] = useState(false)
  const rawMicRef = useRef(null)
  const denoiserRef = useRef(null)
  // If the denoiser's output stays silent while the microphone has sound —
  // or the browser sends silence from it — the others hear nothing: fall
  // back to the plain microphone. Checked for the whole call: the engine can
  // also die later, when a headset connects or the tab is interrupted.
  // Sends `track` instead of the current microphone audio on every connection
  // and in the local stream (the tile stays muted, so nothing is heard twice).
  const swapOutgoingAudio = async (track) => {
    track.enabled = micOnRef.current
    for (const pc of Object.values(connectionsRef.current)) {
      const sender = pc.getSenders().find((s) => s.track?.kind === 'audio')
      if (sender) await sender.replaceTrack(track).catch(() => {})
    }
    const stream = localStreamRef.current
    if (stream) { stream.getAudioTracks().forEach((t) => { if (t !== track) stream.removeTrack(t) }); if (!stream.getAudioTracks().includes(track)) stream.addTrack(track) }
  }
  const fallbackToRawMic = async (reason) => {
    const cleaned = denoiserRef.current
    const rawTrack = rawMicRef.current
    if (!rawTrack) return
    denoiserRef.current = null
    cleaned?.stop()
    await swapOutgoingAudio(rawTrack)
    // The browser's own suppression is still on the plain microphone, so
    // nothing changes for the person: no message, only a note in the console.
    console.warn(`Noise removal ${reason}; the plain microphone is sent instead.`)
  }
  const watchDenoiser = (cleaned) => {
    let silent = 0
    let lastEnergy = null
    const timer = setInterval(async () => {
      if (denoiserRef.current !== cleaned) { clearInterval(timer); return }
      const { raw, clean, state } = cleaned.levels()
      if (state !== 'running') { cleaned.resume(); return }
      // Exact zeros mean the worklet is not processing at all; RNNoise on
      // pure noise still leaves a faint, non-zero signal.
      let broken = raw > 0.003 && clean < 1e-6
      // What the browser actually sends: while our cleaned output clearly has
      // sound, the energy of the outgoing track must grow (a Safari quirk
      // can leave a Web Audio track silent on the wire).
      if (!broken && clean > 0.005) {
        const pc = Object.values(connectionsRef.current)[0]
        if (pc) {
          try {
            const stats = await pc.getStats()
            let energy = null
            stats.forEach((item) => { if (item.type === 'media-source' && item.kind === 'audio' && typeof item.totalAudioEnergy === 'number') energy = item.totalAudioEnergy })
            if (energy !== null) {
              if (lastEnergy !== null && energy <= lastEnergy) broken = true
              lastEnergy = energy
            }
          } catch { /* stats unavailable: only the meters decide */ }
        }
      }
      silent = broken ? silent + 1 : 0
      if (silent >= 3) {
        clearInterval(timer)
        // The main engine went quiet: try the lighter one before giving up.
        if (cleaned.engine === 'gtcrn' && rawMicRef.current) {
          try {
            const next = await denoiseTrack(rawMicRef.current, { engine: 'rnnoise' })
            await swapOutgoingAudio(next.track)
            cleaned.stop()
            denoiserRef.current = next
            watchDenoiser(next)
            return
          } catch { /* fall through to the plain microphone */ }
        }
        fallbackToRawMic('went silent')
      }
    }, 1000)
  }
  // A microphone that goes away (unplugged, a headset switched off) is taken
  // again from whatever the browser now offers, through the denoiser as before.
  const reacquireMic = async () => {
    let raw
    try {
      raw = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS })
    } catch { return }
    const rawTrack = raw.getAudioTracks()[0]
    if (!rawTrack) return
    rawMicRef.current = rawTrack
    rawTrack.addEventListener('ended', () => { if (rawMicRef.current === rawTrack) reacquireMic() })
    let track = rawTrack
    if (!isMobile() && isDenoiserSupported()) {
      denoiserRef.current?.stop()
      denoiserRef.current = null
      try {
        const cleaned = await denoiseTrack(rawTrack)
        denoiserRef.current = cleaned
        track = cleaned.track
        watchDenoiser(cleaned)
      } catch (err) { console.warn('Noise removal unavailable, using the plain microphone:', err) }
    }
    rawTrack.enabled = micOnRef.current
    await swapOutgoingAudio(track)
  }
  // Phones may refuse to play the others' sound until a tap: an overlay asks for one.
  const [needsTap, setNeedsTap] = useState(false)
  // Phones: the compact controls row (Leave included) in video mode too.
  const narrow = useNarrow()
  const [warningHidden, setWarningHidden] = useState(false)
  // A new warning shows even after an earlier one was dismissed.
  useEffect(() => { setWarningHidden(false) }, [mediaWarning])
  const [unlockTick, setUnlockTick] = useState(0)
  const unlockPlayback = () => {
    // Inside the tap: play every remote element now, and let the tiles retry.
    document.querySelectorAll('.remote-tile video, .screen-area video').forEach((v) => v.play().catch(() => {}))
    setNeedsTap(false)
    setUnlockTick((n) => n + 1)
  }
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
  // Questions on the board need the AI assistant to be configured.
  const [assistEnabled, setAssistEnabled] = useState(false)
  useEffect(() => {
    if (!isStaff) return
    api.assistStatus().then(({ enabled }) => setAssistEnabled(enabled)).catch(() => {})
  }, [isStaff])
  isStaffRef.current = isStaff
  const boardsRef = useRef([])

  const socketRef = useRef(null)
  const localStreamRef = useRef(null)
  const screenStreamRef = useRef(null)
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

  // A phone must not dim and lock mid-lesson: hold a screen wake lock while
  // in the call, and take it again when the tab comes back to the front.
  useEffect(() => {
    if (!canJoin || !navigator.wakeLock) return
    let lock = null
    const acquire = async () => {
      try { lock = await navigator.wakeLock.request('screen') } catch { /* not allowed: nothing to do */ }
    }
    const onVisible = () => { if (document.visibilityState === 'visible') acquire() }
    acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      lock?.release().catch(() => {})
    }
  }, [canJoin])

  useEffect(() => {
    if (!canJoin) return
    let disposed = false

    let iceServers = ICE_SERVERS
    const createConnection = (peerId, peerName) => {
      const pc = new RTCPeerConnection({ iceServers })
      const stream = localStreamRef.current
      // While the screen is being shared, a newcomer gets the screen in the
      // camera's place, like everyone else.
      const screen = screenStreamRef.current?.getVideoTracks()[0]
      if (stream) stream.getTracks().forEach((track) => pc.addTrack(track.kind === 'video' && screen ? screen : track, stream))
      // Without a camera or microphone of our own we still need to receive
      // theirs: an offer with no media lines would carry nothing back.
      for (const kind of ['audio', 'video']) {
        if (!stream?.getTracks().some((t) => t.kind === kind)) pc.addTransceiver(kind, { direction: 'recvonly' })
      }

      pc.ontrack = (event) => {
        setPeers((prev) => ({ ...prev, [peerId]: { ...(prev[peerId] ?? { name: peerName }), stream: event.streams[0] } }))
      }
      pc.onicecandidate = (event) => {
        if (event.candidate) socketRef.current.emit('ice-candidate', { to: peerId, candidate: event.candidate })
      }
      // A dropped path (Wi-Fi to mobile data, a router hiccup) gets a fresh
      // ICE round instead of a dead call: a "disconnected" that lasts, or a
      // "failed", sends a restart offer. Both sides may try; glare is handled.
      let restartTimer = null
      const restart = async () => {
        if (connectionsRef.current[peerId] !== pc || pc.signalingState === 'closed') return
        try {
          pc.restartIce?.()
          const offer = await pc.createOffer({ iceRestart: true })
          await pc.setLocalDescription(offer)
          socketRef.current?.emit('offer', { to: peerId, offer })
        } catch (err) { console.error('ICE restart failed:', err) }
      }
      pc.oniceconnectionstatechange = () => {
        clearTimeout(restartTimer)
        if (pc.iceConnectionState === 'failed') restart()
        else if (pc.iceConnectionState === 'disconnected') restartTimer = setTimeout(() => { if (pc.iceConnectionState === 'disconnected') restart() }, 4000)
      }
      connectionsRef.current[peerId] = pc
      return pc
    }

    const start = async () => {
      // TURN relay credentials, when the server has a relay configured.
      try { iceServers = (await api.iceServers()).iceServers } catch { /* STUN only */ }
      setStatus('requesting-media')
      try {
        const audioConstraints = AUDIO_CONSTRAINTS
        let raw
        try {
          raw = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: true })
        } catch (err) {
          // A busy or missing camera must not take the microphone down with it.
          raw = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints })
          setMediaWarning(`Camera is not available (${err?.name === 'NotAllowedError' ? 'not allowed' : err?.message ?? err}) — joining with sound only.`)
          setCameraOn(false)
        }
        if (disposed) { raw.getTracks().forEach((t) => t.stop()); return }
        rawMicRef.current = raw.getAudioTracks()[0] ?? null
        if (rawMicRef.current) {
          const rawTrack = rawMicRef.current
          rawTrack.addEventListener('ended', () => { if (!disposed && rawMicRef.current === rawTrack) reacquireMic() })
        }
        const stream = new MediaStream(raw.getVideoTracks())
        // The own picture (and its blur) starts at once; the audio joins the
        // stream as soon as the denoiser is ready.
        if (localVideoRef.current) localVideoRef.current.srcObject = stream
        // Outgoing audio: the neural denoiser's output when available.
        let audio = rawMicRef.current
        // Phones keep the browser's own noise suppression: the worklet's
        // audio path is unreliable on iOS. Desktop gets the neural denoiser.
        if (audio && !isMobile() && isDenoiserSupported()) {
          try {
            // A stalled download must not hold the call: after a few seconds
            // the plain microphone goes out (the browser's own filter is on it).
            let late = false
            const cleaned = await Promise.race([
              denoiseTrack(audio).then((c) => { if (late) c.stop(); return c }),
              new Promise((_, reject) => setTimeout(() => { late = true; reject(new Error('took too long to load')) }, 10000))
            ])
            if (disposed) { cleaned.stop(); return }
            denoiserRef.current = cleaned
            audio = cleaned.track
            watchDenoiser(cleaned)
          } catch (err) {
            console.error('Noise suppressor unavailable, using the plain microphone:', err)
          }
        }
        if (audio) stream.addTrack(audio)
        localStreamRef.current = stream
      } catch {
        setMediaWarning('Camera and microphone are off — others will not see or hear you.')
        setCameraOn(false)
        setMicOn(false)
        micOnRef.current = false
      }
      if (disposed) return
      setStatus('connecting')

      const socket = io({ withCredentials: true })
      socketRef.current = socket

      socket.on('connect_error', (err) => setError(err.message))

      socket.on('offer', async ({ from, offer }) => {
        const pc = connectionsRef.current[from] ?? createConnection(from, peers[from]?.name ?? 'Participant')
        // Both sides offered at once: the one with the smaller id keeps its
        // offer and ignores the other's; the other drops its own and answers.
        if (pc.signalingState === 'have-local-offer') {
          if (socket.id < from) return
          await pc.setLocalDescription({ type: 'rollback' })
        }
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(offer))
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          socket.emit('answer', { to: from, answer })
        } catch (err) { console.error('Offer rejected:', err) }
      })
      socket.on('answer', async ({ from, answer }) => {
        const pc = connectionsRef.current[from]
        // A late answer to an offer that was rolled back or replaced is ignored.
        if (!pc || pc.signalingState !== 'have-local-offer') return
        try { await pc.setRemoteDescription(new RTCSessionDescription(answer)) } catch (err) { console.error('Answer rejected:', err) }
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
        // The newcomer needs to know whether I am muted or sharing my screen.
        socket.emit('mic:state', { muted: !micOnRef.current })
        if (screenStreamRef.current) socket.emit('screen-share-start')
      })
      socket.on('mic:state', ({ from, muted }) => {
        setPeers((prev) => (prev[from] ? { ...prev, [from]: { ...prev[from], muted } } : prev))
      })
      socket.on('user-left', (peerId) => {
        connectionsRef.current[peerId]?.close()
        delete connectionsRef.current[peerId]
        setPeers((prev) => { const next = { ...prev }; delete next[peerId]; return next })
      })
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
          // Phones start with the video; the board and writing are under More.
          if (response.boardId && !isMobile()) setBoardId(response.boardId)
          if (response.docId && !isMobile()) setWritingId(response.docId)
          for (const peer of response.peers) {
            setPeers((prev) => ({ ...prev, [peer.id]: { name: peer.name, stream: prev[peer.id]?.stream ?? null, muted: Boolean(peer.muted), sharing: Boolean(peer.sharing), userId: peer.userId } }))
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
    let watchdog = null
    const loop = async () => {
      if (cancelled) return
      // No camera at all: nothing to blur, and nothing to complain about.
      if (localStreamRef.current && !localStreamRef.current.getVideoTracks().length) { cancelled = true; setIsBlurEnabled(false); return }
      const video = localVideoRef.current
      if (video && video.readyState >= 2) {
        // The camera shows a picture: from here the model has a few seconds
        // to produce frames, otherwise the blur is switched off with a reason.
        if (!watchdog) {
          watchdog = setTimeout(() => {
            if (!cancelled && frames === 0) {
              fail('start', new Error(`no frames were processed (camera ${video?.videoWidth ?? 0}×${video?.videoHeight ?? 0}, ready ${video?.readyState ?? '?'})`))
            }
          }, 8000)
        }
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
    // The runtime and model are a few megabytes: say so while they load.
    // Until the camera shows a picture there is nothing to blur and nothing
    // to complain about (the join screen, a call without a camera).
    if (!hasWebGL()) {
      fail('start', new Error('WebGL is disabled in this browser; the blur needs it'))
    } else {
      if (!videoProcessor.initialized) setBlurStatus('Loading the blur model…')
      videoProcessor.initialize()
        .then(() => {
          if (cancelled) return
          setBlurStatus('')
          loop()
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

  // The screen goes out in place of the camera on every connection (no
  // renegotiation needed); the camera comes back when sharing stops.
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
  // as the teacher is in; a student joining later starts on it too (the
  // join answer carries it), and from then on each side is on its own.
  const autoOpened = useRef(false)
  useEffect(() => {
    if (status !== 'live' || autoOpened.current) return
    // On a phone the call starts with the video; the board is under More.
    if (isMobile() && !requestedBoard) { autoOpened.current = true; return }
    const wanted = requestedBoard && isStaff
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
    // A student only ever gets their own writing; the call may belong to
    // another student's classroom in a group lesson.
    if (call?.classroomId && (isStaff || boards.some((b) => b.classroomId === call.classroomId))) {
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

  // Board mode: the call controls sit exactly between the board chip and
  // the zoom group, not in the middle of the whole width.
  const controlsRef = useRef(null)
  const boardRef = useRef(null)
  useEffect(() => {
    if (!boardId || writingId) return
    const align = () => {
      const controls = controlsRef.current
      if (window.innerWidth <= 720) { if (controls) { controls.style.left = ''; controls.style.transform = '' } return }
      const chip = document.querySelector('.board-chip')
      const zoom = document.querySelector('.board-corner-right')
      if (!controls) return
      if (!chip || !zoom) { controls.style.left = ''; controls.style.transform = ''; return }
      const a = chip.getBoundingClientRect().right
      const b = zoom.getBoundingClientRect().left
      const host = controls.offsetParent?.getBoundingClientRect() ?? { left: 0 }
      const width = controls.getBoundingClientRect().width
      const left = Math.max(a + 8, Math.min((a + b) / 2 - width / 2, b - width - 8))
      controls.style.left = `${left - host.left}px`
      controls.style.transform = 'none'
    }
    align()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(align) : null
    for (const el of [controlsRef.current, document.querySelector('.board-chip'), document.querySelector('.board-corner-right')]) if (el) observer?.observe(el)
    window.addEventListener('resize', align)
    const timer = setInterval(align, 500)
    return () => { observer?.disconnect(); window.removeEventListener('resize', align); clearInterval(timer); if (controlsRef.current) { controlsRef.current.style.left = ''; controlsRef.current.style.transform = '' } }
  }, [boardId, writingId])

  // Remembered so "Board" goes back to it after Writing, without a picker.
  const lastBoardRef = useRef(null)
  useEffect(() => { if (boardId) lastBoardRef.current = boardId }, [boardId])
  const openBoard = (id) => { setBoardId(id); if (writingId) { setWritingId(null); socketRef.current?.emit('doc:close') } }
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
          <button onClick={() => { if (!isMobile()) primeDenoiser(); setJoined(true) }} autoFocus>Join call</button>
          <Link className="ghost button" to="/classroom">Back</Link>
        </div>
      </div>
    )
  }

  // Leaving returns to the student this call belongs to.
  const leaveTo = call.classroomId ? `/classroom/${call.classroomId}` : '/classroom'

  return (
    <div className={`lesson-page ${boardId || writingId ? 'board-mode' : ''} ${writingId ? 'writing-mode' : ''}`}>
      <header className="topbar">
        <div className="nav-identity row-actions">
          <Link className="ghost back-link" to={leaveTo}>← Back</Link>
          <div>
            <strong>{call.title ?? 'Video call'}</strong>
            <span className="muted"> · {call.host}</span>
          </div>
        </div>
        <div className="row-actions">
          <button className="ghost" onClick={copyLink}>{copied ? 'Link copied' : 'Copy invite link'}</button>
          <Link className="ghost" to={leaveTo}>Leave</Link>
        </div>
      </header>

      {status === 'requesting-media' && (
        <div className="banner">Waiting for camera and microphone access — please allow it in the browser prompt.</div>
      )}
      {status !== 'requesting-media' && mediaWarning && !warningHidden && (
        <div className="banner warning">
          {mediaWarning}
          <button className="banner-close" onClick={() => setWarningHidden(true)} title="Hide">×</button>
        </div>
      )}
      {blurStatus && <div className="banner">{blurStatus}</div>}

      <div className="view-pane">
        <Reactions socketRef={socketRef} ready={status === 'live'} />
        {needsTap && (
          <button className="tap-to-hear" onClick={unlockPlayback}>
            🔊 Tap to hear and see the others
          </button>
        )}
        <VideoGrid
          peers={peers}
          micOn={micOn}
          board={(writingId || boardId) ? (
            <>
              {writingId && (
            <Writing
              socketRef={socketRef}
              classroomId={writingId}
              user={user}
              title="Writing"
              subtitle={writingChoices.find((c) => c.id === writingId)?.label ?? boards.find((b) => b.classroomId === writingId)?.student}
              onClose={closeWriting}
              wordPicker={!isStaff}
              backLabel={boardId ? '← Back to board' : '← Back'}
              embedded
            />
              )}
              {/* The board stays mounted under Writing, so switching back is instant. */}
              {boardId && (
            <div style={{ display: writingId ? 'none' : 'contents' }}>
            <Whiteboard
              ref={boardRef}
              socketRef={socketRef}
              boardId={boardId}
              title={currentBoard?.title ?? 'Board'}
              subtitle={currentBoard?.student ?? currentBoard?.owner ?? undefined}
              onClose={closeBoard}
              backLabel="← Back"
              // Writing is in the call controls; the chip stays lean.
              canSpotlight={isStaff}
              wordPicker={!isStaff}
              focusElementId={searchParams.get('focus')}
              onMistake={isStaff && currentBoard?.studentId ? (body) => api.addMistake(currentBoard.classroomId, { ...body, boardId }) : undefined}
              onMistakeRemoved={isStaff ? (elementId) => api.deleteMistakeByElement(elementId).catch(() => {}) : undefined}
              onAddWords={currentBoard?.classroomId ? (words) => api.addBoardWords(words, currentBoard.classroomId) : undefined}
              assistEnabled={assistEnabled}
              onAssist={isStaff
                ? async (mode, words) => {
                    try {
                      const { items } = await api.assist(mode, words)
                      return items
                    } catch (err) {
                      setError(err.message)
                      return null
                    }
                  }
                : undefined}
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
            </div>
              )}
            </>
          ) : null}
          screenStream={screenStream}
          onPlaybackBlocked={() => setNeedsTap(true)}
          unlockTick={unlockTick}
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
        ref={controlsRef}
        compact={Boolean(boardId || writingId) || narrow}
        onReact={(emoji) => socketRef.current?.emit('reaction', { emoji })}
        onSticker={boardId && !writingId ? (sticker) => boardRef.current?.addSticker(sticker) : undefined}
        onToggleCamera={toggleTrack('video')}
        onToggleMicrophone={toggleTrack('audio')}
        cameraOn={cameraOn}
        micOn={micOn}
        onLeave={boardId || writingId || narrow ? () => navigate(leaveTo) : undefined}
        onCopyLink={copyLink}
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
        preferredBoardId={lastBoardRef.current ?? (call?.classroomId ? boards.find((b) => b.classroomId === call.classroomId)?.id : null)}
        onOpenBoard={openBoard}
        onCloseBoard={closeBoard}
        isBlurEnabled={isBlurEnabled}
        onBlurToggle={() => setIsBlurEnabled((v) => !v)}
        blurAmount={blurAmount}
        onBlurChange={setBlurAmount}
      />
    </div>
  )
}
