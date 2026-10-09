import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'
import Nav from '../components/Nav'
import Panel from '../components/Panel'
import { useAuth } from '../AuthContext'

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
// Clicking a card (package, lessons, price, teachers) turns it into a small
// form in place: the owner, or the student's teacher, fixes it right here.
function CardEditor({ kind, user, billing, teachers, isOwner, onSaved, onClose }) {
  const [form, setForm] = useState({
    lessonsPaid: billing.lessonsPaid ?? '',
    held: billing.held,
    price: billing.priceAmount == null ? '' : String(billing.priceAmount / 100),
    currency: billing.priceCurrency || 'RUB',
    resetCounter: false
  })
  const [allTeachers, setAllTeachers] = useState([])
  const [addTeacher, setAddTeacher] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { if (kind === 'teachers' && isOwner) api.listTeachers().then(({ teachers }) => setAllTeachers(teachers)).catch(() => {}) }, [kind, isOwner])
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const run = async (fn, close = true) => {
    setBusy(true); setError('')
    try { await fn(); await onSaved(); if (close) onClose() } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  const save = (e) => {
    e.preventDefault()
    run(async () => {
      if (kind === 'price') {
        const price = form.price.trim() === '' ? null : Math.round(Number(form.price.replace(',', '.')) * 100)
        if (price != null && !Number.isFinite(price)) throw new Error('The price should be a number')
        await api.updateStudentBilling(user.id, { priceAmount: price, priceCurrency: form.currency })
      } else {
        await api.updateStudentBilling(user.id, {
          lessonsPaid: form.lessonsPaid === '' ? null : Number(form.lessonsPaid),
          held: form.resetCounter ? 0 : Number(form.held),
          resetCounter: form.resetCounter
        })
      }
    })
  }
  const actions = (
    <div className="row-actions">
      <button type="submit" disabled={busy}>Save</button>
      <button type="button" className="ghost" onClick={onClose}>Cancel</button>
    </div>
  )
  const others = allTeachers.filter((t) => !teachers.some((x) => x.id === t.id))

  return (
    <div className="activity-card card-edit" onClick={(e) => e.stopPropagation()}>
      {kind === 'package' && (
        <form onSubmit={save} className="card-edit-form">
          <label>Lessons paid<input type="number" min="0" max="500" autoFocus value={form.lessonsPaid} onChange={set('lessonsPaid')} placeholder="not set" /></label>
          <label>Lessons held<input type="number" min="0" max="1000" value={form.resetCounter ? 0 : form.held} disabled={form.resetCounter} onChange={set('held')} /></label>
          <label className="card-edit-check"><input type="checkbox" checked={form.resetCounter} onChange={set('resetCounter')} /> New package from today</label>
          {actions}
        </form>
      )}
      {kind === 'price' && (
        <form onSubmit={save} className="card-edit-form">
          <label>Price per lesson
            <span className="row-actions" style={{ gap: 6 }}>
              <input inputMode="decimal" autoFocus value={form.price} onChange={set('price')} placeholder="—" style={{ flex: 1, minWidth: 0 }} />
              <select value={form.currency} onChange={set('currency')} style={{ width: 'auto' }}>
                <option value="RUB">₽</option><option value="EUR">€</option><option value="USD">$</option>
              </select>
            </span>
          </label>
          {actions}
        </form>
      )}
      {kind === 'teachers' && (
        <div className="card-edit-form">
          <div className="muted">Teachers</div>
          {teachers.length === 0 && <span className="muted">none</span>}
          {teachers.map((t) => (
            <div key={t.id} className="row" style={{ padding: 0 }}>
              <strong>{t.name}</strong>
              <button type="button" className="ghost" disabled={busy} title="Remove this teacher"
                onClick={() => window.confirm(`Remove ${t.name} as ${user.name}'s teacher? Their lessons and boards stay.`) && run(() => api.unlinkStudent(t.id, user.id), false)}>✕</button>
            </div>
          ))}
          {others.length > 0 && (
            <div className="row-actions">
              <select value={addTeacher} onChange={(e) => setAddTeacher(e.target.value)} style={{ flex: 1, minWidth: 0 }}>
                <option value="">Add a teacher…</option>
                {others.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <button type="button" disabled={!addTeacher || busy} onClick={() => run(async () => { await api.linkStudent(addTeacher, user.id); setAddTeacher('') }, false)}>Add</button>
            </div>
          )}
          <button type="button" className="ghost" onClick={onClose}>Done</button>
        </div>
      )}
      {error && <div className="error">{error}</div>}
    </div>
  )
}

export default function PersonActivity() {
  const { id } = useParams()
  const { user: me } = useAuth()
  const back = me?.role === 'OWNER' || me?.role === 'PARTNER' ? '/people' : '/classroom'
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const load = () => api.activityPerson(id).then(setData).catch((err) => setError(err.message))
  useEffect(() => { load() }, [id])
  const [editing, setEditing] = useState(null) // 'package' | 'price' | 'teachers'
  const isOwner = me?.role === 'OWNER'

  if (error) return <div className="page"><Nav title="Activity" back={back} /><div className="error">{error}</div></div>
  if (!data) return <div className="centered">Loading…</div>
  const { user, sections, timeline, work, reports, billing, teachers, contacts, plan, teaching } = data
  const money = (cents, cur) => cents == null ? '—' : `${(cents / 100).toLocaleString('ru-RU')} ${cur === 'EUR' ? '€' : cur === 'USD' ? '$' : '₽'}`
  const { practice, mistakes, vocabulary, lessons } = work
  const edit = { user, billing, teachers: teachers ?? [], isOwner, onSaved: load, onClose: () => setEditing(null) }

  return (
    <div className="page">
      <Nav title={user.name} back={back} />
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
          {lessons.classrooms.filter((c) => c.board).map((c) => (
            <Link key={`b${c.id}`} className="button-link" style={{ marginTop: 0 }} to={`/classroom/${c.id}?board=${c.board.id}`} title={c.board.title}>Board{lessons.classrooms.length > 1 && c.teacher ? ` · ${c.teacher}` : ''}</Link>
          ))}
          {user.role === 'STUDENT' && <Link className="button-link ghost" style={{ marginTop: 0 }} to={`/progress/${user.id}`}>Progress</Link>}
          {user.role !== 'STUDENT' && (me?.role === 'OWNER' || me?.role === 'PARTNER') && <Link className="button-link ghost" style={{ marginTop: 0 }} to={`/people/teachers/${user.id}`}>Lessons by month</Link>}
        </div>
      </div>

      {billing && (
        <div className="activity-cards">
          {editing === 'package' ? <CardEditor kind="package" {...edit} /> : <div className="activity-card editable" role="button" tabIndex={0} title="Click to change" onClick={() => setEditing('package')}>
            <div className="muted">Package</div>
            <strong>{billing.lessonsPaid == null ? 'not set' : `${billing.remaining} of ${billing.lessonsPaid} left`}</strong>
            <div className="muted">{billing.held} held{billing.packageStartedAt ? ` since ${date(billing.packageStartedAt)}` : ''}</div>
          </div>}
          {editing === 'price' ? <CardEditor kind="price" {...edit} /> : <div className="activity-card editable" role="button" tabIndex={0} title="Click to change" onClick={() => setEditing('price')}>
            <div className="muted">Price</div>
            <strong>{billing.priceAmount == null ? '—' : `${money(billing.priceAmount, billing.priceCurrency)} / lesson`}</strong>
            <div className="muted">Rubles to: {billing.card === 'after-trial' ? 'after-trial card' : 'school card'}</div>
          </div>}
          <div className="activity-card">
            <div className="muted">Payment</div>
            <strong>{billing.paymentReportedAt ? `Says paid ${date(billing.paymentReportedAt)}` : 'Nothing reported'}</strong>
            <div className="muted"><Link to="/billing">Open Payments</Link></div>
          </div>
          {editing === 'teachers' ? <CardEditor kind="teachers" {...edit} /> : <div className={`activity-card${isOwner ? ' editable' : ''}`} role={isOwner ? 'button' : undefined} tabIndex={isOwner ? 0 : undefined} title={isOwner ? 'Click to change' : undefined} onClick={() => isOwner && setEditing('teachers')}>
            <div className="muted">Teachers{plan ? ' · plan' : ''}</div>
            <strong>{teachers?.length ? teachers.map((t) => t.name).join(', ') : plan ? 'Free account' : '—'}</strong>
            <div className="muted">
              {plan?.plan ? `${plan.plan} until ${date(plan.until)} · ` : ''}
              {[contacts?.messenger, contacts?.phone, contacts?.city, contacts?.timezone].filter(Boolean).join(' · ') || 'no contacts given'}
            </div>
          </div>}
        </div>
      )}

      {teaching && (
        <>
          <div className="activity-cards">
            <div className="activity-card"><div className="muted">Students</div><strong>{teaching.students.length}</strong><div className="muted">{teaching.students.filter((s) => s.last30 > 0).length} had a lesson in 30 days</div></div>
            <div className="activity-card"><div className="muted">Lessons taught</div><strong>{teaching.lessons}</strong><div className="muted">{teaching.lessons30} in 30 days</div></div>
            <div className="activity-card"><div className="muted">Hours</div><strong>{teaching.hours30} h in 30 days</strong><div className="muted">{teaching.hours8w} h in 8 weeks</div></div>
            <div className="activity-card"><div className="muted">Trial lessons</div><strong>{teaching.trialReports}</strong><div className="muted">reports made</div></div>
          </div>
          <Panel id={`activity:weeks:${id}`} title="Lessons by week" hint="last 8 weeks" defaultOpen>
            <div className="week-bars">
              {teaching.weeks.map((w) => {
                const max = Math.max(1, ...teaching.weeks.map((x) => x.lessons))
                return (
                  <div key={w.from} className="week-bar" title={`${w.lessons} lessons · ${w.hours} h`}>
                    <span className="week-bar-n">{w.lessons}</span>
                    <i style={{ height: `${(w.lessons / max) * 100}%` }} />
                    <span className="muted">{new Date(w.from).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
                  </div>
                )
              })}
            </div>
          </Panel>
          <Panel id={`activity:students:${id}`} title="Students" count={teaching.students.length} defaultOpen>
            <div className="list">
              {teaching.students.map((s) => (
                <div key={s.id} className="row">
                  <Link className="person-link" to={`/people/${s.id}/activity`}><strong>{s.name}</strong></Link>
                  <span className="muted">{s.total} lessons · {s.last30} in 30 days · last {date(s.lastAt)}</span>
                </div>
              ))}
            </div>
          </Panel>
          {teaching.upcoming.length > 0 && (
            <Panel id={`activity:upcoming:${id}`} title="Next 7 days" count={teaching.upcoming.length}>
              <div className="list">
                {teaching.upcoming.map((e, i) => (
                  <div key={i} className="row"><strong>{e.title}</strong><span className="muted">{when(e.startTime)}{e.students ? ` · ${e.students} student${e.students > 1 ? 's' : ''}` : ''}</span></div>
                ))}
              </div>
            </Panel>
          )}
        </>
      )}

      <div className="activity-cards">
        <div className={`activity-card${billing ? ' editable' : ''}`} role={billing ? 'button' : undefined} tabIndex={billing ? 0 : undefined} title={billing ? 'Click to change paid / held lessons' : undefined} onClick={() => billing && setEditing('package')}>
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
