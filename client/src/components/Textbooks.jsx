import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import Panel from './Panel'
import { pdfPageCount } from '../utils/pdf'
import { useAuth } from '../AuthContext'
import { uploadInChunks, useUpload } from '../utils/upload'
import { fileSize } from '../utils/format'
import BookAudio from './BookAudio'
import UploadProgress from './UploadProgress'

// The school's textbooks: PDFs and their audio, uploaded and opened here.
export default function Textbooks() {
  const { user } = useAuth()
  const admin = user.role === 'OWNER' || user.role === 'PARTNER'
  const [books, setBooks] = useState(null)
  const [storage, setStorage] = useState(null)
  const { uploading, share, run, cancel } = useUpload()
  const [listening, setListening] = useState(null)
  const [error, setError] = useState('')
  const [renaming, setRenaming] = useState(null)
  const [draft, setDraft] = useState('')
  const fileRef = useRef(null)

  const refresh = () => api.textbooks().then(({ textbooks, storage }) => { setBooks(textbooks); setStorage(storage) }).catch((err) => setError(err.message))
  useEffect(() => { refresh() }, [])

  const upload = async (file) => {
    if (!file) return
    setError('')
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) { setError('Only PDF files can be uploaded'); return }
    if (storage && file.size > storage.maxFileBytes) { setError(`The file is larger than ${fileSize(storage.maxFileBytes)}`); return }
    try {
      const title = file.name.replace(/\.pdf$/i, '')
      const finished = await run(file.name, async (options) => {
        let pages = null
        try { pages = await pdfPageCount(file) } catch { /* the board counts them when the book is opened */ }
        await uploadInChunks(file, { kind: 'pdf', title, pages }, options)
      })
      if (finished) await refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  const remove = async (book) => {
    const tracks = book.audioCount ? ` and its ${book.audioCount === 1 ? 'audio file' : `${book.audioCount} audio files`}` : ''
    if (!window.confirm(`Delete “${book.title}”${tracks}? Pages already placed on boards stay there.`)) return
    try { await api.deleteTextbook(book.id); await refresh() } catch (err) { setError(err.message) }
  }
  const saveTitle = async (id) => {
    try { await api.renameTextbook(id, draft.trim()); setRenaming(null); await refresh() } catch (err) { setError(err.message) }
  }

  const [over, setOver] = useState(false)

  return (
    <Panel id="home:textbooks" title="Textbooks" count={books?.length ?? 0} hint="PDFs and audio for lessons">
      <p className="muted" style={{ marginBottom: 10 }}>
        Upload a PDF and its audio once, then open them here whenever you need them. To show a page or play a recording in a lesson, share that browser tab in the call and keep “Also share tab audio” on.
        {admin ? ' As administrator you see every teacher\'s books and may delete any of them.' : ' Your books are yours alone; the administrator can see and remove them.'}
      </p>
      <div
        className={`dropzone ${over ? 'over' : ''} ${uploading ? 'busy' : ''}`}
        onClick={() => !uploading && fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (!uploading) upload(e.dataTransfer.files?.[0]) }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click() } }}
      >
        {uploading ? <UploadProgress label={uploading} share={share} onCancel={cancel} /> : (
          <>
            <strong>+ Upload a PDF textbook</strong>
            <span className="muted">Click to choose a file on your computer, or drag a PDF here{storage ? ` · up to ${fileSize(storage.maxFileBytes)}` : ''}</span>
          </>
        )}
        <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = '' }} />
      </div>
      {error && <div className="error" style={{ marginBottom: 10 }}>{error}</div>}
      {storage && storage.usedBytes > 0 && <p className="muted">The school uses {fileSize(storage.usedBytes)} of {fileSize(storage.limitBytes)}.</p>}
      {books && books.length === 0 && <p className="muted">No textbooks yet.</p>}
      <div className="list">
        {(books ?? []).map((book) => (
          <div key={book.id}>
            <div className="row">
              {renaming === book.id ? (
                <form className="row-actions" style={{ flex: 1 }} onSubmit={(e) => { e.preventDefault(); saveTitle(book.id) }}>
                  <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={200} required style={{ flex: 1 }} />
                  <button type="submit">Save</button>
                  <button type="button" className="ghost" onClick={() => setRenaming(null)}>Cancel</button>
                </form>
              ) : (
                <>
                  <div>
                    <strong>{book.title}</strong>
                    <div className="muted">
                      {book.pages ? `${book.pages} pages · ` : ''}{fileSize(book.bytes)} · added {new Date(book.createdAt).toLocaleDateString()}
                      {admin && book.uploadedById !== user.id && book.uploadedBy && ` · ${book.uploadedBy}'s`}
                    </div>
                  </div>
                  <div className="row-actions">
                    <a className="ghost button" href={api.textbookFileUrl(book.id)} target="_blank" rel="noreferrer">Open PDF</a>
                    <button className="ghost" aria-expanded={listening === book.id} onClick={() => setListening(listening === book.id ? null : book.id)}>Audio{book.audioCount ? ` (${book.audioCount})` : ''}</button>
                    <button className="ghost" onClick={() => { setDraft(book.title); setRenaming(book.id) }}>Rename</button>
                    <button className="ghost" onClick={() => remove(book)}>Delete</button>
                  </div>
                </>
              )}
            </div>
            {listening === book.id && storage && <BookAudio book={book} maxFileBytes={storage.maxFileBytes} onChange={refresh} />}
          </div>
        ))}
      </div>
    </Panel>
  )
}
