import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'

// Trial lessons of a classroom: the teacher marks the placement test,
// gives a level and comments, generates and publishes the report; the
// student sees the published report.
export default function TrialReports({ classroomId, canEdit = false }) {
  const [data, setData] = useState(null)
  const [open, setOpen] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const refresh = () => api.trialReports(classroomId).then(setData).catch((err) => setError(err.message))
  useEffect(() => { refresh() }, [classroomId])
  if (!data) return null
  const { reports, items, levels } = data
  if (!reports.length && !canEdit) return null

  const date = (iso) => new Date(iso).toLocaleDateString()
  const current = reports.find((r) => r.id === open) ?? reports[0]

  const mark = async (n, value) => {
    const prev = current.answers?.[String(n)] ?? null
    const next = prev === value ? null : value
    setData((d) => ({ ...d, reports: d.reports.map((r) => (r.id === current.id ? { ...r, answers: { ...(r.answers ?? {}), [n]: next } } : r)) }))
    try {
      const { report } = await api.updateTrial(current.id, { answers: { [String(n)]: next } })
      // The server's estimate follows the marks.
      setData((d) => ({ ...d, reports: d.reports.map((r) => (r.id === report.id ? { ...r, estimate: report.estimate } : r)) }))
    } catch (err) { setError(err.message) }
  }
  const markAll = async (value) => {
    const answers = Object.fromEntries(items.map((i) => [String(i.n), value]))
    setData((d) => ({ ...d, reports: d.reports.map((r) => (r.id === current.id ? { ...r, answers } : r)) }))
    try {
      const { report } = await api.updateTrial(current.id, { answers })
      setData((d) => ({ ...d, reports: d.reports.map((r) => (r.id === report.id ? { ...r, estimate: report.estimate } : r)) }))
    } catch (err) { setError(err.message) }
  }
  const saveField = async (field, value) => {
    setData((d) => ({ ...d, reports: d.reports.map((r) => (r.id === current.id ? { ...r, [field]: value } : r)) }))
  }
  const persistField = async (field, value) => {
    try { await api.updateTrial(current.id, { [field]: value === '' ? null : value }); await refresh() } catch (err) { setError(err.message) }
  }
  const generate = async () => {
    setBusy('generate'); setError('')
    try { await api.generateTrial(current.id); await refresh() } catch (err) { setError(err.message) } finally { setBusy('') }
  }
  const publish = async (unpublish) => {
    setBusy('publish'); setError('')
    try { await api.publishTrial(current.id, unpublish); await refresh() } catch (err) { setError(err.message) } finally { setBusy('') }
  }
  const remove = async () => {
    if (!window.confirm('Delete this trial lesson record and its report?')) return
    try { await api.deleteTrial(current.id); setOpen(null); await refresh() } catch (err) { setError(err.message) }
  }

  const answered = current ? Object.values(current.answers ?? {}).filter(Boolean).length : 0

  return (
    <section>
      <h2>Trial lesson</h2>
      {error && <div className="error">{error}</div>}
      {!reports.length && (
        <p className="muted">No trial lesson yet. “Trial lesson” above starts a call with the placement test on the board; afterwards mark the answers here and generate the level report.</p>
      )}
      {reports.length > 1 && (
        <div className="row-actions" style={{ marginBottom: 10 }}>
          {reports.map((r) => (
            <button key={r.id} className={`ghost ${r.id === current.id ? 'active-tab' : ''}`} onClick={() => setOpen(r.id)}>{date(r.createdAt)}</button>
          ))}
        </div>
      )}
      {current && !canEdit && (
        <div className="row">
          <div>
            <strong>Level report · {date(current.publishedAt ?? current.createdAt)}</strong>
            <div className="muted">Your level: <strong>{current.generated?.level}</strong> · {current.generated?.focusTopics?.length ?? 0} topics to work on</div>
          </div>
          <Link className="button" to={`/report/${current.id}`}>Open the report</Link>
        </div>
      )}
      {current && canEdit && (
        <div className="trial-form">
          <div className="row-main" style={{ marginBottom: 10 }}>
            <div>
              <strong>Placement test · {date(current.createdAt)}</strong>
              <div className="muted">
                {answered} of {items.length} marked · test estimate: <strong>{current.estimate?.estimated}{current.estimate?.plus ? '+' : ''}</strong>
                {current.estimate?.rates && ` (A1 ${current.estimate.rates.A1 ?? '–'}% · A2 ${current.estimate.rates.A2 ?? '–'}% · B1 ${current.estimate.rates.B1 ?? '–'}% · B2 ${current.estimate.rates.B2 ?? '–'}%)`}
              </div>
            </div>
            <div className="row-actions">
              <button className="ghost" onClick={() => markAll('ok')} title="Mark everything correct, then untick the mistakes">All ✓</button>
              <button className="ghost" onClick={remove}>Delete</button>
            </div>
          </div>

          <div className="trial-items">
            {items.map((item) => {
              const value = current.answers?.[String(item.n)] ?? null
              return (
                <div key={item.n} className={`trial-item ${value ?? ''}`}>
                  <div className="trial-n">{item.n}</div>
                  <div className="trial-text">
                    <div>{item.ru}</div>
                    <div className="muted">{item.en} <span className="trial-topic">{item.topic} · {item.level}</span></div>
                  </div>
                  <div className="trial-marks">
                    <button className={value === 'ok' ? 'on ok' : ''} onClick={() => mark(item.n, 'ok')} title="Correct">✓</button>
                    <button className={value === 'partly' ? 'on partly' : ''} onClick={() => mark(item.n, 'partly')} title="Partly correct">±</button>
                    <button className={value === 'no' ? 'on no' : ''} onClick={() => mark(item.n, 'no')} title="Wrong">✗</button>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="trial-assess">
            <label>
              Your level assessment
              <select value={current.teacherLevel ?? ''} onChange={(e) => { saveField('teacherLevel', e.target.value); persistField('teacherLevel', e.target.value) }}>
                <option value="">— use the test estimate —</option>
                {['A1', 'A1+', 'A2', 'A2+', 'B1', 'B1+', 'B2', 'B2+', 'C1'].map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </label>
            <label>
              Comments for the report (strengths, what you noticed, goals)
              <textarea
                rows={4}
                value={current.comments ?? ''}
                onChange={(e) => saveField('comments', e.target.value)}
                onBlur={(e) => persistField('comments', e.target.value)}
                placeholder="Speaks freely but avoids the past tenses; good vocabulary for work; wants B2 for an interview in spring…"
              />
            </label>
          </div>

          <div className="row-actions" style={{ marginTop: 10 }}>
            <button onClick={generate} disabled={busy === 'generate' || answered === 0}>{busy === 'generate' ? 'Writing…' : (current.generated ? 'Regenerate report' : 'Generate report')}</button>
            {current.generated && <Link className="button-link" style={{ marginTop: 0 }} to={`/report/${current.id}`}>Open the report</Link>}
            {current.generated && (
              current.publishedAt
                ? <button className="ghost" onClick={() => publish(true)} disabled={busy === 'publish'}>Hide from the student</button>
                : <button className="ghost" onClick={() => publish(false)} disabled={busy === 'publish'}>Publish to the student</button>
            )}
            {current.publishedAt && <span className="paid-badge active">Published {date(current.publishedAt)}</span>}
          </div>
          {data.aiEnabled === false && <p className="muted small-hint" style={{ marginTop: 8 }}>Without the AI key the report is built from templates; with it, the text is written for this student.</p>}
        </div>
      )}
    </section>
  )
}
