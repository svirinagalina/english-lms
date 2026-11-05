import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { uploadInChunks, useUpload } from '../utils/upload'
import { fileSize } from '../utils/format'
import UploadProgress from './UploadProgress'

const AUDIO_NAME = /\.(mp3|m4a|wav|ogg|oga|aac|flac)$/i
const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

// The audio of one textbook: listen, add, delete.
export default function BookAudio({ book, maxFileBytes, onChange }) {
  const [tracks, setTracks] = useState(null)
  const [error, setError] = useState('')
  const [over, setOver] = useState(false)
  const fileRef = useRef(null)
  const listRef = useRef(null)
  const { uploading, share, run, cancel } = useUpload()

  const refresh = () => api.textbookAudio(book.id).then(({ audio }) => setTracks(audio)).catch((err) => setError(err.message))
  useEffect(() => { setTracks(null); refresh() }, [book.id])

  const add = async (list) => {
    setError('')
    const files = [...(list ?? [])].sort((a, b) => byName.compare(a.name, b.name))
    if (!files.length) return
    if (files.some((f) => f.name.toLowerCase().endsWith('.zip'))) { setError('Unpack the ZIP first, then choose the audio files inside it'); return }
    const wrong = files.find((f) => !f.type.startsWith('audio/') && !AUDIO_NAME.test(f.name))
    if (wrong) { setError(`“${wrong.name}” is not an audio file`); return }
    const large = files.find((f) => f.size > maxFileBytes)
    if (large) { setError(`“${large.name}” is larger than ${fileSize(maxFileBytes)}`); return }
    try {
      for (const [i, file] of files.entries()) {
        const label = files.length > 1 ? `${i + 1} of ${files.length}: ${file.name}` : file.name
        const title = file.name.replace(/\.[^.]+$/, '')
        const finished = await run(label, (options) => uploadInChunks(file, { kind: 'audio', textbookId: book.id, title }, options))
        if (!finished) break
        await refresh()
      }
    } catch (err) {
      setError(err.message)
    }
    onChange?.()
  }

  const remove = async (track) => {
    if (!window.confirm(`Delete “${track.title}”?`)) return
    try { await api.deleteTextbookAudio(book.id, track.id); await refresh(); onChange?.() } catch (err) { setError(err.message) }
  }

  // One recording at a time.
  const playOnlyThis = (event) => {
    for (const player of listRef.current?.querySelectorAll('audio') ?? []) if (player !== event.target) player.pause()
  }

  return (
    <div className="book-audio">
      {tracks && tracks.length > 0 && (
        <div className="book-tracks" ref={listRef}>
          {tracks.map((track) => (
            <div key={track.id} className="book-track">
              <div className="book-track-head">
                <strong>{track.title}</strong>
                <span className="muted">{fileSize(track.bytes)}</span>
                <button type="button" className="ghost" onClick={() => remove(track)}>Delete</button>
              </div>
              <audio controls preload="none" src={api.textbookAudioFileUrl(book.id, track.id)} onPlay={playOnlyThis} />
            </div>
          ))}
        </div>
      )}
      {error && <div className="error">{error}</div>}
      <div
        className={`dropzone small ${over ? 'over' : ''} ${uploading ? 'busy' : ''}`}
        onClick={() => !uploading && fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (!uploading) add(e.dataTransfer.files) }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click() } }}
      >
        {uploading ? <UploadProgress label={uploading} share={share} onCancel={cancel} /> : (
          <>
            <strong>+ Add audio</strong>
            <span className="muted">Choose several files at once, or drag them here · MP3, M4A, WAV, OGG, AAC, FLAC</span>
          </>
        )}
        <input ref={fileRef} type="file" multiple accept="audio/*,.mp3,.m4a,.wav,.ogg,.aac,.flac" hidden onChange={(e) => { add(e.target.files); e.target.value = '' }} />
      </div>
    </div>
  )
}
