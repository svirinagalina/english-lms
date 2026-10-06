import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'
import Nav from '../components/Nav'
import Panel from '../components/Panel'

export const SECTION_LABELS = {
  home: 'Home', classroom: 'Cabinet', board: 'Board', call: 'Calls', practice: 'Practice', mistakes: 'Mistake notebook practice',
  trainer: 'Trainer', vocabulary: 'Vocabulary', dictionary: 'Dictionary', courses: 'Courses', writing: 'Writing',
  progress: 'Progress', report: 'Trial report', billing: 'Payment', plans: 'Plans', calendar: 'Calendar', todo: 'To-do',
  timetable: 'Timetable', profile: 'Profile', settings: 'Settings', people: 'People', content: 'Content', other: 'Other'
}
const label = (s) => SECTION_LABELS[s] ?? s
const date = (v) => (v ? new Date(v).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
const when = (v) => (v ? new Date(v).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'never')
const dayLabel = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })

// One person for the owner: when they were here, which sections they
// opened, and what they did — practice, mistakes, words, lessons, reports.
export default function PersonActivity() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { api.activityPerson(id).then(setData).catch((err) => setError(err.message)) }, [id])

  if (error) return <div className="page"><Nav title="Activity" back="/people" /><div className="error">{error}</div></div>
  if (!data) return <div className="centered">Loading…</div>
  const { user, sections, timeline, work, reports } = data
  const { practice, mistakes, vocabulary, lessons } = work

  return (
    <div className="page">
      <Nav title={user.name} back="/people" />
      <div className="row" style={{ marginBottom: 16 }}>
        <div>
          <strong>{user.email}</strong>
          <div className="muted">
            {user.role === 'STUDENT' && user.free ? 'Free app user' : user.role.toLowerCase()} · registered {date(user.createdAt)} · last seen {when(user.lastSeenAt)}
          </div>
        </div>
        <div className="row-actions">
          {lessons.classrooms.map((c) => (
            <Link key={c.id} className="button-link" style={{ marginTop: 0 }} to={`/classroom/${c.id}`}>Cabinet{c.teacher ? ` · ${c.teacher}` : ''}</Link>
          ))}
          {user.role === 'STUDENT' && <Link className="button-link ghost" style={{ marginTop: 0 }} to={`/progress/${user.id}`}>Progress</Link>}
        </div>
      </div>

      <div className="activity-cards">
        <div className="activity-card">
          <div className="muted">Lessons</div>
          <strong>{lessons.held}</strong>
          <div className="muted">{lessons.last30} in 30 days · last {date(lessons.lastAt)}</div>
        </div>
        <div className="activity-card">
          <div className="muted">Practice</div>
          <strong>{practice.attempts} answers</strong>
          <div className="muted">{practice.last30} in 30 days{practice.accuracy != null && ` · ${practice.accuracy}% correct`} · last {date(practice.lastAt)}</div>
        </div>
        <div className="activity-card">
          <div className="muted">Mistake notebook</div>
          <strong>{mistakes.total} mistakes</strong>
          <div className="muted">{mistakes.practiced} practised · last {date(mistakes.lastPracticedAt)}</div>
        </div>
        <div className="activity-card">
          <div className="muted">Vocabulary</div>
          <strong>{vocabulary.inReview} words in review</strong>
          <div className="muted">{vocabulary.learned} learned · {vocabulary.due} due · {vocabulary.ownCards} saved by them</div>
        </div>
      </div>

      <Panel id={`activity:sections:${id}`} title="Sections opened" hint="last 60 days" count={sections.length} defaultOpen>
        {sections.length === 0 && <p className="muted">Nothing recorded yet. Visits are recorded from 6 October 2026.</p>}
        <div className="list">
          {sections.map((s) => (
            <div key={s.section} className="row">
              <div><strong>{label(s.section)}</strong><div className="muted">{s.visits} {s.visits === 1 ? 'visit' : 'visits'} on {s.days} {s.days === 1 ? 'day' : 'days'}</div></div>
              <span className="muted">last {when(s.lastAt)}</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel id={`activity:days:${id}`} title="Day by day" count={timeline.length}>
        <div className="list">
          {timeline.map((d) => (
            <div key={d.day} className="row">
              <strong style={{ minWidth: 110 }}>{dayLabel(d.day)}</strong>
              <div className="activity-tags">{d.sections.map((s) => <span key={s.section} className="activity-tag">{label(s.section)}{s.visits > 1 ? ` ×${s.visits}` : ''}</span>)}</div>
            </div>
          ))}
        </div>
      </Panel>

      {practice.units.length > 0 && (
        <Panel id={`activity:units:${id}`} title="Practice by unit" count={practice.units.length}>
          <div className="list">
            {practice.units.map((u) => (
              <div key={u.title} className="row">
                <strong>{u.title}</strong>
                <span className="muted">{u.attempts} answers · {u.accuracy}% correct · last {date(u.lastAt)}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {reports.length > 0 && (
        <Panel id={`activity:reports:${id}`} title="Trial reports" count={reports.length} defaultOpen>
          <div className="list">
            {reports.map((r) => (
              <div key={r.id} className="row">
                <div>
                  <strong>{date(r.createdAt)}{r.level ? ` · ${r.level}` : ''}</strong>
                  <div className="muted">{r.publishedAt ? `Sent to the student ${date(r.publishedAt)}` : r.generated ? 'Drafted, not sent' : 'Not filled in'}</div>
                </div>
                <div className="row-actions">
                  {r.generated && <Link className="button-link" style={{ marginTop: 0 }} to={`/report/${r.id}`}>Open the report</Link>}
                  {!r.publishedAt && <Link className="button-link ghost" style={{ marginTop: 0 }} to={`/classroom/${r.classroomId}?trial=1`}>Fill in and send</Link>}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  )
}
