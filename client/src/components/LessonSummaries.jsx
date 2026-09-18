import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { PlayButton } from './WordCard'

// What each lesson was about — built when the call ends. The teacher can
// rebuild one and put its speaking questions on the board for next time.
export default function LessonSummaries({ classroomId, canEdit = false, student = false }) {
  const [data, setData] = useState(null)
  const [open, setOpen] = useState(null)
  const [busy, setBusy] = useState(null)

  const refresh = () => api.lessonSummaries(classroomId).then(setData).catch(() => setData({ summaries: [], pending: [] }))
  useEffect(() => { refresh() }, [classroomId])
  if (!data) return null

  const rebuild = async (sessionId) => {
    setBusy(sessionId)
    try { await api.rebuildSummary(sessionId); await refresh() } finally { setBusy(null) }
  }

  const date = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })

  return (
    <section>
      <h2>Lesson summaries</h2>
      {canEdit && data.aiEnabled === false && (
        <p className="muted" style={{ marginBottom: 10 }}>
          Words and mistakes are collected automatically. Topics from the board text and speaking questions need the AI key (ANTHROPIC_API_KEY on the server); until then only mistake topics appear.
        </p>
      )}
      {data.summaries.length === 0 && data.pending.length === 0 && (
        <p className="muted">After each call a summary appears here: topics, new words, mistakes to review, questions for the next lesson.</p>
      )}
      {canEdit && data.pending.length > 0 && (
        <div className="list" style={{ marginBottom: 10 }}>
          {data.pending.filter((p) => p.endedAt).slice(0, 3).map((p) => (
            <div key={p.sessionId} className="row">
              <div className="muted">Lesson on {date(p.startedAt)} — no summary yet (older than this feature, or nothing happened on the board)</div>
              <button className="ghost" onClick={() => rebuild(p.sessionId)} disabled={busy === p.sessionId}>{busy === p.sessionId ? 'Building…' : 'Build'}</button>
            </div>
          ))}
        </div>
      )}
      <div className="list">
        {data.summaries.map((s) => {
          const expanded = open === s.id || (open === null && s === data.summaries[0])
          return (
            <div key={s.id} className="row column summary-row">
              <div className="row-main" style={{ cursor: 'pointer' }} onClick={() => setOpen(expanded ? '' : s.id)}>
                <div>
                  <strong>Lesson · {date(s.startedAt)}</strong>
                  <div className="muted">
                    {s.minutes ? `${s.minutes} min · ` : ''}
                    {s.topics.length ? s.topics.join(' · ') : 'no topics detected'}
                    {` · ${s.words.length} words · ${s.mistakes.length} mistakes`}
                    {s.questions.length ? ` · ${s.questions.length} questions` : ''}
                  </div>
                </div>
                <span className="muted">{expanded ? '▴' : '▾'}</span>
              </div>
              {expanded && (
                <div className="summary-body">
                  {s.topics.length > 0 && (
                    <div className="summary-block">
                      <div className="summary-label">Topics</div>
                      <div className="mistake-tags">{s.topics.map((t) => <span key={t} className="mistake-tag format">{t}</span>)}</div>
                    </div>
                  )}
                  {s.words.length > 0 && (
                    <div className="summary-block">
                      <div className="summary-label">Words</div>
                      <div className="summary-words">
                        {s.words.map((w) => (
                          <span key={w.word} className={`summary-word ${w.saved ? 'saved' : ''}`} title={w.saved ? 'In My words' : ''}>
                            <strong>{w.word}</strong>
                            {w.transcription && <span className="muted"> {w.transcription}</span>}
                            {w.translation && <span className="muted"> — {w.translation}</span>}
                            <PlayButton src={`/api/dictionary/audio?word=${encodeURIComponent(w.word)}`} small />
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {s.mistakes.length > 0 && (
                    <div className="summary-block">
                      <div className="summary-label">Mistakes to review</div>
                      {s.mistakes.map((m) => (
                        <div key={m.id} className="summary-mistake"><span className="said">✗ {m.said}</span> <span className="correct">✓ {m.correct}</span></div>
                      ))}
                      {student && <Link className="muted" to="/practice/mistakes">Drill them →</Link>}
                    </div>
                  )}
                  {s.questions.length > 0 && (
                    <div className="summary-block">
                      <div className="summary-label">{student ? 'Prepare for the next lesson' : 'Speaking questions for the next lesson'}</div>
                      <ol className="summary-questions">{s.questions.map((q) => <li key={q}>{q}</li>)}</ol>
                    </div>
                  )}
                  {canEdit && (
                    <div className="row-actions" style={{ marginTop: 6 }}>
                      {s.questions.length > 0 && (
                        <Link className="button-link" style={{ marginTop: 0 }} to={`/classroom/${classroomId}?board=default&summary=${s.id}`}>Put questions on the board</Link>
                      )}
                      <button className="ghost" onClick={() => rebuild(s.sessionId)} disabled={busy === s.sessionId}>{busy === s.sessionId ? 'Rebuilding…' : 'Rebuild'}</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
