import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { lookupWord } from '../utils/dictionary'
import { speakAmerican } from '../utils/speech'

// Plays a pronunciation clip; the element is reused so repeat clicks are instant.
// Prefers the browser's own American English voice (speakAmerican) — the
// server's clip (Google Translate's classic TTS) turned out to serve one
// fixed voice no matter what, with no way to ask it for US over UK, so it's
// only the fallback for a browser with no en-US voice installed.
// Plays a word's pronunciation without a click on the button (autoplay).
export async function playWord(src) {
  if (!src) return
  const word = (() => { try { return new URL(src, window.location.origin).searchParams.get('word') } catch { return null } })()
  if (word && await speakAmerican(word, () => {})) return
  new Audio(src).play().catch(() => {})
}

export function PlayButton({ src, small = false }) {
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  if (!src) return null
  const word = (() => { try { return new URL(src, window.location.origin).searchParams.get('word') } catch { return null } })()
  const play = async (event) => {
    event.stopPropagation()
    event.preventDefault()
    setPlaying(true)
    if (word && await speakAmerican(word, () => setPlaying(false))) return
    if (!audioRef.current) {
      audioRef.current = new Audio(src)
      audioRef.current.onended = () => setPlaying(false)
      audioRef.current.onerror = () => setPlaying(false)
    }
    audioRef.current.currentTime = 0
    audioRef.current.play().catch(() => setPlaying(false))
  }
  return (
    <button type="button" className={`play-word ${small ? 'small' : ''} ${playing ? 'on' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={play} title="Listen">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z" /></svg>
    </button>
  )
}

// The card shown when a student double-clicks a word: pronunciation,
// transcription, the senses, and one button to keep it in "My words".
export default function WordCard({ word, x, y, onClose }) {
  const [entry, setEntry] = useState(null)
  const [failed, setFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    setEntry(null); setFailed(false); setSaved(false); setError('')
    lookupWord(word).then((found) => {
      if (!live) return
      if (found) { setEntry(found); setSaved(Boolean(found.saved)) } else setFailed(true)
    })
    return () => { live = false }
  }, [word])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    const onDown = (e) => { if (!e.target.closest?.('.word-card')) onClose() }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown) }
  }, [onClose])

  const add = async () => {
    setSaving(true)
    setError('')
    try {
      await api.addMyWord(word)
      setSaved(true)
      // The hover cache still says "not saved"; refresh it.
      const fresh = await api.dictionary(word).catch(() => null)
      if (fresh) setEntry(fresh)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="word-card" style={{ left: x, top: y }} onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <div className="word-card-head">
        <strong>{word}</strong>
        {entry?.transcription && <span className="muted">{entry.transcription}</span>}
        <PlayButton src={entry?.audio} />
        <button type="button" className="word-card-close" onClick={onClose} title="Close">×</button>
      </div>
      {!entry && !failed && <div className="muted">Looking up…</div>}
      {failed && <div className="muted">No entry for this word.</div>}
      {entry?.suggestion && (
        <div className="muted">Such a word doesn't exist. Did you mean <strong>{entry.suggestion}</strong>?</div>
      )}
      {entry && !entry.suggestion && (
        entry.senses?.length
          ? <ul className="word-senses">
              {entry.senses.map((s) => (
                <li key={s.pos}><em>{s.pos}</em> {s.translations.join(', ')}</li>
              ))}
            </ul>
          : <div>{entry.translation}</div>
      )}
      {error && <div className="error">{error}</div>}
      {entry && !entry.suggestion && (
        <button type="button" className={saved ? 'ghost word-card-add' : 'word-card-add'} onClick={add} disabled={saving || saved}>
          {saved ? '✓ In my words' : saving ? 'Adding…' : '+ Add to my words'}
        </button>
      )}
    </div>
  )
}
