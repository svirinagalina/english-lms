import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import Panel from './Panel'
import { fileSize } from '../utils/format'

// The Google Drive folder «English LMS»: whatever PDFs and audio the teacher
// puts there (from the phone, the computer, any subfolder) open and play here.
// The board's «Textbook» picker offers the same PDFs.
export default function DriveFiles() {
  const [available, setAvailable] = useState(null)
  // Asked once, so the panel is not shown to a school without the Drive.
  useEffect(() => { api.drive().then((r) => setAvailable(r.available)).catch(() => setAvailable(false)) }, [])
  if (!available) return null
  return (
    <Panel id="home:drive" title="Google Drive" hint="PDFs and audio from the folder «English LMS»">
      <DriveBrowser />
    </Panel>
  )
}

function DriveBrowser() {
  const [folder, setFolder] = useState('')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [playing, setPlaying] = useState(null)
  const listRef = useRef(null)

  const load = (id) => {
    setError('')
    setData(null)
    api.drive(id).then(setData).catch((err) => setError(err.message))
  }
  useEffect(() => { load(folder); setQ(''); setPlaying(null) }, [folder])

  // One recording at a time.
  const playOnlyThis = (event) => {
    for (const player of listRef.current?.querySelectorAll('audio') ?? []) if (player !== event.target) player.pause()
  }

  if (data?.needsAccess) {
    return <p className="muted">The platform can see only its own copies in Drive so far. Galina needs to sign in to Google once more to let it read the files you add to the folder.</p>
  }

  const needle = q.trim().toLowerCase()
  const items = (data?.items ?? []).filter((i) => !needle || i.name.toLowerCase().includes(needle))

  return (
    <div className="drive-files" ref={listRef}>
      <p className="muted" style={{ marginBottom: 10 }}>
        Put PDFs and audio into the folder <strong>English LMS</strong> in Google Drive (subfolders are fine) and they appear here. In a lesson, open a PDF on the board with «Textbook», or share this tab with its sound to play a recording.
      </p>
      <div className="drive-bar">
        <nav className="drive-path" aria-label="Folder">
          <button type="button" className="link-button" onClick={() => setFolder('')} disabled={!folder}>English LMS</button>
          {(data?.path ?? []).map((p, i, all) => (
            <span key={p.id}>
              {' / '}
              <button type="button" className="link-button" onClick={() => setFolder(p.id)} disabled={i === all.length - 1}>{p.name}</button>
            </span>
          ))}
        </nav>
        <input type="search" placeholder="Find in this folder" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className="ghost" onClick={() => load(folder)} title="Show what was added in Drive just now">Refresh</button>
      </div>
      {error && <div className="error">{error}</div>}
      {!data && !error && <p className="muted">Loading…</p>}
      {data && items.length === 0 && <p className="muted">{needle ? 'Nothing matches.' : 'This folder has no PDFs or audio yet.'}</p>}
      <div className="list">
        {items.map((item) => (
          <div key={item.id}>
            <div className="row">
              <div>
                <span className="drive-icon" aria-hidden="true">{item.kind === 'folder' ? '📁' : item.kind === 'pdf' ? '📄' : '🎧'}</span>
                {item.kind === 'folder'
                  ? <button type="button" className="link-button" onClick={() => setFolder(item.id)}><strong>{item.name}</strong></button>
                  : <strong>{item.name}</strong>}
                {item.kind !== 'folder' && <div className="muted">{item.size ? `${fileSize(item.size)} · ` : ''}{item.modifiedTime ? `changed ${new Date(item.modifiedTime).toLocaleDateString()}` : ''}</div>}
              </div>
              <div className="row-actions">
                {item.kind === 'folder' && <button type="button" className="ghost" onClick={() => setFolder(item.id)}>Open</button>}
                {item.kind === 'pdf' && <a className="ghost button" href={api.driveFileUrl(item.id)} target="_blank" rel="noreferrer">Open PDF</a>}
                {item.kind === 'audio' && <button type="button" className="ghost" aria-expanded={playing === item.id} onClick={() => setPlaying(playing === item.id ? null : item.id)}>{playing === item.id ? 'Hide player' : 'Play'}</button>}
              </div>
            </div>
            {playing === item.id && <audio className="drive-audio" controls autoPlay preload="metadata" src={api.driveFileUrl(item.id)} onPlay={playOnlyThis} />}
          </div>
        ))}
      </div>
    </div>
  )
}
