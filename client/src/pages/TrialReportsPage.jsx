import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import Nav from '../components/Nav'

// Trial reports, unsent first: one click to fill in and send.
export function TrialReportList({ reports }) {
  const navigate = useNavigate()
  const sorted = [...reports].sort((a, b) => Boolean(a.publishedAt) - Boolean(b.publishedAt) || new Date(b.createdAt) - new Date(a.createdAt))
  return (
    <div className="list">
      {sorted.map((r) => (
        <div key={r.id} className="row">
          <div>
            <strong>{r.student}</strong>{r.level && <span className="muted"> · {r.level}</span>}
            <div className="muted">{new Date(r.createdAt).toLocaleDateString()} · teacher {r.teacher} · {r.publishedAt ? `sent ${new Date(r.publishedAt).toLocaleDateString()}` : r.generated ? 'drafted, not sent' : 'not filled in'}</div>
          </div>
          <div className="row-actions">
            {!r.publishedAt && <button onClick={() => navigate(`/classroom/${r.classroomId}?trial=1`)}>Fill in and send</button>}
            {r.generated && <button className="ghost" onClick={() => navigate(`/report/${r.id}`)}>Open the report</button>}
          </div>
        </div>
      ))}
    </div>
  )
}

// The teacher's page: their students' trial reports.
export default function TrialReportsPage() {
  const [reports, setReports] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { api.allTrialReports().then(({ reports }) => setReports(reports)).catch((err) => setError(err.message)) }, [])
  return (
    <div className="page">
      <Nav title="Trial reports" />
      {error && <div className="error">{error}</div>}
      {!reports && !error && <div className="muted">Loading…</div>}
      {reports?.length === 0 && <p className="muted">No trial lessons yet.</p>}
      {reports?.length > 0 && <TrialReportList reports={reports} />}
    </div>
  )
}
