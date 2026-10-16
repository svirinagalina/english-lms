import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'

// "Send the trial lesson report" for every trial that is over but not sent —
// on the home page (all students) and on a student's page (that student only),
// so the teacher sees it however they left the call.
export default function PendingTrialReports({ classroomId = null, refreshKey = 0 }) {
  const [reports, setReports] = useState([])
  useEffect(() => {
    const load = () => api.pendingTrials().then(({ reports }) => setReports(reports)).catch(() => {})
    load()
    // Sent, unsent or deleted from the Trial lesson panel: the banner follows.
    window.addEventListener('trial-sent', load)
    return () => window.removeEventListener('trial-sent', load)
  }, [refreshKey])
  const shown = classroomId ? reports.filter((r) => r.classroomId === classroomId) : reports
  if (!shown.length) return null
  return shown.map((r) => (
    <div key={r.id} className="notice">
      <span>
        Trial lesson with <strong>{r.student}</strong> ({new Date(r.createdAt).toLocaleDateString()}) is over — the report hasn't been sent yet.
      </span>
      <Link className="button-link" style={{ marginTop: 0, marginLeft: 'auto' }} to={`/classroom/${r.classroomId}?trial=1`}
        onClick={() => setTimeout(() => document.getElementById(`trial-panel-${r.classroomId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150)}>Send the report</Link>
    </div>
  ))
}
