import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'

// "Practice similar": new sentences on the same grammar point as one
// mistake (made once by the AI and kept), one at a time, checked like the
// mistake itself — so the rule gets applied, not one sentence memorised.
function SimilarDrill({ mistake, onDone }) {
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')
  const [i, setI] = useState(0)
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [right, setRight] = useState(0)
  const inputRef = useRef(null)

  useEffect(() => { api.mistakeSimilar(mistake.id).then(({ items }) => setItems(items)).catch((err) => setError(err.message)) }, [mistake.id])
  useEffect(() => { if (!result) inputRef.current?.focus() }, [i, result, items])

  if (error) return <div className="verdict wrong"><div>{error}</div><button onClick={onDone}>Back</button></div>
  if (!items) return <div className="muted" style={{ padding: 16 }}>Making sentences on the same rule…</div>
  if (i >= items.length) {
    return (
      <div className="verdict right">
        <strong>Similar sentences done: {right} of {items.length}</strong>
        <div className="row-actions" style={{ marginTop: 8 }}>
          <button className="ghost" onClick={() => { setI(0); setRight(0); setAnswer(''); setResult(null) }}>Once more</button>
          <button onClick={onDone} autoFocus>Back to my mistakes</button>
        </div>
      </div>
    )
  }
  const item = items[i]
  const check = async (event) => {
    event.preventDefault()
    if (busy || result) return
    setBusy(true)
    try {
      const data = await api.submitSimilarAttempt(mistake.id, item.index, answer)
      setResult(data)
      if (data.correct) setRight((n) => n + 1)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return (
    <div className="similar-drill">
      <div className="muted" style={{ marginBottom: 4 }}>Similar sentence {i + 1} of {items.length}{mistake.labels.length > 0 && ` · ${mistake.labels.join(', ')}`}</div>
      <form className="drill" onSubmit={check}>
        <div className="drill-prompt">{item.prompt}</div>
        <input ref={inputRef} className="drill-input" placeholder="Скажите это по-английски…" value={answer} onChange={(e) => setAnswer(e.target.value)} disabled={Boolean(result)} autoComplete="off" autoCapitalize="off" spellCheck="false" />
        {!result && <button type="submit" disabled={busy || !answer.trim()}>{busy ? 'Checking…' : 'Check'}</button>}
      </form>
      {result && (
        <div className={`verdict ${result.correct ? 'right' : 'wrong'}`}>
          {result.correct ? <strong>Correct</strong> : <><strong>Not quite</strong><div className="expected">{result.expected}</div></>}
          {result.feedback && <div className="muted" style={{ marginTop: 6 }}>{result.feedback}</div>}
          <div className="row-actions">
            {!result.correct && <button className="ghost" onClick={() => setResult(null)}>Try again</button>}
            <button onClick={() => { setResult(null); setAnswer(''); setI((n) => n + 1) }} autoFocus>Next</button>
          </div>
        </div>
      )}
      <button className="ghost compact" style={{ marginTop: 10 }} onClick={onDone}>Stop</button>
    </div>
  )
}

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
  const [similarOpen, setSimilarOpen] = useState(false)
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
  const next = () => { setResult(null); setAnswer(''); setSimilarOpen(false); setIndex((i) => i + 1) }
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
              {new Date(current.createdAt).toLocaleDateString()}
              {current.labels.length > 0 && ` · ${current.labels.join(', ')}`}
            </div>
            {current.prompt ? (
              <>
                <div className="drill-prompt">{current.prompt}</div>
                <div className="muted said-prompt" style={{ marginBottom: 8 }}>Вы сказали: ✗ {current.said}</div>
              </>
            ) : (
              <div className="drill-prompt said-prompt">✗ {current.said}</div>
            )}
            <input
              ref={inputRef}
              className="drill-input"
              placeholder={current.prompt ? 'Скажите это по-английски…' : 'How should it be?'}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              disabled={Boolean(result)}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck="false"
            />
            {!result && <button type="submit" disabled={busy || !answer.trim()}>{busy ? 'Checking…' : 'Check'}</button>}
          </form>

          {result && similarOpen && <SimilarDrill mistake={current} onDone={() => setSimilarOpen(false)} />}

          {result && !similarOpen && (
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
                <button className="ghost" onClick={() => setSimilarOpen(true)} title="New sentences on the same grammar rule">Practice similar</button>
                <button onClick={next} autoFocus>Next</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
