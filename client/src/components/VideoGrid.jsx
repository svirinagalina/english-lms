import { useEffect, useRef, useState } from 'react'
import { denoiseTrack } from '../utils/noiseSuppressor'
import { api } from '../api'
import { isLowPower } from '../utils/device'

// A phone doesn't clean what it hears: the sender's side already did (or
// its own denoiser runs on the phone's microphone), and a second neural
// denoiser on a phone's CPU made both sounds crackle.
const RECEIVER_CAN_CLEAN = !isLowPower()

// A crossed-out microphone, shown on a tile whose owner is muted.
function MutedIcon() {
  return (
    <span className="tile-muted" title="Microphone is off">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 .4 1.5" />
        <path d="M15 9.3V6a3 3 0 0 0-5.5-1.7" />
        <path d="M19 11a7 7 0 0 1-9.8 6.4M5 11a7 7 0 0 0 1.2 3.9" />
        <path d="M12 18v3M8 21h8" />
        <path d="M3 3l18 18" />
      </svg>
    </span>
  )
}

function PeerVideo({ stream, name, muted, denoised, onBlocked, unlockTick, getPeerConnection }) {
  const ref = useRef(null)
  const audioRef = useRef(null)
  // The other side's sound is cleaned here as well, before it is played:
  // whatever their microphone path did, the room noise stops at this end.
  const cleanedRef = useRef(null)

  // Attach after mount, not during render: a peer whose stream is already
  // known when its tile first appears would otherwise never get it. A phone
  // may refuse to play sound without a tap: the page then asks for one.
  useEffect(() => {
    const video = ref.current
    if (!video) return
    if (video.srcObject !== stream) video.srcObject = stream
    if (stream) video.play().catch((err) => { if (err?.name === 'NotAllowedError') onBlocked?.() })
    audioRef.current?.play().catch((err) => { if (err?.name === 'NotAllowedError') onBlocked?.() })
  }, [stream, unlockTick])

  // Cleaned here only when the sender's own denoiser isn't running (it
  // failed, or an old page that doesn't say): cleaning twice ate syllables.
  const cleanHere = RECEIVER_CAN_CLEAN && denoised !== true
  useEffect(() => {
    if (!stream || !cleanHere) return
    let gone = false
    let watchdog = null
    const teardown = () => {
      clearInterval(watchdog)
      cleanedRef.current?.stop(); cleanedRef.current = null
      if (audioRef.current) audioRef.current.srcObject = null
      if (ref.current) ref.current.muted = false
    }
    const attach = async () => {
      const track = stream.getAudioTracks()[0]
      if (!track || cleanedRef.current) return
      try {
        const cleaned = await denoiseTrack(track, { boost: false })
        if (gone || stream.getAudioTracks()[0] !== track) { cleaned.stop(); return }
        cleanedRef.current = cleaned
        const audio = audioRef.current
        const video = ref.current
        if (!audio || !video) { cleaned.stop(); cleanedRef.current = null; return }
        audio.srcObject = new MediaStream([cleaned.track])
        video.muted = true
        audio.play().catch((err) => { if (err?.name === 'NotAllowedError') onBlocked?.() })
        api.diag({ kind: 'receive.on', message: cleaned.engine, details: { peer: name ?? '' } })
        // Output gone quiet while the other side is audible: back to the plain sound.
        let silent = 0
        let ticks = 0
        watchdog = setInterval(() => {
          const { raw, clean, state } = cleaned.levels()
          ticks += 1
          // What actually arrives from this peer, and whether only the cleaned copy is audible.
          if (ticks === 15 || ticks % 30 === 0) {
            // The browser's own figure for what arrives on this track (inbound-rtp),
            // independent of the audio engine's meter.
            ;(async () => {
              let inbound = null
              try {
                const pc = getPeerConnection?.()
                if (pc) {
                  const stats = await pc.getStats()
                  stats.forEach((item) => { if (item.type === 'inbound-rtp' && item.kind === 'audio') inbound = { level: item.audioLevel ?? null, energy: item.totalAudioEnergy ?? null, packets: item.packetsReceived ?? null } })
                }
              } catch { /* stats unavailable */ }
              api.diag({ kind: 'receive.health', message: cleaned.engine, details: { peer: name ?? '', incoming: Number(raw.toFixed(4)), cleaned: Number(clean.toFixed(5)), state, videoMuted: Boolean(video.muted), audioPaused: Boolean(audio.paused), audioVolume: audio.volume, inLevel: inbound?.level ?? null, inEnergy: inbound?.energy ?? null, inPackets: inbound?.packets ?? null } })
            })()
          }
          if (state !== 'running') cleaned.resume()
          silent = raw > 0.003 && clean < 1e-6 ? silent + 1 : 0
          if (silent >= 3) {
            api.diag({ kind: 'receive.silent', message: cleaned.engine, details: { raw: Number(raw.toFixed(4)), clean: Number(clean.toFixed(6)), state } })
            teardown()
          }
        }, 1000)
      } catch (err) {
        api.diag({ kind: 'receive.failed', message: String(err?.message ?? err) })
      }
    }
    attach()
    // The audio track often arrives after the video one, on the same stream.
    const onAdd = () => attach()
    stream.addEventListener('addtrack', onAdd)
    return () => {
      gone = true
      stream.removeEventListener('addtrack', onAdd)
      teardown()
    }
  }, [stream, cleanHere])

  // No picture arriving (their camera is off or broken): a plain tile with
  // their initial instead of an empty or green frame.
  const [hasPicture, setHasPicture] = useState(true)
  useEffect(() => {
    if (!stream) return undefined
    const tracks = new Set()
    const check = () => setHasPicture(stream.getVideoTracks().some((t) => t.readyState === 'live' && !t.muted && t.enabled))
    const watch = () => stream.getVideoTracks().forEach((t) => {
      if (tracks.has(t)) return
      tracks.add(t)
      for (const type of ['mute', 'unmute', 'ended']) t.addEventListener(type, check)
    })
    const onAdd = () => { watch(); check() }
    stream.addEventListener('addtrack', onAdd)
    stream.addEventListener('removetrack', onAdd)
    watch(); check()
    const timer = setInterval(check, 2000)
    return () => {
      clearInterval(timer)
      stream.removeEventListener('addtrack', onAdd)
      stream.removeEventListener('removetrack', onAdd)
      tracks.forEach((t) => { for (const type of ['mute', 'unmute', 'ended']) t.removeEventListener(type, check) })
    }
  }, [stream])

  return (
    <div className="video-tile remote-tile">
      <video ref={ref} autoPlay playsInline style={hasPicture ? undefined : { visibility: 'hidden' }} />
      {!hasPicture && <div className="tile-nopicture"><span>{(name ?? '?').trim().charAt(0).toUpperCase()}</span><small>Camera is off</small></div>}
      <audio ref={audioRef} autoPlay />
      <span className="tile-label">{name ?? 'Participant'}</span>
      {muted && <MutedIcon />}
    </div>
  )
}

// Someone else's shared screen, large.
function RemoteScreen({ stream, name, unlockTick }) {
  const ref = useRef(null)
  useEffect(() => {
    const video = ref.current
    if (!video) return
    if (video.srcObject !== stream) video.srcObject = stream
    if (stream) video.play().catch(() => {})
  }, [stream, unlockTick])
  return (
    <>
      <video ref={ref} autoPlay playsInline />
      <span className="tile-label">{name} is sharing their screen</span>
    </>
  )
}

export default function VideoGrid({
  peers,
  micOn = true,
  board,
  screenStream,
  localVideoRef,
  screenVideoRef,
  drawingCanvasRef,
  processingCanvasRef,
  backgroundCanvasRef,
  isBlurEnabled,
  socketRef,
  onPlaybackBlocked,
  unlockTick = 0,
  connectionsRef,
  sfuRef
}) {
  const sharingPeer = Object.values(peers).find((p) => p.sharing && p.stream) ?? null
  const drawing = useRef(false)
  const lastPoint = useRef(null)
  // On a phone, the camera tiles float over the board and cost real space —
  // let people tuck them away while they're working on the board itself.
  const [videoHidden, setVideoHidden] = useState(false)
  const boardMode = board && !sharingPeer && !screenStream

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

  // The preview <video> only exists once sharing has started, so the stream
  // is attached here, after it renders — set before, it went nowhere and the
  // sharer saw a black box (and could not draw on it).
  useEffect(() => {
    const video = screenVideoRef.current
    if (!video || !screenStream) return
    if (video.srcObject !== screenStream) video.srcObject = screenStream
    video.play().catch(() => {})
  }, [screenStream, screenVideoRef])

  const handleScreenLoaded = () => {
    const video = screenVideoRef.current
    const canvas = drawingCanvasRef.current
    if (video && canvas) {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
    }
  }

  return (
    <div className={`stage ${boardMode ? 'board-mode' : (screenStream || sharingPeer) ? 'with-screen' : ''}`}>
      {boardMode && <div className="board-area">{board}</div>}
      {sharingPeer && !screenStream && (
        <div className="screen-area">
          <RemoteScreen stream={sharingPeer.stream} name={sharingPeer.name} unlockTick={unlockTick} />
        </div>
      )}
      {screenStream && (
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

      {boardMode && (
        <button
          type="button"
          className="tiles-toggle"
          onClick={() => setVideoHidden((v) => !v)}
          title={videoHidden ? 'Show cameras' : 'Hide cameras'}
        >
          {/* A camera, and a camera tucked away — not a red "forbidden" sign,
              which read as an error on a phone. */}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 10l5-3v10l-5-3" /><rect x="3" y="6" width="12" height="12" rx="2" />
            {!videoHidden && <path d="M2 2l20 20" />}
          </svg>
        </button>
      )}

      {/* Hidden with CSS, not unmounted: the local video and the blur canvases
          are attached by ref from Call.jsx once, outside React's own render
          cycle, and wouldn't reattach themselves if these nodes went away. */}
      <div className={`tiles ${Object.keys(peers).length ? 'has-peers' : ''} ${boardMode && videoHidden ? 'tiles-tucked' : ''}`}>
        <div className="video-tile local">
          <video ref={localVideoRef} autoPlay muted playsInline />
          <canvas
            ref={backgroundCanvasRef}
            className={isBlurEnabled ? 'blur-layer' : 'blur-layer hidden'}
          />
          <canvas
            ref={processingCanvasRef}
            className={isBlurEnabled ? 'blur-layer' : 'blur-layer hidden'}
          />
          <span className="tile-label">You</span>
          {!micOn && <MutedIcon />}
        </div>

        {Object.entries(peers).map(([peerId, peer]) => (
          <PeerVideo key={peerId} stream={peer.stream} name={peer.name} muted={peer.muted} denoised={peer.denoised} onBlocked={onPlaybackBlocked} unlockTick={unlockTick} getPeerConnection={() => connectionsRef?.current?.[peerId] ?? (sfuRef?.current ? { getStats: async () => (await sfuRef.current.remoteReport(peerId)) ?? new Map() } : undefined)} />
        ))}
      </div>
    </div>
  )
}
