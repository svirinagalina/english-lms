import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'

export default function UnitPractice() {
  const { id } = useParams()
  const [unit, setUnit] = useState(null)
  const [error, setError] = useState('')
  const [queue, setQueue] = useState([])
  const [index, setIndex] = useState(0)
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [showTheory, setShowTheory] = useState(false)
  const [stats, setStats] = useState({ right: 0, wrong: 0 })
  const inputRef = useRef(null)

  useEffect(() => {
    api.getUnit(id)
      .then(({ unit }) => {
        setUnit(unit)
        const solved = new Set(unit.solvedIds)
        const remaining = unit.exercises.filter((exercise) => !solved.has(exercise.id))
        setQueue(remaining.length ? remaining : unit.exercises)
      })
      .catch((err) => setError(err.message))
  }, [id])

  const current = queue[index]

  useEffect(() => {
    if (!result) inputRef.current?.focus()
  }, [index, result])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!current || busy || result) return

    setBusy(true)
    try {
      const data = await api.submitAttempt(current.id, answer)
      setResult(data)
      setStats((prev) => ({
        right: prev.right + (data.correct ? 1 : 0),
        wrong: prev.wrong + (data.correct ? 0 : 1)
      }))

      // Drills for the mistake go straight after the current exercise.
      if (!data.correct && data.followUps?.length) {
        setQueue((prev) => [
          ...prev.slice(0, index + 1),
          ...data.followUps.filter((f) => !prev.some((q) => q.id === f.id)),
          ...prev.slice(index + 1)
        ])
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const next = () => {
    setResult(null)
    setAnswer('')
    setIndex((value) => value + 1)
  }

  const progress = useMemo(
    () => (queue.length ? Math.round((index / queue.length) * 100) : 0),
    [index, queue.length]
  )

  if (error) {
    return (
      <div className="centered">
        <div className="card">
          <h2>Cannot open this unit</h2>
          <p className="error">{error}</p>
          <Link className="button" to="/practice">Back to practice</Link>
        </div>
      </div>
    )
  }

  if (!unit) return <div className="centered">Loading…</div>

  const finished = index >= queue.length

  return (
    <div className="page practice-page">
      <header className="topbar">
        <strong>{unit.title}</strong>
        <div className="row-actions">
          {unit.theory && (
            <button className="ghost" onClick={() => setShowTheory((v) => !v)}>
              {showTheory ? 'Hide theory' : 'Theory'}
            </button>
          )}
          <Link className="ghost" to="/practice">Back</Link>
        </div>
      </header>

      {showTheory && unit.theory && (
        <div className="theory">{unit.theory}</div>
      )}

      {finished ? (
        <div className="card done-card">
          <h2>Done</h2>
          <p className="muted">
            Correct: {stats.right} · Mistakes: {stats.wrong}
          </p>
          <Link className="button" to="/practice">Back to units</Link>
        </div>
      ) : (
        <>
          <div className="progress-track slim">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="muted counter">
            {index + 1} of {queue.length} · correct {stats.right}, mistakes {stats.wrong}
          </div>

          <form className="drill" onSubmit={handleSubmit}>
            <div className="drill-prompt">{current?.prompt}</div>

            <input
              ref={inputRef}
              className="drill-input"
              placeholder={current?.type === 'TRANSLATE' ? 'Translate into English…' : 'Your answer…'}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              disabled={Boolean(result)}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck="false"
            />

            {!result && (
              <button type="submit" disabled={busy || !answer.trim()}>
                {busy ? 'Checking…' : 'Check'}
              </button>
            )}
          </form>

          {result && (
            <div className={`verdict ${result.correct ? 'right' : 'wrong'}`}>
              {result.correct ? (
                <strong>Correct</strong>
              ) : (
                <>
                  <strong>Not quite</strong>
                  <div className="expected">{result.expected}</div>
                  {result.mistake?.labels?.length > 0 && (
                    <div className="mistake-tags">
                      {result.mistake.labels.map((label) => (
                        <span key={label} className="mistake-tag">{label}</span>
                      ))}
                    </div>
                  )}
                  {result.alternatives?.length > 0 && (
                    <div className="muted">Also accepted: {result.alternatives.join(' · ')}</div>
                  )}
                  {result.diff?.missing?.length > 0 && (
                    <div className="muted">Missing: {result.diff.missing.join(', ')}</div>
                  )}
                  {result.followUps?.length > 0 && (
                    <div className="muted follow-note">
                      Added {result.followUps.length} more sentences
                      {result.mistake?.labels?.[0] ? ` on ${result.mistake.labels[0].toLowerCase()}` : ' on this topic'}.
                    </div>
                  )}
                </>
              )}

              <button onClick={next} autoFocus>Next</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
