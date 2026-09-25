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
import { denoiseTrack, primeDenoiser, preloadDenoiser, isDenoiserSupported } from '../utils/noiseSuppressor'
import { isMobile, isHandheld, useNarrow } from '../utils/device'
import { BACKGROUNDS } from '../backgrounds'

// Older Safari cannot blur inside a canvas; there the layer is blurred by CSS.
const SAFARI = typeof navigator !== 'undefined' && /Safari/i.test(navigator.userAgent) && !/Chrome|Chromium|CriOS|Edg/i.test(navigator.userAgent)
const CANVAS_FILTER = typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype && !SAFARI

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
// The blur pipeline: frames per second the mask is computed at, and the
// width the outgoing picture is composed at.
// Phones get a lighter tick: the model is the same, the battery is not.
const BLUR_FPS = isHandheld() ? 12 : 15
const OUT_WIDTH = 640
// A line in the server log about what this device did: enough to read a
// failure without asking the person for screenshots.
const deviceLine = () => `${navigator.userAgent.slice(0, 160)} · ${screen.width}x${screen.height} · cores ${navigator.hardwareConcurrency ?? '?'}`
const report = (call, kind, message, details, thumb) => api.diag({ kind, message, details, device: deviceLine(), call, thumb })
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
  // A stray trackpad swipe or Backspace can still ask the browser to leave
  // or reload the page (overscroll-behavior on the board stops the common
  // case, but not every path to it) — while live, that always asks first,
  // in the browser's own Leave/Cancel prompt, rather than just dropping
  // whoever it happened to off the call.
  useEffect(() => {
    if (status !== 'live') return
    const onBeforeUnload = (event) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [status])
  const [mediaWarning, setMediaWarning] = useState('')
  const [peers, setPeers] = useState({})
  const [screenStream, setScreenStream] = useState(null)
  // Blur is on from the start; it can be switched off in the call.
  // What stands behind the person: nothing, a blur, or one of the pictures.
  const [background, setBackground] = useState(() => (isHandheld() ? 'none' : 'blur'))
  const isBlurEnabled = background !== 'none'
  const setIsBlurEnabled = (on) => setBackground(on ? 'blur' : 'none')
  // The chosen picture, once loaded; frames read it directly.
  const bgImageRef = useRef(null)
  useEffect(() => {
    const scene = BACKGROUNDS.find((b) => b.id === background)
    bgImageRef.current = null
    if (!scene) return
    let cancelled = false
    const image = new Image()
    image.focusX = scene.focusX ?? 0.5
    image.onload = () => { if (!cancelled) bgImageRef.current = image }
    image.onerror = () => { if (!cancelled) report(token, 'blur.picture-failed', scene.src) }
    image.src = scene.src
    return () => { cancelled = true; bgImageRef.current = null }
  }, [background])
  const [blurAmount, setBlurAmount] = useState(20)
  const [copied, setCopied] = useState(false)
  const [micOn, setMicOn] = useState(true)
  const [cameraOn, setCameraOn] = useState(true)
  const micOnRef = useRef(true)
  const cameraOnRef = useRef(true)
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
    setNoiseState('browser')
    // The browser's own suppression is still on the plain microphone, so
    // nothing changes for the person: no message, only a note in the console.
    console.warn(`Noise removal ${reason}; the plain microphone is sent instead.`)
  }
  const watchDenoiser = (cleaned) => {
    let silent = 0
    let lastEnergy = null
    let ticks = 0
    const timer = setInterval(async () => {
      if (denoiserRef.current !== cleaned) { clearInterval(timer); return }
      const { raw, clean, out, state } = cleaned.levels()
      ticks += 1
      if (ticks === 20 || ticks % 30 === 0) {
        const senders = Object.values(connectionsRef.current).map((pc) => pc.getSenders().find((sd) => sd.track?.kind === 'audio')?.track)
        // Independent of our meters: the level the browser itself reports for
        // the audio it encodes and sends.
        let sent = null
        try {
          const pc = Object.values(connectionsRef.current)[0]
          if (pc) {
            const stats = await pc.getStats()
            stats.forEach((item) => {
              if (item.type === 'media-source' && item.kind === 'audio') sent = { level: item.audioLevel ?? null, energy: item.totalAudioEnergy ?? null, id: item.trackIdentifier?.slice(0, 8) ?? null }
            })
          }
        } catch { /* stats unavailable */ }
        report(token, 'noise.health', cleaned.engine, {
          raw: Number(raw.toFixed(4)), clean: Number(clean.toFixed(5)), out: Number((out ?? 0).toFixed(5)), state,
          peers: senders.length,
          sendingCleaned: senders.length ? senders.every((t) => t === cleaned.track) : null,
          senderLabels: senders.map((t) => t?.label?.slice(0, 18) ?? 'none').join(','),
          streamAudio: localStreamRef.current?.getAudioTracks().map((t) => t.label.slice(0, 18)).join(',') ?? '',
          sentLevel: sent?.level ?? null, sentEnergy: sent?.energy ?? null, sentTrack: sent?.id ?? null, cleanedId: cleaned.track.id.slice(0, 8),
          micOn: micOnRef.current
        })
      }
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
        report(token, 'noise.silent', cleaned.engine, { raw: Number(raw.toFixed(4)), clean: Number(clean.toFixed(6)), state })
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
    denoiserRef.current?.stop()
    denoiserRef.current = null
    rawTrack.enabled = micOnRef.current
    await swapOutgoingAudio(rawTrack)
    startDenoiser(rawTrack, () => false)
  }
  // Builds the denoiser for `rawTrack` in the background and swaps its output
  // in when ready; on every failure the plain microphone simply stays.
  const [noiseState, setNoiseState] = useState('starting') // starting | on | browser
  const startDenoiser = (rawTrack, isDisposed) => {
    if (!isDenoiserSupported()) { setNoiseState('browser'); return }
    setNoiseState('starting')
    const t0 = performance.now()
    denoiseTrack(rawTrack).then(async (cleaned) => {
      if (isDisposed() || rawMicRef.current !== rawTrack) { cleaned.stop(); return }
      denoiserRef.current = cleaned
      await swapOutgoingAudio(cleaned.track)
      watchDenoiser(cleaned)
      setNoiseState('on')
      const settings = rawTrack.getSettings?.() ?? {}
      report(token, 'noise.on', cleaned.engine, { loadMs: Math.round(performance.now() - t0), sampleRate: settings.sampleRate ?? null, browserFilter: settings.noiseSuppression ?? null, echo: settings.echoCancellation ?? null, senders: Object.keys(connectionsRef.current).length })
    }).catch((err) => {
      console.warn('Noise removal unavailable, using the plain microphone:', err)
      setNoiseState('browser')
      report(token, 'noise.failed', String(err?.message ?? err), { loadMs: Math.round(performance.now() - t0) })
    })
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
    document.querySelectorAll('.remote-tile video, .remote-tile audio, .screen-area video').forEach((v) => v.play().catch(() => {}))
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
  // The blurred picture is what the others get: a canvas track replaces
  // the camera on every connection while the blur is on.
  const blurOutRef = useRef(null) // { canvas, track }
  const blurStreamRef = useRef(null)
  const blurStepsRef = useRef(null) // scratch canvases for the step-by-step blur (Safari)
  const frameRef = useRef(null)
  // The camera as it should go out right now: blurred if the blur is on.
  const outgoingCameraTrack = () => blurOutRef.current?.track ?? localStreamRef.current?.getVideoTracks()[0]

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

  // Before joining, the camera and microphone are already taken and shown in
  // the own tile, so the person can check the picture and pick a background.
  // The same stream is used for the call itself.
  const previewRawRef = useRef(null)
  // The request in flight, so a join while the prompt is still open waits
  // for its answer instead of asking a second time.
  const previewPendingRef = useRef(null)
  const joinedRef = useRef(false)
  joinedRef.current = joined
  const [previewState, setPreviewState] = useState('idle') // idle | asking | ready | denied
  const [previewTry, setPreviewTry] = useState(0)
  useEffect(() => {
    if (!user || !call || joined) return
    let disposed = false
    setPreviewState('asking')
    // The denoiser's files start downloading now, so they are in by the time
    // the person joins — they are small, but the link may be slow.
    preloadDenoiser()
    previewPendingRef.current = (async () => {
      let raw = null
      try {
        raw = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS, video: true })
      } catch {
        try { raw = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS }) } catch { /* nothing at all */ }
      }
      if (disposed && !joinedRef.current) { raw?.getTracks().forEach((t) => t.stop()); return }
      previewRawRef.current = raw
      if (!disposed) {
        setPreviewState(raw ? 'ready' : 'denied')
        if (raw && localVideoRef.current) {
          localVideoRef.current.srcObject = new MediaStream(raw.getVideoTracks())
          localVideoRef.current.play().catch(() => {})
        }
      }
    })().finally(() => { previewPendingRef.current = null })
    return () => {
      disposed = true
      // Leaving the page without joining: let the devices go.
      if (!joinedRef.current) { previewRawRef.current?.getTracks().forEach((t) => t.stop()); previewRawRef.current = null }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, Boolean(call), joined, previewTry])

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
      if (stream) stream.getTracks().forEach((track) => pc.addTrack(track.kind === 'video' ? (screen ?? blurOutRef.current?.track ?? track) : track, stream))
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
        if (previewPendingRef.current) await previewPendingRef.current
        if (disposed) return
        let raw = previewRawRef.current
        previewRawRef.current = null
        if (raw && !raw.getTracks().some((t) => t.readyState === 'live')) raw = null
        if (!raw) {
          try {
            raw = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: true })
          } catch (err) {
            // A busy or missing camera must not take the microphone down with it.
            raw = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints })
            setMediaWarning(`Camera is not available (${err?.name === 'NotAllowedError' ? 'not allowed' : err?.message ?? err}) — joining with sound only.`)
            setCameraOn(false)
          }
        } else if (!raw.getVideoTracks().length) {
          setMediaWarning('Camera is not available — joining with sound only.')
          setCameraOn(false)
        }
        if (disposed) { raw.getTracks().forEach((t) => t.stop()); return }
        // What was switched off on the preview stays off in the call.
        raw.getVideoTracks().forEach((t) => { t.enabled = cameraOnRef.current })
        raw.getAudioTracks().forEach((t) => { t.enabled = micOnRef.current })
        rawMicRef.current = raw.getAudioTracks()[0] ?? null
        if (rawMicRef.current) {
          const rawTrack = rawMicRef.current
          rawTrack.addEventListener('ended', () => { if (!disposed && rawMicRef.current === rawTrack) reacquireMic() })
        }
        const stream = new MediaStream(raw.getVideoTracks())
        // The own picture (and its blur) starts at once; the audio joins the
        // stream as soon as the denoiser is ready.
        if (localVideoRef.current) { localVideoRef.current.srcObject = stream; localVideoRef.current.play().catch(() => {}) }
        // Outgoing audio: the plain microphone right away (the browser's own
        // filter is on it), replaced by the neural denoiser's output as soon
        // as that is ready — however long its files take on a slow link.
        const audio = rawMicRef.current
        if (audio) startDenoiser(audio, () => disposed)
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
          // boards was only ever fetched once, at mount — a board assigned
          // or reshared from another tab/session while this one sat through
          // a reconnect (a deploy, a Wi-Fi blip) stayed invisible here,
          // which is how a single-student board ended up looking like
          // ownerless "material" and offering the whole roster instead of
          // just that student.
          api.allBoards().then(({ boards }) => setBoards(boards)).catch(() => {})
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
      blurOutRef.current?.track.stop()
      blurOutRef.current = null
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [canJoin, token])

  // Blur off: the plain camera goes out again and the canvas track is dropped.
  useEffect(() => {
    if (isBlurEnabled) return
    const out = blurOutRef.current
    if (!out) return
    blurOutRef.current = null
    blurStreamRef.current = null
    if (!screenStreamRef.current) swapOutgoingVideo(localStreamRef.current?.getVideoTracks()[0])
    out.track.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBlurEnabled])

  useEffect(() => {
    if (!isBlurEnabled) return
    let cancelled = false
    videoProcessor.onFrame = (results) => {
      const canvas = processingCanvasRef.current
      const background = backgroundCanvasRef.current
      const video = localVideoRef.current
      if (!canvas || !background || !video) return
      // Composed at call resolution, not the camera's: blurring a 720p frame
      // every tick is what made laptops crawl, and the call sends 640 wide.
      const srcW = video.videoWidth || 640, srcH = video.videoHeight || 480
      const width = Math.min(srcW, OUT_WIDTH)
      const height = Math.round(srcH * (width / srcW))
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height }
      if (background.width !== width || background.height !== height) { background.width = width; background.height = height }
      // The camera frame is copied to a plain canvas first: Safari ignores the
      // compositing mode when a <video> is drawn directly, which put the whole
      // sharp frame over the blur on iPhones. A canvas composites correctly.
      const frame = frameRef.current ?? (frameRef.current = document.createElement('canvas'))
      if (frame.width !== width || frame.height !== height) { frame.width = width; frame.height = height }
      frame.getContext('2d').drawImage(results.image, 0, 0, width, height)

      // The blurred frame goes on its own canvas, the person (cut out by the
      // mask) on top. Blurring happens at the video's own resolution, and the
      // frame is drawn a little past the edges so the blur has no transparent
      // rim that would let the sharp video underneath show through.
      const bg = background.getContext('2d')
      const margin = blurAmount * 2
      const picture = bgImageRef.current
      if (picture) {
        // A picture behind the person, cropped to cover the frame.
        const scale = Math.max(width / picture.naturalWidth, height / picture.naturalHeight)
        const sw = width / scale, sh = height / scale
        const focusX = picture.focusX ?? 0.5
        const sx = Math.min(Math.max(0, picture.naturalWidth * focusX - sw / 2), picture.naturalWidth - sw)
        bg.drawImage(picture, sx, (picture.naturalHeight - sh) / 2, sw, sh, 0, 0, width, height)
      } else if (CANVAS_FILTER) {
        bg.save()
        bg.filter = `blur(${blurAmount}px)`
        bg.drawImage(frame, -margin, -margin, width + 2 * margin, height + 2 * margin)
        bg.restore()
      } else {
        // No canvas filter (Safari, so every iPhone): shrink the frame and
        // grow it back. Done in one jump, the stretch showed as big soft
        // squares — "the blur doesn't really work" on phones; halving and
        // doubling a step at a time smooths it into something that reads as
        // a real blur, still cheap (a handful of small drawImage calls).
        const steps = blurStepsRef.current ?? (blurStepsRef.current = [])
        // Matched by eye against Chrome's blur(12px): the old /2 factor left
        // text in the background readable — the blur barely showed on iPhones.
        const factor = Math.max(8, Math.round(blurAmount * 1.35))
        const target = { w: Math.max(8, Math.round(width / factor)), h: Math.max(8, Math.round(height / factor)) }
        const sizes = []
        for (let w = width, h = height; w / 2 >= target.w; w = Math.round(w / 2), h = Math.round(h / 2)) sizes.push({ w: Math.round(w / 2), h: Math.max(1, Math.round(h / 2)) })
        if (!sizes.length) sizes.push(target)
        let source = frame
        sizes.forEach((size, i) => {
          const c = steps[i] ?? (steps[i] = document.createElement('canvas'))
          if (c.width !== size.w || c.height !== size.h) { c.width = size.w; c.height = size.h }
          const x = c.getContext('2d')
          x.imageSmoothingEnabled = true
          x.imageSmoothingQuality = 'high'
          x.clearRect(0, 0, size.w, size.h)
          x.drawImage(source, 0, 0, size.w, size.h)
          source = c
        })
        // Back up through the same sizes, then onto the full frame.
        for (let i = sizes.length - 2; i >= 0; i--) {
          const c = steps[i]
          const x = c.getContext('2d')
          x.drawImage(source, 0, 0, c.width, c.height)
          source = c
        }
        bg.imageSmoothingEnabled = true
        bg.imageSmoothingQuality = 'high'
        bg.drawImage(source, -margin, -margin, width + 2 * margin, height + 2 * margin)
      }

      const ctx = canvas.getContext('2d')
      ctx.save()
      ctx.clearRect(0, 0, width, height)
      ctx.imageSmoothingEnabled = true
      ctx.drawImage(results.segmentationMask, 0, 0, width, height)
      ctx.globalCompositeOperation = 'source-in'
      ctx.drawImage(frame, 0, 0, width, height)
      ctx.restore()

      // The same picture, composed on one canvas, is what goes out.
      let out = blurOutRef.current
      if (!out) {
        const outCanvas = document.createElement('canvas')
        outCanvas.width = width; outCanvas.height = height
        const outStream = outCanvas.captureStream?.(BLUR_FPS)
        const track = outStream?.getVideoTracks()[0]
        if (track) {
          track.enabled = localStreamRef.current?.getVideoTracks()[0]?.enabled ?? true
          out = blurOutRef.current = { canvas: outCanvas, track }
          blurStreamRef.current = outStream
          if (!screenStreamRef.current) swapOutgoingVideo(track)
        }
      }
      if (out) {
        if (out.canvas.width !== width || out.canvas.height !== height) { out.canvas.width = width; out.canvas.height = height }
        const o = out.canvas.getContext('2d')
        o.drawImage(background, 0, 0, width, height)
        o.drawImage(canvas, 0, 0, width, height)
      }
    }
    // A frame that fails stops the blur and says why, instead of leaving the
    // toggle on with nothing happening.
    let frames = 0
    const fail = (stage, err) => {
      console.error(`Blur ${stage}:`, err)
      report(token, 'blur.failed', `${stage}: ${err?.message ?? err}`, { background, webgl: hasWebGL() })
      cancelled = true
      setMediaWarning(`Blur could not ${stage}: ${err?.message ?? String(err)}`)
      setIsBlurEnabled(false)
    }
    let watchdog = null
    let lastTick = 0
    // How fast the blur really runs on this device: reported once, after
    // ~15 s, so "choppy on my phone" can be told from "not blurring at all".
    const perf = { started: 0, total: 0, max: 0, reported: false }
    let lastPlayNudge = 0
    const loop = async () => {
      if (cancelled) return
      // About 15 frames a second is plenty for a mask; the browser's own
      // 60 Hz tick would run the model four times as often for nothing.
      const now = performance.now()
      if (now - lastTick < 1000 / BLUR_FPS) { animationRef.current = requestAnimationFrame(loop); return }
      lastTick = now
      // No camera at all: nothing to blur, and nothing to complain about.
      if (localStreamRef.current && !localStreamRef.current.getVideoTracks().length) { cancelled = true; setIsBlurEnabled(false); return }
      const video = localVideoRef.current
      const liveCamera = localStreamRef.current?.getVideoTracks().some((t) => t.readyState === 'live')
        || video?.srcObject?.getVideoTracks?.().some((t) => t.readyState === 'live')
      // A camera that is live but shows no picture (a phone that paused the
      // element, a tab that came back): nudge it to play, and if it never
      // does, say so rather than sit with the toggle on and nothing happening.
      if (video && liveCamera && !watchdog) {
        watchdog = setTimeout(() => {
          if (!cancelled && frames === 0) {
            fail('start', new Error(`no frames were processed (camera ${video?.videoWidth ?? 0}×${video?.videoHeight ?? 0}, ready ${video?.readyState ?? '?'}, ${video?.paused ? 'paused' : 'playing'})`))
          }
        }, 12000)
      }
      if (video && liveCamera && (video.readyState < 2 || video.paused) && now - lastPlayNudge > 2000) {
        lastPlayNudge = now
        video.play().catch(() => {})
      }
      if (video && video.readyState >= 2 && video.videoWidth) {
        try {
          const t0 = performance.now()
          if (await videoProcessor.send(video)) {
            const spent = performance.now() - t0
            frames += 1
            if (frames === 1) perf.started = t0
            perf.total += spent
            perf.max = Math.max(perf.max, spent)
            if (!perf.reported && t0 - perf.started > 15000) {
              perf.reported = true
              const seconds = (t0 - perf.started) / 1000
              report(token, 'blur.perf', background, { fps: Number((frames / seconds).toFixed(1)), target: BLUR_FPS, avgMs: Math.round(perf.total / frames), maxMs: Math.round(perf.max), delegate: videoProcessor.delegate ?? null, camera: `${video.videoWidth}x${video.videoHeight}`, filter: CANVAS_FILTER })
            }
            if (frames === 1) {
              setMediaWarning((w) => (w.startsWith('Blur') ? '' : w))
              report(token, 'blur.on', background, { camera: `${video.videoWidth}x${video.videoHeight}`, sending: Boolean(blurOutRef.current), delegate: videoProcessor.delegate ?? null })
            }
            if (frames === 45) {
              // Three seconds in: is the mask telling person from room? And a
              // thumbnail of what was composed, so the result can be seen in the log.
              let thumb
              try {
                const out = blurOutRef.current?.canvas
                if (out) {
                  const t = document.createElement('canvas'); t.width = 96; t.height = Math.round(96 * out.height / out.width)
                  t.getContext('2d').drawImage(out, 0, 0, t.width, t.height)
                  thumb = t.toDataURL('image/jpeg', 0.5).split(',')[1]
                }
              } catch { /* no thumbnail */ }
              report(token, 'blur.mask', background, { delegate: videoProcessor.delegate ?? null, maskMean: Number((videoProcessor.lastMaskMean ?? -1).toFixed(3)), sending: Boolean(blurOutRef.current), picture: Boolean(bgImageRef.current), filter: CANVAS_FILTER }, thumb)
            }
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
  }, [isBlurEnabled, blurAmount, background])

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
      // The blurred picture goes dark with the camera, not frozen on a frame.
      const next = !cameraOn
      cameraOnRef.current = next
      if (blurOutRef.current) blurOutRef.current.track.enabled = next
      setCameraOn(next)
    }
  }
  // On the join screen the same switches act on the preview stream.
  const togglePreview = (kind) => {
    const raw = previewRawRef.current
    if (kind === 'audio') {
      const next = !micOnRef.current
      micOnRef.current = next
      raw?.getAudioTracks().forEach((t) => { t.enabled = next })
      setMicOn(next)
    } else {
      const next = !cameraOnRef.current
      cameraOnRef.current = next
      raw?.getVideoTracks().forEach((t) => { t.enabled = next })
      if (blurOutRef.current) blurOutRef.current.track.enabled = next
      setCameraOn(next)
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
    await swapOutgoingVideo(outgoingCameraTrack())
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
  // The same board can now appear once per classroom it belongs to (its
  // owner's shelf, plus any student it's shared into) — prefer the row for
  // this call's own classroom, then any row that names the board's actual
  // student, so lessonClassroomId/boardStudents below don't depend on array
  // order. That matters even outside a call tied to that classroom: opening
  // a specific student's board from the picker during an untied call should
  // still send mistakes/vocabulary to that student, not nowhere.
  // Every row this exact board has because it's shared with a student —
  // its owner's own shelf entry has none — i.e. who it's actually assigned
  // to, not the teacher's whole roster.
  const boardAssignees = boards.filter((b) => b.id === boardId && b.studentId)
  const currentBoard = boardAssignees.find((b) => b.classroomId === call?.classroomId)
    ?? (boardAssignees.length === 1 ? boardAssignees[0] : null)
    ?? boards.find((b) => b.id === boardId)
    ?? null
  // Mistakes and vocabulary go to the student of the lesson: the board's own
  // student when it has exactly one, or — on a teacher's own board used as
  // material for several students at once — the one this call was started for.
  const lessonClassroomId = boardAssignees.length === 1
    ? boardAssignees[0].classroomId
    : (boardAssignees.find((b) => b.classroomId === call?.classroomId)?.classroomId ?? call?.classroomId ?? null)
  // Shared with exactly one student: no choice to make. Shared with several
  // (a pair/group lesson): choose among just those. Shared with none (pure
  // material): still offer the teacher's whole roster, same as always.
  const boardStudents = !isStaff || boardAssignees.length === 1
    ? null
    : (boardAssignees.length > 1
        ? boardAssignees.map((b) => ({ classroomId: b.classroomId, name: b.student }))
        : [...new Map(boards.filter((b) => b.studentId && b.teacherId === user.id).map((b) => [b.classroomId, { classroomId: b.classroomId, name: b.student }])).values()]
      ).sort((a, b) => (a.classroomId === call?.classroomId ? -1 : b.classroomId === call?.classroomId ? 1 : a.name.localeCompare(b.name)))

  // A call started from a student's page opens that student's board as soon
  // as the teacher is in; a student joining later starts on it too (the
  // join answer carries it), and from then on each side is on its own.
  const autoOpened = useRef(false)
  useEffect(() => {
    if (status !== 'live' || autoOpened.current || !call) return
    // On a phone the call starts with the video; the board is under More.
    if (isMobile() && !requestedBoard) { autoOpened.current = true; return }
    if (requestedBoard || call.classroomId || call.boardId) {
      const wanted = requestedBoard && isStaff
        ? boards.find((b) => b.id === requestedBoard)
        // The board the call was started on, else the classroom's own.
        : (call.boardId && boards.find((b) => b.id === call.boardId)) ||
          (call.classroomId ? boards.find((b) => b.classroomId === call.classroomId) : null)
      if (!wanted) return
      autoOpened.current = true
      setBoardId((current) => current ?? wanted.id)
      return
    }
    // A call with no student and no specific board requested: a fresh
    // scratch board, so there is always something to write on — it goes
    // away with the call instead of piling up in My boards.
    if (isStaff) {
      autoOpened.current = true
      api.createScratchBoard(token)
        .then(({ board }) => { setBoards((prev) => [...prev, board]); setBoardId((current) => current ?? board.id) })
        .catch(() => { autoOpened.current = false })
    }
  }, [status, isStaff, call, boards, requestedBoard, token])

  // Classrooms whose writing can be opened here: the students the open
  // board is assigned to, else the call's own, else the one behind the open
  // board, else those of the students present.
  const writingChoices = (() => {
    const seen = new Map()
    const add = (classroomId, label) => { if (classroomId && !seen.has(classroomId)) seen.set(classroomId, label) }
    // A board assigned to Natalia and Alex offers exactly their two
    // writings — not the whole roster, and not just the one student the
    // call happened to be started from.
    if (isStaff && boardAssignees.length) {
      const ordered = [...boardAssignees].sort((a, b) => (a.classroomId === call?.classroomId ? -1 : b.classroomId === call?.classroomId ? 1 : (a.student ?? '').localeCompare(b.student ?? '')))
      for (const b of ordered) add(b.classroomId, b.student ?? 'Student')
      return [...seen].map(([id, label]) => ({ id, label }))
    }
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
    // Nothing contextual (no student here yet): offer my students' writing
    // (everyone's only if I have none — an admin running someone else's call).
    if (!seen.size && isStaff) {
      const mine = boards.filter((b) => b.studentId && b.teacherId === user.id)
      for (const b of (mine.length ? mine : boards.filter((b) => b.studentId))) add(b.classroomId, b.student)
    }
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
    const phone = isHandheld()
    return (
      <div className="auth-page">
        <div className="card join-card">
          <h1>{call.title ?? 'Video call'}</h1>
          <p className="muted">{call.host} · {call.schoolName}</p>
          <div className={`video-tile local preview ${previewState}`}>
            <video ref={localVideoRef} autoPlay muted playsInline />
            <canvas ref={backgroundCanvasRef} className={isBlurEnabled ? 'blur-layer' : 'blur-layer hidden'} />
            <canvas ref={processingCanvasRef} className={isBlurEnabled ? 'blur-layer' : 'blur-layer hidden'} />
            {previewState === 'ready' && !cameraOn && <span className="preview-off">Camera is off</span>}
            {previewState === 'ready' && (
              <div className="preview-switches">
                <button type="button" className={`round ${cameraOn ? 'on' : 'off'}`} onClick={() => togglePreview('video')} title={cameraOn ? 'Turn camera off' : 'Turn camera on'}>Cam</button>
                <button type="button" className={`round ${micOn ? 'on' : 'off'}`} onClick={() => togglePreview('audio')} title={micOn ? 'Mute microphone' : 'Unmute microphone'}>Mic</button>
              </div>
            )}
            {previewState === 'asking' && <span className="preview-note">Allow the camera and microphone in the browser prompt…</span>}
            {previewState === 'denied' && (
              <span className="preview-note">
                Camera and microphone are off — the others will not see or hear you.{' '}
                <button type="button" className="link-button" onClick={() => setPreviewTry((n) => n + 1)}>Try again</button>
              </span>
            )}
            {blurStatus && <span className="preview-note">{blurStatus}</span>}
          </div>
          <>
              <div className="more-label">Background</div>
              <div className="bg-picker">
                <button type="button" className={`bg-thumb plain ${background === 'none' ? 'active' : ''}`} onClick={() => setBackground('none')}>None</button>
                <button type="button" className={`bg-thumb plain ${background === 'blur' ? 'active' : ''}`} onClick={() => setBackground('blur')}>Blur</button>
                {BACKGROUNDS.map((scene) => (
                  <button key={scene.id} type="button" className={`bg-thumb ${background === scene.id ? 'active' : ''}`} style={{ backgroundImage: `url(${scene.src})` }} onClick={() => setBackground(scene.id)} title={scene.label}>
                    <span>{scene.label}</span>
                  </button>
                ))}
              </div>
          </>
          <button onClick={() => { primeDenoiser(); setJoined(true) }} autoFocus>Join call</button>
          <Link className="ghost button" to="/classroom">Back</Link>
          <Link className="muted check-link" to="/audio-check">Check my microphone and noise removal</Link>
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
              onMistake={isStaff && (lessonClassroomId || boardStudents?.length) ? (body, chosen) => api.addMistake(chosen ?? lessonClassroomId, { ...body, boardId }) : undefined}
              onMistakeRemoved={isStaff ? (elementId) => api.deleteMistakeByElement(elementId).catch(() => {}) : undefined}
              onAddWords={lessonClassroomId || boardStudents?.length || currentBoard?.classroomId ? (words, chosen) => api.addBoardWords(words, chosen ?? lessonClassroomId ?? currentBoard.classroomId) : undefined}
              students={boardStudents?.length ? boardStudents : null}
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
          connectionsRef={connectionsRef}
          localVideoRef={localVideoRef}
          screenVideoRef={screenVideoRef}
          drawingCanvasRef={drawingCanvasRef}
          processingCanvasRef={processingCanvasRef}
          backgroundCanvasRef={backgroundCanvasRef}
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
        blurInRow={!isStaff}
        onBlurToggle={() => setBackground((b) => (b === 'none' ? 'blur' : 'none'))}
        background={background}
        onBackgroundChange={setBackground}
        noiseState={noiseState}
        blurAmount={blurAmount}
        onBlurChange={setBlurAmount}
      />
    </div>
  )
}
