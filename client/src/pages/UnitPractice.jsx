import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'
import { openPlanOffer } from '../components/TrialOffer'

// Theory text: paragraphs, "!" notes as callouts, English examples set apart.
const ENGLISH_RUN = /((?:[A-Za-z][A-Za-z'’]*[,.!?;:]?\s?){2,}|\b[A-Za-z][A-Za-z'’]{2,}\b)/g

const ITEM = /^[—–•-]\s+/
const withEnglish = (text) => text.split(ENGLISH_RUN).map((part, i) =>
  i % 2 === 1 ? <span key={i} className="theory-en">{part}</span> : part
)

// Lines starting with a dash are the book's lists ("— Если вы…"): shown as
// list items, each with room around it, instead of one dense block.
function Theory({ text }) {
  const paragraphs = text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean)
  return (
    <div className="theory">
      {paragraphs.map((paragraph, index) => {
        const note = paragraph.startsWith('!')
        const body = note ? paragraph.replace(/^!\s*/, '') : paragraph
        const blocks = []
        for (const line of body.split('\n')) {
          const item = ITEM.test(line)
          const last = blocks[blocks.length - 1]
          if (item) {
            if (last?.list) last.items.push(line.replace(ITEM, ''))
            else blocks.push({ list: true, items: [line.replace(ITEM, '')] })
          } else if (last && !last.list) last.lines.push(line)
          else blocks.push({ list: false, lines: [line] })
        }
        return (
          <div key={index} className={`theory-block${note ? ' theory-note' : ''}`}>
            {blocks.map((block, i) => block.list
              ? <ul key={i} className="theory-list">{block.items.map((item, j) => <li key={j}>{withEnglish(item)}</li>)}</ul>
              : <p key={i}>{withEnglish(block.lines.join('\n'))}</p>)}
          </div>
        )
      })}
    </div>
  )
}

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
      // A retry of the same sentence adds no drills: they were added the first time.
      const isDrill = Boolean(current.isFollowUp) || retrying
      const data = await api.submitAttempt(current.id, answer)
      setResult(isDrill ? { ...data, followUps: [] } : data)
      setRetrying(false)
      setStats((prev) => ({
        right: prev.right + (data.correct ? 1 : 0),
        wrong: prev.wrong + (data.correct ? 0 : 1)
      }))

      // Drills for the mistake go straight after the current exercise. A
      // mistake in a drill adds nothing more, so the lesson cannot snowball.
      if (!data.correct && data.followUps?.length && !isDrill) {
        setQueue((prev) => [
          ...prev.slice(0, index + 1),
          ...data.followUps
            .filter((f) => !prev.some((q) => q.id === f.id))
            .map((f) => ({ ...f, isFollowUp: true })),
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
    setRetrying(false)
    setIndex((value) => value + 1)
  }

  // Have another go at the same sentence, with the previous answer left to fix.
  const [retrying, setRetrying] = useState(false)
  const tryAgain = () => {
    setRetrying(true)
    setResult(null)
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
        <div className="row-actions">
          <Link className="ghost back-link" to="/practice">← Back</Link>
          <strong>{unit.title}</strong>
        </div>
        <div className="row-actions">
          {unit.theory && (
            <button className="ghost" onClick={() => setShowTheory((v) => !v)}>
              {showTheory ? 'Hide theory' : 'Theory'}
            </button>
          )}
        </div>
      </header>

      {showTheory && unit.theory && <Theory text={unit.theory} />}

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
                <>
                  <strong>Correct</strong>
                  {/* Accepted by the AI although the book has other words. */}
                  {result.expected && <div className="muted">In the book: {result.expected}</div>}
                  {result.feedback && <div className="verdict-feedback">{result.feedback}</div>}
                </>
              ) : (
                <>
                  <strong>Not quite</strong>
                  <div className="expected">{result.expected}</div>
                  {result.feedback && <div className="verdict-feedback">{result.feedback}</div>}
                  {result.aiLimited && (
                    <div className="verdict-feedback muted">
                      Checked against the book's key only — today's 20 free AI checks are used up.{' '}
                      <button type="button" className="link-button" onClick={() => openPlanOffer('practice')}>Unlimited with Practice</button>
                    </div>
                  )}
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
                  {result.diff?.extra?.length > 0 && (
                    <div className="muted">Not needed: {result.diff.extra.join(', ')}</div>
                  )}
                  {result.followUps?.length > 0 && (
                    <div className="muted follow-note">
                      Added {result.followUps.length} more sentences
                      {result.mistake?.labels?.[0] ? ` on ${result.mistake.labels[0].toLowerCase()}` : ' on this topic'}.
                    </div>
                  )}
                </>
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
