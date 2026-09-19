import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'

// Drilling the mistake notebook: the sentence as it was said, and the
// student types how it should be.
export default function MistakePractice() {
  const [queue, setQueue] = useState(null)
  const [index, setIndex] = useState(0)
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [stats, setStats] = useState({ right: 0, wrong: 0 })
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    api.mistakePractice().then(({ exercises }) => setQueue(exercises)).catch((err) => setError(err.message))
  }, [])
  useEffect(() => { if (!result) inputRef.current?.focus() }, [index, result])

  if (error) return <div className="centered"><div className="card"><p className="error">{error}</p><Link className="button" to="/">Back</Link></div></div>
  if (!queue) return <div className="centered">Loading…</div>

  const current = queue[index]
  const finished = index >= queue.length

  const submit = async (event) => {
    event.preventDefault()
    if (!current || busy || result) return
    setBusy(true)
    try {
      const data = await api.submitMistakeAttempt(current.id, answer)
      setResult(data)
      setStats((s) => ({ right: s.right + (data.correct ? 1 : 0), wrong: s.wrong + (data.correct ? 0 : 1) }))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  const next = () => { setResult(null); setAnswer(''); setIndex((i) => i + 1) }
  const tryAgain = () => setResult(null)

  return (
    <div className="page practice-page">
      <header className="topbar">
        <div className="row-actions">
          <Link className="ghost back-link" to="/">← Back</Link>
          <strong>My mistakes</strong>
        </div>
        <div className="muted">{queue.length ? `${Math.min(index + 1, queue.length)} of ${queue.length}` : ''}</div>
      </header>

      {queue.length === 0 ? (
        <div className="card done-card">
          <h2>Nothing to drill yet</h2>
          <p className="muted">Mistakes your teacher notes during lessons will appear here.</p>
          <Link className="button" to="/">Back</Link>
        </div>
      ) : finished ? (
        <div className="card done-card">
          <h2>Done</h2>
          <p className="muted">Right: {stats.right} · Missed: {stats.wrong}</p>
          <div className="row-actions" style={{ justifyContent: 'center' }}>
            <button onClick={() => { setIndex(0); setStats({ right: 0, wrong: 0 }) }}>Once more</button>
            <Link className="button" to="/">Back</Link>
          </div>
        </div>
      ) : (
        <>
          <div className="progress-track slim">
            <div className="progress-fill" style={{ width: `${Math.round((index / queue.length) * 100)}%` }} />
          </div>
          <form className="drill" onSubmit={submit}>
            <div className="muted" style={{ marginBottom: 4 }}>
              You said this on {new Date(current.createdAt).toLocaleDateString()}
              {current.labels.length > 0 && ` · ${current.labels.join(', ')}`}
            </div>
            <div className="drill-prompt said-prompt">✗ {current.said}</div>
            <input
              ref={inputRef}
              className="drill-input"
              placeholder="How should it be?"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              disabled={Boolean(result)}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck="false"
            />
            {!result && <button type="submit" disabled={busy || !answer.trim()}>{busy ? 'Checking…' : 'Check'}</button>}
          </form>

          {result && (
            <div className={`verdict ${result.correct ? 'right' : 'wrong'}`}>
              {result.correct ? <strong>Correct</strong> : (
                <>
                  <strong>Not quite</strong>
                  <div className="expected">{result.expected}</div>
                </>
              )}
              {result.feedback && <div className="muted" style={{ marginTop: 6 }}>{result.feedback}</div>}
              {current.units?.length > 0 && (
                <div className="muted" style={{ marginTop: 6 }}>
                  Practise this: {current.units.map((u, i) => <span key={u.id}>{i > 0 && ' · '}<Link to={`/practice/${u.id}`}>{u.title}</Link></span>)}
                </div>
              )}
              <div className="row-actions">
                {!result.correct && <button className="ghost" onClick={tryAgain}>Try again</button>}
                <button onClick={next} autoFocus>Next</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
