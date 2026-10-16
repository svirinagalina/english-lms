import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'

// "Send the trial lesson report" in a student's cabinet, for a trial that is
// over but whose report hasn't been sent — to the trial's teacher and to an
// administrator. Closing it (×) hides that report's reminder in this browser.
const DISMISSED = 'trial-report-dismissed'
const dismissed = () => { try { return JSON.parse(localStorage.getItem(DISMISSED) ?? '[]') } catch { return [] } }

export default function PendingTrialReports({ classroomId, refreshKey = 0 }) {
  const [reports, setReports] = useState([])
  const [hidden, setHidden] = useState(dismissed)
  useEffect(() => {
    const load = () => api.pendingTrials(classroomId).then(({ reports }) => setReports(reports)).catch(() => {})
    load()
    // Sent, unsent or deleted from the Trial lesson panel: the banner follows.
    window.addEventListener('trial-sent', load)
    return () => window.removeEventListener('trial-sent', load)
  }, [classroomId, refreshKey])
  const dismiss = (id) => {
    const next = [...new Set([...hidden, id])].slice(-200)
    setHidden(next)
    try { localStorage.setItem(DISMISSED, JSON.stringify(next)) } catch { /* private mode */ }
  }
  const shown = reports.filter((r) => !hidden.includes(r.id))
  if (!shown.length) return null
  return shown.map((r) => (
    <div key={r.id} className="notice">
      <span>
        Trial lesson with <strong>{r.student}</strong> ({new Date(r.createdAt).toLocaleDateString()}) is over — the report hasn't been sent yet.
      </span>
      {/* ?trial=1 unfolds the Trial lesson panel below. */}
      <Link className="button-link" style={{ marginTop: 0, marginLeft: 'auto' }} to={`/classroom/${r.classroomId}?trial=1`}
        onClick={() => setTimeout(() => document.getElementById(`trial-panel-${r.classroomId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150)}>Send the report</Link>
      <button type="button" className="link-button" style={{ marginLeft: 8 }} onClick={() => dismiss(r.id)} title="Hide this reminder" aria-label="Hide this reminder">×</button>
    </div>
  ))
}
