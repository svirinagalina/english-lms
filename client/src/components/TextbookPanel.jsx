import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { renderPdfPage } from '../utils/pdf'

// On the board: pick a textbook, see its pages, put one on the board as a
// picture — then draw and write on it with the usual tools.
export default function TextbookPanel({ onInsert, onClose }) {
  const [books, setBooks] = useState(null)
  const [bookId, setBookId] = useState(() => { try { return localStorage.getItem('textbook:last') ?? '' } catch { return '' } })
  const [page, setPage] = useState(1)
  const [thumbs, setThumbs] = useState({}) // pageNumber → dataUrl
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const stripRef = useRef(null)

  useEffect(() => { api.textbooks().then(({ textbooks }) => setBooks(textbooks)).catch((err) => setError(err.message)) }, [])
  const book = books?.find((b) => b.id === bookId) ?? null
  const url = book ? api.textbookFileUrl(book.id) : null
  const total = book?.pages ?? 0

  // Thumbnails around the current page, a few at a time.
  useEffect(() => {
    if (!url || !total) return
    let stopped = false
    const wanted = []
    for (let n = Math.max(1, page - 2); n <= Math.min(total, page + 5); n++) if (!thumbs[n]) wanted.push(n)
    ;(async () => {
      for (const n of wanted) {
        if (stopped) return
        try {
          const data = await renderPdfPage(url, n, 160, 0.7)
          if (!stopped) setThumbs((t) => ({ ...t, [n]: data }))
        } catch (err) { if (!stopped) setError(`Could not read the PDF: ${err.message}`); return }
      }
    })()
    return () => { stopped = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, page, total])

  useEffect(() => { setThumbs({}); setPage(1); setError('') ; try { if (bookId) localStorage.setItem('textbook:last', bookId) } catch { /* private */ } }, [bookId])

  const insert = async (n) => {
    if (!url || busy) return
    setBusy(true); setError('')
    try {
      const data = await renderPdfPage(url, n, 1400, 0.85)
      await onInsert(data, { book: book.title, page: n })
      setPage(Math.min(total, n + 1))
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <div className="mistakes-panel textbook-panel" onPointerDown={(e) => e.stopPropagation()}>
      <div className="mistakes-head">
        <strong>Textbook</strong>
        <button type="button" className="word-card-close" onClick={onClose} title="Close">×</button>
      </div>
      {books && books.length === 0 && <p className="muted">No textbooks yet — upload a PDF in the Textbooks section of your cabinet.</p>}
      {books && books.length > 0 && (
        <select className="tool" value={bookId} onChange={(e) => setBookId(e.target.value)}>
          <option value="">Choose a textbook…</option>
          {books.map((b) => <option key={b.id} value={b.id}>{b.title}{b.pages ? ` · ${b.pages} p.` : ''}</option>)}
        </select>
      )}
      {error && <div className="error">{error}</div>}
      {book && (
        <>
          <div className="textbook-nav">
            <button type="button" className="tool" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>‹</button>
            <label className="textbook-page">
              page <input type="number" min={1} max={total || 999} value={page} onChange={(e) => setPage(Math.max(1, Math.min(total || 999, Number(e.target.value) || 1)))} /> {total ? `of ${total}` : ''}
            </label>
            <button type="button" className="tool" onClick={() => setPage((p) => Math.min(total || p + 1, p + 1))} disabled={total ? page >= total : false}>›</button>
            <button type="button" className="tool active" onClick={() => insert(page)} disabled={busy}>{busy ? 'Adding…' : 'Put on the board'}</button>
          </div>
          <div className="textbook-strip" ref={stripRef}>
            {Array.from({ length: Math.min(total, 8) }, (_, i) => Math.max(1, page - 2) + i).filter((n) => n <= total).map((n) => (
              <button key={n} type="button" className={`textbook-thumb ${n === page ? 'current' : ''}`} onClick={() => setPage(n)} onDoubleClick={() => insert(n)} title={`Page ${n} — double-click to put on the board`}>
                {thumbs[n] ? <img src={thumbs[n]} alt="" /> : <span className="muted">{n}</span>}
                <span className="textbook-thumb-n">{n}</span>
              </button>
            ))}
          </div>
          <p className="muted small-hint">The page lands where you are looking; draw and write on it with the usual tools. Double-click a thumbnail to add that page.</p>
        </>
      )}
    </div>
  )
}
