import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { SECTION_LABELS } from '../pages/PersonActivity'

// The cabinet's Activity panel for staff: a few lines instead of the
// student's heat map (Galina, 2026-10-17: «когда последний раз заходил, в
// какой раздел платформы — кратко»). The full picture is in Analytics.
const ago = (v) => {
  if (!v) return 'never'
  const min = Math.round((Date.now() - new Date(v)) / 60000)
  if (min < 60) return min <= 1 ? 'just now' : `${min} min ago`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  return d === 1 ? 'yesterday' : d < 30 ? `${d} days ago` : new Date(v).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
const short = (v) => {
  const d = new Date(v)
  return d.toDateString() === new Date().toDateString() ? 'today' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

export default function StudentActivitySummary({ studentId }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { api.activityPerson(studentId).then(setData).catch((err) => setError(err.message)) }, [studentId])
  if (error) return <p className="muted">{error}</p>
  if (!data) return <p className="muted">Loading…</p>

  const { user, sections, timeline, work } = data
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const activeDays = timeline.filter((d) => d.day >= monthAgo).length
  const { practice, vocabulary, mistakes, lessons } = work
  const facts = [
    lessons.lastAt && `last lesson ${short(lessons.lastAt)}`,
    practice.last30 ? `${practice.last30} practice answers in 30 days${practice.accuracy != null ? ` (${practice.accuracy}% right)` : ''}` : 'no practice in 30 days',
    vocabulary.due ? `${vocabulary.due} words due` : null,
    mistakes.total ? `${mistakes.practiced}/${mistakes.total} mistakes drilled` : null
  ].filter(Boolean)

  return (
    <div className="activity-summary">
      <p><strong>Last seen {ago(user.lastSeenAt)}</strong><span className="muted"> · active {activeDays} of the last 30 days</span></p>
      {sections.length > 0 ? (
        <div className="activity-tags">
          {sections.slice(0, 8).map((s) => (
            <span key={s.section} className="activity-tag" title={`${s.visits} visits on ${s.days} days`}>{SECTION_LABELS[s.section] ?? s.section} · {short(s.lastAt)}</span>
          ))}
        </div>
      ) : <p className="muted">Hasn't opened anything on the platform yet.</p>}
      <p className="muted">{facts.join(' · ')}</p>
      <Link className="ghost button-link" to={`/people/${studentId}/activity`}>Full analytics</Link>
    </div>
  )
}
