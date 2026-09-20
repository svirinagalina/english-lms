import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import Panel from './Panel'
import { pdfPageCount } from '../utils/pdf'

const size = (bytes) => (bytes > 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.round(bytes / 1e3)} KB`)

// The school's textbooks: PDFs uploaded here, opened on any board during a
// lesson through the Textbook tool.
export default function Textbooks() {
  const [books, setBooks] = useState(null)
  const [uploading, setUploading] = useState('')
  const [error, setError] = useState('')
  const [renaming, setRenaming] = useState(null)
  const [draft, setDraft] = useState('')
  const fileRef = useRef(null)

  const refresh = () => api.textbooks().then(({ textbooks }) => setBooks(textbooks)).catch((err) => setError(err.message))
  useEffect(() => { refresh() }, [])

  const upload = async (file) => {
    if (!file) return
    setError('')
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) { setError('Only PDF files can be uploaded'); return }
    if (file.size > 80 * 1024 * 1024) { setError('The file is larger than 80 MB'); return }
    setUploading(file.name)
    try {
      let pages = null
      try { pages = await pdfPageCount(await file.arrayBuffer()) } catch { /* the count is a nicety */ }
      await api.uploadTextbook(file, file.name.replace(/\.pdf$/i, ''), pages)
      await refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading('')
    }
  }

  const remove = async (book) => {
    if (!window.confirm(`Delete “${book.title}”? Pages already placed on boards stay there.`)) return
    try { await api.deleteTextbook(book.id); await refresh() } catch (err) { setError(err.message) }
  }
  const saveTitle = async (id) => {
    try { await api.renameTextbook(id, draft.trim()); setRenaming(null); await refresh() } catch (err) { setError(err.message) }
  }

  const [over, setOver] = useState(false)

  return (
    <Panel id="home:textbooks" title="Textbooks" count={books?.length ?? 0} defaultOpen={!books || books.length === 0} hint="PDFs for lessons">
      <p className="muted" style={{ marginBottom: 10 }}>
        Upload a PDF once; in a lesson, the <strong>Textbook</strong> button on the board puts any page on the board, where you draw and write on it and the student sees it live. Files are visible only to signed-in people of the school.
      </p>
      <div
        className={`dropzone ${over ? 'over' : ''} ${uploading ? 'busy' : ''}`}
        onClick={() => !uploading && fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files?.[0]) }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click() } }}
      >
        <strong>{uploading ? `Uploading ${uploading}…` : '+ Upload a PDF textbook'}</strong>
        <span className="muted">{uploading ? 'A large book can take a minute.' : 'Click to choose a file on your computer, or drag a PDF here · up to 80 MB'}</span>
        <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = '' }} />
      </div>
      {error && <div className="error" style={{ marginBottom: 10 }}>{error}</div>}
      {books && books.length === 0 && <p className="muted">No textbooks yet.</p>}
      <div className="list">
        {(books ?? []).map((book) => (
          <div key={book.id} className="row">
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
                  <div className="muted">{book.pages ? `${book.pages} pages · ` : ''}{size(book.bytes)} · added {new Date(book.createdAt).toLocaleDateString()}</div>
                </div>
                <div className="row-actions">
                  <a className="ghost button" href={api.textbookFileUrl(book.id)} target="_blank" rel="noreferrer">Open PDF</a>
                  <button className="ghost" onClick={() => { setDraft(book.title); setRenaming(book.id) }}>Rename</button>
                  <button className="ghost" onClick={() => remove(book)}>Delete</button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </Panel>
  )
}
