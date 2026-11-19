import { useEffect, useMemo, useRef, useState } from 'react'
import BoardIcon from './BoardIcons'

// The audio card's size on the board at 100%: the canvas draws its frame and
// title (so it moves, resizes and prints like anything else), this player
// sits over it, scaled with the board.
export const AUDIO_W = 360
export const AUDIO_H = 112

const clock = (s) => {
  if (!Number.isFinite(s) || s < 0) return '00:00'
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

// A made-up but steady waveform: the same file always gets the same bars.
function barsFor(seed, count = 48) {
  let h = 2166136261
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  const out = []
  for (let i = 0; i < count; i++) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) ^ i
    const r = ((h >>> 0) % 1000) / 1000
    const env = 0.55 + 0.45 * Math.sin((i / count) * Math.PI)
    out.push(Math.max(0.15, Math.min(1, (0.25 + r * 0.75) * env)))
  }
  return out
}

// Everyone plays the recording on their own device: the student presses
// play, pauses, jumps back five seconds to hear it again.
export function AudioPlayer({ element }) {
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [failed, setFailed] = useState(false)
  const bars = useMemo(() => barsFor(element.src ?? element.id), [element.src, element.id])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onTime = () => setTime(audio.currentTime)
    const onMeta = () => setDuration(audio.duration)
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onError = () => { setFailed(true); setPlaying(false) }
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('durationchange', onMeta)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onPause)
    audio.addEventListener('error', onError)
    return () => {
      audio.pause()
      for (const [n, f] of [['timeupdate', onTime], ['loadedmetadata', onMeta], ['durationchange', onMeta], ['play', onPlay], ['pause', onPause], ['ended', onPause], ['error', onError]]) audio.removeEventListener(n, f)
    }
  }, [element.src])

  const toggle = () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) audio.play().catch(() => setPlaying(false))
    else audio.pause()
  }
  const skip = (by) => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = Math.max(0, Math.min(audio.duration || 0, audio.currentTime + by))
    setTime(audio.currentTime)
  }
  const seekAt = (event) => {
    const audio = audioRef.current
    if (!audio || !audio.duration) return
    const rect = event.currentTarget.getBoundingClientRect()
    const share = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
    audio.currentTime = share * audio.duration
    setTime(audio.currentTime)
  }
  const progress = duration ? time / duration : 0
  // Controls take the press themselves: the board must not start a drag.
  const own = { onPointerDown: (e) => e.stopPropagation(), onDoubleClick: (e) => e.stopPropagation(), onWheel: (e) => e.stopPropagation() }

  return (
    <div className="audio-controls">
      <audio ref={audioRef} src={element.src} preload="metadata" />
      <button type="button" className="audio-skip" title="Back 5 seconds" aria-label="Back 5 seconds" onClick={() => skip(-5)} {...own}>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><text x="12" y="15.5" fontSize="8" fontWeight="700" textAnchor="middle" fill="currentColor" stroke="none">5</text></svg>
      </button>
      <button type="button" className="audio-play" title={playing ? 'Pause' : 'Play'} aria-label={playing ? 'Pause' : 'Play'} onClick={toggle} disabled={failed} {...own}>
        {playing
          ? <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
          : <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg>}
      </button>
      <button type="button" className="audio-skip" title="Forward 5 seconds" aria-label="Forward 5 seconds" onClick={() => skip(5)} {...own}>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /><text x="12" y="15.5" fontSize="8" fontWeight="700" textAnchor="middle" fill="currentColor" stroke="none">5</text></svg>
      </button>
      <div
        className="audio-wave"
        role="slider"
        aria-label="Position"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration) || 0}
        aria-valuenow={Math.round(time)}
        onPointerDown={(e) => { e.stopPropagation(); e.currentTarget.setPointerCapture?.(e.pointerId); seekAt(e) }}
        onPointerMove={(e) => { if (e.buttons) seekAt(e) }}
        onWheel={own.onWheel}
      >
        {bars.map((v, i) => (
          <span key={i} className={i / bars.length < progress ? 'played' : ''} style={{ height: `${Math.round(v * 100)}%` }} />
        ))}
      </div>
      <span className="audio-time">{failed ? 'Not available' : `${clock(time)} / ${clock(duration)}`}</span>
    </div>
  )
}

// The teacher's Drive audio, searchable; a click puts the file on the board.
export function DriveAudioPicker({ load, onPick, onClose }) {
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(null)
  useEffect(() => {
    let live = true
    load().then((r) => {
      if (!live) return
      if (r?.needsAccess) setError('The platform has no access to the Google Drive folder yet.')
      setItems(r?.items ?? [])
    }).catch((e) => live && setError(e.message))
    return () => { live = false }
  }, [load])
  const shown = (items ?? []).filter((i) => `${i.folder ?? ''} ${i.name}`.toLowerCase().includes(query.trim().toLowerCase()))
  return (
    <div className="board-popover rail-audio" onPointerDown={(e) => e.stopPropagation()}>
      <div className="popover-head">
        <BoardIcon name="audio" />
        <strong>Audio from Google Drive</strong>
        <button type="button" className="word-card-close" onClick={onClose} title="Close">×</button>
      </div>
      <input autoFocus className="popover-search" placeholder="Search audio files…" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="popover-list">
        {items === null && !error && <div className="muted small-hint">Loading…</div>}
        {error && <div className="error">{error}</div>}
        {items && !shown.length && !error && <div className="muted small-hint">{items.length ? 'Nothing matches' : 'No audio in the «English LMS» Drive folder yet'}</div>}
        {shown.map((item) => (
          <button
            key={item.id}
            type="button"
            className="popover-item"
            disabled={Boolean(busy)}
            onClick={async () => {
              setBusy(item.id)
              setError('')
              try { await onPick(item) ; onClose() } catch (e) { setError(e.message) } finally { setBusy(null) }
            }}
          >
            <span className="popover-item-icon"><BoardIcon name="audio" /></span>
            <span className="popover-item-text">
              <span>{item.name}</span>
              {item.folder && <span className="muted">{item.folder}</span>}
            </span>
            {busy === item.id && <span className="muted">Adding…</span>}
          </button>
        ))}
      </div>
    </div>
  )
}
