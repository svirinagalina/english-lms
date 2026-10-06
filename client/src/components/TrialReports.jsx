import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import Panel from './Panel'

// Trial lessons of a classroom: the teacher marks the placement test,
// gives a level and comments, generates and publishes the report; the
// student sees the published report.
export default function TrialReports({ classroomId, canEdit = false, focus = false }) {
  const boxRef = useRef(null)
  const [data, setData] = useState(null)
  const [open, setOpen] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const refresh = () => api.trialReports(classroomId).then(setData).catch((err) => setError(err.message))
  useEffect(() => { refresh() }, [classroomId])
  // Straight from the trial call: open and show the report form.
  useEffect(() => { if (focus && data) setTimeout(() => boxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100) }, [focus, Boolean(data)])
  if (!data) return null
  const { reports, items, levels, topics = {} } = data
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
  const toggleTopic = (topic) => {
    const chosen = current.focusTopics ?? []
    const next = chosen.includes(topic) ? chosen.filter((t) => t !== topic) : [...chosen, topic]
    saveField('focusTopics', next)
    api.updateTrial(current.id, { focusTopics: next }).catch((err) => setError(err.message))
  }
  const generate = async () => {
    setBusy('generate'); setError('')
    try { await api.generateTrial(current.id); await refresh() } catch (err) { setError(err.message) } finally { setBusy('') }
  }
  // One step for the teacher: write the report and send it to the student.
  const send = async () => {
    setBusy('send'); setError('')
    try { await api.generateTrial(current.id); if (!current.publishedAt) await api.publishTrial(current.id, false); await refresh() } catch (err) { setError(err.message) } finally { setBusy('') }
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
    <div ref={boxRef}>
    <Panel id={`trial:${classroomId}`} title="Trial lesson" count={reports.length} forceOpen={focus}>
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
          <div className="trial-assess">
            <label>
              Student's level
              <select value={current.teacherLevel ?? ''} onChange={(e) => { saveField('teacherLevel', e.target.value); persistField('teacherLevel', e.target.value) }}>
                <option value="">{answered ? `from the test: ${current.estimate?.estimated}${current.estimate?.plus ? '+' : ''}` : '— choose —'}</option>
                {['A1', 'A1+', 'A2', 'A2+', 'B1', 'B1+', 'B2', 'B2+', 'C1'].map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </label>
            <label>
              Comment for the student (optional)
              <textarea
                rows={3}
                value={current.comments ?? ''}
                onChange={(e) => saveField('comments', e.target.value)}
                onBlur={(e) => persistField('comments', e.target.value)}
                placeholder="Speaks freely but avoids the past tenses; wants B2 for an interview in spring…"
              />
            </label>
          </div>

          <div className="trial-topics">
            <div className="trial-topics-head">What to work on first — click the topics{current.focusTopics?.length ? ` · ${current.focusTopics.length} chosen` : ''}</div>
            {Object.entries(topics).map(([level, list]) => (
              <div key={level} className="trial-topics-row">
                <span className="trial-topics-level">{level}</span>
                {list.map((topic) => (
                  <button key={topic} type="button" className={`topic-chip ${current.focusTopics?.includes(topic) ? 'on' : ''}`} onClick={() => toggleTopic(topic)}>{topic}</button>
                ))}
              </div>
            ))}
          </div>

          <div className="row-actions" style={{ marginTop: 10 }}>
            {current.publishedAt
              ? <span className="paid-badge active">Sent to the student {date(current.publishedAt)}</span>
              : (
                <button onClick={send} disabled={busy === 'send' || (!answered && !current.teacherLevel)} title={!answered && !current.teacherLevel ? 'Choose the level first' : 'The student gets the report, the plan and the prices by email and in their account'}>
                  {busy === 'send' ? 'Sending…' : 'Send to the student'}
                </button>
              )}
            {current.generated && <Link className="button-link" style={{ marginTop: 0 }} to={`/report/${current.id}`}>Open the report</Link>}
            {current.publishedAt && <button className="ghost" onClick={send} disabled={busy === 'send'}>{busy === 'send' ? 'Updating…' : 'Update the report'}</button>}
            {current.publishedAt && <button className="ghost" onClick={() => publish(true)} disabled={busy === 'publish'}>Hide from the student</button>}
            <button className="ghost" onClick={remove}>Delete</button>
          </div>
          {!answered && !current.teacherLevel && <p className="muted small-hint" style={{ marginTop: 6 }}>Choose the level and the topics (or mark the test below), then Send — the report is written and emailed to the student in one step.</p>}

          <details className="trial-test" style={{ marginTop: 14 }} open={answered > 0}>
            <summary>
              Placement test (optional) · {answered} of {items.length} marked
              {answered > 0 && <> · estimate <strong>{current.estimate?.estimated}{current.estimate?.plus ? '+' : ''}</strong></>}
            </summary>
            <div className="row-actions" style={{ margin: '8px 0' }}>
              <button className="ghost" onClick={() => markAll('ok')} title="Mark everything correct, then untick the mistakes">All ✓</button>
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
          </details>
        </div>
      )}
    </Panel>
    </div>
  )
}
