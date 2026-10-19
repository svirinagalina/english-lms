import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { TrialReportList } from './TrialReportsPage'
import { useAuth } from '../AuthContext'
import { api } from '../api'
import { matchesSearch } from '../utils/search'
import Nav from '../components/Nav'
import Panel from '../components/Panel'
import { SiteFooter } from '../components/Brand'
import PersonLink from '../components/PersonLink'
import { TeacherEditor } from '../components/StudentTeachers'

function InviteForm({ role, teachers, currentUserId, onInvited, trialStudents = [] }) {
  const [form, setForm] = useState({ name: '', email: '', telegram: '', teacherId: currentUserId })
  // A student without email is invited by their Telegram: the link is sent
  // there by hand, and they pick a login instead.
  const [byTelegram, setByTelegram] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // A student from a trial (no email yet) is invited as that same account:
  // their board and history stay, and no second account appears.
  const [trial, setTrial] = useState(null)
  const fromTrial = role === 'STUDENT' ? trialStudents.filter((s) => s.teachers?.some((t) => t.id === form.teacherId)) : []

  const submit = async (event) => {
    event?.preventDefault()
    setError('')
    setBusy(true)
    try {
      const result = await api.createInvite({
        name: trial ? (trial.name.length >= 2 ? trial.name : `${trial.name} (ученик)`) : form.name,
        ...(byTelegram && !trial ? { telegram: form.telegram } : { email: form.email }),
        role,
        ...(trial ? { userId: trial.id } : role === 'STUDENT' ? { teacherId: form.teacherId } : {})
      })
      setForm({ name: '', email: '', telegram: '', teacherId: currentUserId })
      setTrial(null)
      onInvited(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="inline-form" onSubmit={submit}>
      {error && <div className="error" style={{ width: '100%' }}>{error}</div>}
      {fromTrial.length > 0 && !trial && (
        <div className="muted" style={{ width: '100%' }}>
          Ученики этого учителя с пробного урока, ещё без почты — если приглашаете одного из них, выберите его:{' '}
          {fromTrial.map((s) => (
            <button key={s.id} type="button" className="ghost" style={{ margin: '4px 6px 0 0' }} onClick={() => setTrial(s)}>
              {s.name} · пробный {new Date(s.createdAt).toLocaleDateString()}
            </button>
          ))}
        </div>
      )}
      {trial && (
        <div className="notice" style={{ width: '100%' }}>
          Приглашение уйдёт ученику с пробного <strong>{trial.name}</strong> — его доска и история останутся, второго аккаунта не будет.{' '}
          <button type="button" className="link-button" onClick={() => setTrial(null)}>Это другой человек</button>
        </div>
      )}
      {!trial && (
        <input
          placeholder="Full name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
      )}
      {role === 'STUDENT' && !trial && (
        <select value={byTelegram ? 'telegram' : 'email'} onChange={(e) => setByTelegram(e.target.value === 'telegram')} style={{ flex: '0 0 auto', width: 'auto' }} title="Как связаться с учеником">
          <option value="email">Email</option>
          <option value="telegram">Telegram</option>
        </select>
      )}
      {byTelegram && !trial ? (
        <input
          placeholder="@telegram"
          value={form.telegram}
          onChange={(e) => setForm({ ...form, telegram: e.target.value.trim() })}
          pattern="@?[A-Za-z0-9_]{4,32}"
          title="Ник в Telegram, например @masha"
          required
        />
      ) : (
        <input
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          required
        />
      )}
      {role === 'STUDENT' && teachers.length > 1 && (
        <select
          value={form.teacherId}
          onChange={(e) => setForm({ ...form, teacherId: e.target.value })}
          title="Which teacher this student will study with"
        >
          {teachers.map((teacher) => (
            <option key={teacher.id} value={teacher.id}>
              {teacher.name}{teacher.id === currentUserId ? ' (me)' : ''}
            </option>
          ))}
        </select>
      )}
      <button type="submit" disabled={busy}>
        {busy ? 'Creating…' : `Invite ${role === 'TEACHER' ? 'teacher' : 'student'}`}
      </button>
    </form>
  )
}

const PLAN_NAMES = { practice: 'Practice', calls: 'Calls', all: 'Everything' }
const monthAhead = () => { const d = new Date(); d.setMonth(d.getMonth() + 1); return d.toISOString().slice(0, 10) }

// One trial lesson from the Advent site per row: each step it reached.
const OUTCOME = { held: 'урок прошёл', student_no_show: 'ученик не пришёл', teacher_no_show: 'учитель не пришёл' }
const shortWhen = (v) => new Date(v).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
function TrialFunnel({ trials, onRemove, onMerge }) {
  return (
    <div className="list">
      {trials.map((t) => {
        const past = new Date(t.startsAt) < new Date()
        const steps = [
          [t.status === 'pending' ? 'ждёт подтверждения в Telegram' : 'записан', t.status !== 'pending'],
          ['ждал урока', Boolean(t.waitedAt || t.studentJoinedAt)],
          [t.outcome ? OUTCOME[t.outcome] ?? t.outcome : past ? 'итог неизвестен' : 'урок впереди', t.outcome === 'held', t.outcome && t.outcome !== 'held'],
          [t.reportSentAt ? `отчёт отправлен${t.level ? ` · ${t.level}` : ''}` : 'отчёт не отправлен', Boolean(t.reportSentAt)],
          [t.lessonsPaid > 0 ? `оплатил ${t.lessonsPaid} ур.` : t.saysPaid ? 'говорит, что оплатил' : 'не оплатил', t.lessonsPaid > 0]
        ]
        return (
          <div key={t.id} className="row">
            <div>
              <strong>{t.student.id ? <PersonLink id={t.student.id} name={t.student.name} /> : t.student.name}</strong>
              {t.isTest && <span className="muted"> · тест</span>}
              <div className="muted">
                {shortWhen(t.startsAt)} · {t.teacher.name}{t.telegram ? ` · ${t.telegram}` : ''}{t.status === 'cancelled' ? ' · отменён' : ''}
                {' · '}{t.source === 'platform' ? 'запись на платформе' : 'сайт Advent'}{t.utm?.utm_source ? ` · ${t.utm.utm_source}${t.utm.utm_campaign ? ` / ${t.utm.utm_campaign}` : ''}` : ''}
              </div>
            </div>
            <div className="activity-tags">
              {steps.map(([label, ok, bad]) => (
                <span key={label} className={`activity-tag${ok ? ' ok' : bad ? ' bad' : ''}`}>{label}</span>
              ))}
              {onRemove && <button type="button" className="ghost" onClick={() => onRemove(t)} title="Remove this booking from the platform; nobody is told">Убрать</button>}
            </div>
            {t.twin && onMerge && (
              <div className="notice" style={{ width: '100%', marginTop: 6 }}>
                Похоже, это уже ваш ученик <strong>{t.twin.name}</strong>{t.twin.email ? ` (${t.twin.email})` : ''}: у него свой аккаунт, а для записи с сайта создан второй.{' '}
                <button type="button" onClick={() => onMerge(t)}>Объединить</button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// Trial students who didn't buy, a month after the trial: only their contacts
// are kept (their accounts are removed), for Maxim to get back in touch.
const OUTCOME_SHORT = { held: 'был на уроке', student_no_show: 'не пришёл', teacher_no_show: 'не пришёл учитель', cancelled: 'отменён' }
function TrialContacts({ contacts }) {
  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>
        Через месяц после пробного урока ученики, которые не оплатили, удаляются с платформы, а их контакты остаются здесь и уходят Максиму в CRM — чтобы предложить занятия позже.{' '}
        <a href="/api/trial-contacts/csv">Скачать таблицу (CSV)</a>
      </p>
      <div className="list">
        {contacts.map((c) => (
          <div key={c.id} className="row">
            <div>
              <strong>{c.name}</strong>
              <div className="muted">
                {[c.telegram, c.email, c.phone].filter(Boolean).join(' · ') || 'только бот школы'}
              </div>
              <div className="muted">
                {shortWhen(c.lessonAt)} · {c.teacherName ?? '—'} · {OUTCOME_SHORT[c.outcome] ?? 'итог неизвестен'}{c.level ? ` · ${c.level}` : ''} · {c.source === 'platform' ? 'запись на платформе' : 'сайт Advent'}
              </div>
            </div>
            <span className={`activity-tag${c.sentAt ? ' ok' : ''}`}>{c.sentAt ? 'у Максима' : 'ждёт отправки'}</span>
          </div>
        ))}
      </div>
    </>
  )
}

const COURSE_PAID = { stripe: 'Stripe', transfer: 'card transfer', manual: 'opened by hand' }

// A course a free user bought on their own: which, until when, how paid.
function CourseBadge({ course }) {
  const active = new Date(course.until) > new Date()
  return (
    <div className="muted">
      <span className={`paid-badge ${active ? 'active' : ''}`}>
        Course «{course.title}» {active ? 'until' : 'ended'} {new Date(course.until).toLocaleDateString()} · {COURSE_PAID[course.source] ?? course.source}{course.amount ? ` · ${course.amount}` : ''}{course.paidAt ? ` · paid ${new Date(course.paidAt).toLocaleDateString()}` : ''}
      </span>
    </div>
  )
}

export default function People() {
  const { user } = useAuth()
  const [people, setPeople] = useState([])
  const [teachers, setTeachers] = useState([])
  const [leads, setLeads] = useState([])
  const [activity, setActivity] = useState([])
  const [trialReports, setTrialReports] = useState([])
  const [funnel, setFunnel] = useState([])
  const [contacts, setContacts] = useState([])
  // The booking's account is a duplicate of a student who already has one.
  const mergeBooking = async (t) => {
    if (!window.confirm(`Перенести запись «${t.student.name}» (${shortWhen(t.startsAt)}) на аккаунт «${t.twin.name}»${t.twin.email ? ` (${t.twin.email})` : ''} и удалить пустой аккаунт с пробного?`)) return
    try {
      await api.mergeTrialBooking(t.id, t.twin.id)
      api.trialFunnel().then(({ trials }) => setFunnel(trials)).catch(() => {})
      refresh()
    } catch (err) { window.alert(err.message) }
  }
  // A test or duplicate booking: off the platform, nobody is told.
  const removeBooking = async (t) => {
    if (!window.confirm(`Убрать запись «${t.student.name}» (${shortWhen(t.startsAt)}) с платформы?\n\nУрок исчезнет из Timetable и из этого списка, ученику ничего не придёт. Если урок настоящий, отмените его в Timetable — тогда ученику придёт сообщение.\n\nУченик, который уже оплатил, остаётся в Students со всем доступом — запись просто пропадёт из этого списка.`)) return
    try {
      await api.removeTrialBooking(t.id)
      setFunnel((list) => list.filter((x) => x.id !== t.id))
      api.allTrialReports().then(({ reports }) => setTrialReports(reports)).catch(() => {})
    } catch (err) { window.alert(err.message) }
  }
  const markLead = async (lead) => {
    const { lead: updated } = await api.handleLead(lead.id, !lead.handled)
    setLeads((list) => list.map((l) => (l.id === updated.id ? updated : l)))
  }
  const [invites, setInvites] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(null)
  const [linking, setLinking] = useState(null)
  const [mail, setMail] = useState({ enabled: false })
  const [delivery, setDelivery] = useState(null)
  const [resending, setResending] = useState(null)

  const refresh = async () => {
    const [peopleResult, invitesResult, teachersResult, mailResult] = await Promise.all([
      api.listPeople(),
      api.listInvites(),
      api.listTeachers(),
      api.mailStatus().catch(() => ({ enabled: false }))
    ])
    setPeople(peopleResult.people)
    setInvites(invitesResult.invites)
    setTeachers(teachersResult.teachers)
    setMail(mailResult)
    api.listLeads().then(({ leads }) => setLeads(leads)).catch(() => {})
    api.activityPeople().then(({ people }) => setActivity(people)).catch(() => {})
    api.allTrialReports().then(({ reports }) => setTrialReports(reports)).catch(() => {})
    api.trialFunnel().then(({ trials }) => setFunnel(trials)).catch(() => {})
    if (['OWNER', 'PARTNER'].includes(user.role)) api.trialContacts().then(({ contacts }) => setContacts(contacts)).catch(() => {})
  }

  useEffect(() => {
    refresh().catch((err) => setError(err.message)).finally(() => setLoading(false))
  }, [])

  const handleInvited = async (result) => {
    setDelivery(result?.delivery?.telegram ? { ...result.delivery, link: result.invite.link } : result?.delivery ?? null)
    await refresh()
    if (result?.delivery?.sent) setTimeout(() => setDelivery(null), 5000)
  }

  const resend = async (invite) => {
    setResending(invite.id)
    try {
      const { delivery } = await api.resendInvite(invite.id)
      setDelivery({ ...delivery, email: invite.email })
      if (delivery.sent) setTimeout(() => setDelivery(null), 5000)
    } catch (err) {
      setError(err.message)
    } finally {
      setResending(null)
    }
  }

  const copyLink = async (invite) => {
    try {
      await navigator.clipboard.writeText(invite.link)
      setCopied(invite.id)
      setTimeout(() => setCopied(null), 2500)
    } catch {
      window.prompt('Copy this invitation link:', invite.link)
    }
  }

  const revoke = async (id) => {
    await api.deleteInvite(id)
    await refresh()
  }

  const link = async (studentId, teacherId) => {
    setError('')
    try {
      await api.linkStudent(teacherId, studentId)
      setLinking(null)
      await refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  const [editing, setEditing] = useState(null) // { id, name, email }
  const [query, setQuery] = useState('')
  // A free user's plan set by hand (paid by card in roubles).
  const [planFor, setPlanFor] = useState(null)
  const saveManualPlan = async (id, plan, until) => {
    try {
      await api.setManualPlan(id, { plan, until })
      setPlanFor(null)
      await refresh()
    } catch (err) { setError(err.message) }
  }
  const navigate = useNavigate()
  const saveEdit = async () => {
    setError('')
    try {
      await api.updateUser(editing.id, user.role === 'OWNER' ? { name: editing.name, email: editing.email } : { name: editing.name })
      setEditing(null)
      await refresh()
    } catch (err) {
      setError(err.message)
    }
  }
  const editForm = (person) => editing?.id === person.id && (
    <div className="link-editor">
      <div className="row-actions">
        <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Full name" />
        {user.role === 'OWNER' && <input type="email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} placeholder="Email" />}
        <button onClick={saveEdit}>Save</button>
        <button className="ghost" onClick={() => setEditing(null)}>Cancel</button>
      </div>
    </div>
  )

  const changeRole = async (person, role) => {
    if (role === person.role) return
    const label = { TEACHER: 'a teacher', STUDENT: 'a student', PARTNER: 'a partner (same access as you, cannot change roles)' }[role]
    if (!window.confirm(`Make ${person.name} ${label}?`)) return
    setError('')
    try {
      await api.setUserRole(person.id, role)
      await refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  const removePerson = async (id, name, role) => {
    const consequence = role === 'STUDENT'
      ? 'This deletes their account, progress, boards and writing — it cannot be undone.'
      : role === 'TEACHER'
        ? 'This deletes their account and every classroom they taught, including those students\' boards and writing — it cannot be undone.'
        : 'This deletes their account — it cannot be undone.'
    if (!window.confirm(`Remove ${name}? ${consequence}`)) return
    try {
      await api.deleteUser(id)
      await refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) return <div className="centered">Loading…</div>

  // One search for every list here: a name or an email.
  const q = query.trim().toLowerCase()
  const found = people.filter((p) => matchesSearch(q, p.name, p.email))
  const staff = found.filter((p) => p.role !== 'STUDENT')
  const students = found.filter((p) => p.role === 'STUDENT' && !p.free)
  // Signed up in the app, no teacher yet; trial-lesson requests first.
  const freeUsers = found.filter((p) => p.role === 'STUDENT' && p.free)
    .sort((a, b) => (b.trialRequestedAt ?? '').localeCompare(a.trialRequestedAt ?? '') || b.createdAt.localeCompare(a.createdAt))
  const requests = freeUsers.filter((p) => p.trialRequestedAt).length

  const admin = ['OWNER', 'PARTNER'].includes(user.role)
  // The student's cabinets (board, Writing, lessons paid…): with a current
  // teacher first (mine before others), then old ones kept as history.
  const teacherName = (id) => teachers.find((t) => t.id === id)?.name ?? 'the teacher'
  const cabinetsOf = (person) => {
    const current = new Set(person.teachers?.map((t) => t.id))
    return [...(person.classrooms ?? [])]
      .map((c) => ({ ...c, current: current.has(c.teacherId), teacher: teacherName(c.teacherId) }))
      .sort((a, b) => (b.current - a.current) || ((b.teacherId === user.id) - (a.teacherId === user.id)))
  }
  // Only the administrator hands out roles.
  const roleSelect = (person) => user.role === 'OWNER' && (
    <select
      value={person.role}
      onChange={(e) => changeRole(person, e.target.value)}
      title="Change role"
    >
      <option value="TEACHER">Teacher</option>
      <option value="STUDENT">Student</option>
      <option value="PARTNER">Partner</option>
    </select>
  )

  // One row per person, used in their own panel and in the search results.
  const staffRow = (person) => (
            <div key={person.id} className="row column">
             <div className="row-main">
              <div>
                <PersonLink id={person.id} name={person.name} />
                <div className="muted">
                  {person.email} · {person.role === 'OWNER' ? 'administrator' : person.role.toLowerCase()}
                  {person.students?.length > 0 && ` · ${person.students.length} students`}
                </div>
              </div>
              <div className="row-actions">
                <Link className="button-link" style={{ marginTop: 0 }} to={`/people/teachers/${person.id}`}>Lessons</Link>
              {person.id !== user.id && (user.role === 'OWNER' || person.role === 'TEACHER') && (
                <>
                  {user.role === 'OWNER' && <button className="ghost" onClick={() => navigate(`/people/${person.id}/activity`)} title="Sections opened, practice, words, lessons, reports">Activity</button>}
                  {roleSelect(person)}
                  <button className="ghost" onClick={() => setEditing(editing?.id === person.id ? null : { id: person.id, name: person.name, email: person.email })}>
                    {editing?.id === person.id ? 'Close' : 'Edit'}
                  </button>
                  <button className="ghost" onClick={() => removePerson(person.id, person.name, person.role)}>
                    Remove
                  </button>
                </>
              )}
              </div>
             </div>
             {editForm(person)}
            </div>
  )
  const freeRow = (person) => (
              <div key={person.id} className="row column">
                <div className="row-main">
                  <div>
                    <PersonLink id={person.id} name={person.name} />
                    <div className="muted">{person.email} · signed up {new Date(person.createdAt).toLocaleDateString()}</div>
                    <div className="muted">
                      {person.plan
                        ? <span className="paid-badge active">{PLAN_NAMES[person.plan.id]} until {new Date(person.plan.until).toLocaleDateString()}{person.plan.source === 'manual' ? ' · by card' : ' · Stripe'}</span>
                        : person.courses?.length ? null : 'Free plan'}
                    </div>
                    {person.courses?.map((c) => <CourseBadge key={c.title} course={c} />)}
                    {person.trialRequestedAt && (
                      <div className="free-request">
                        <span className="paid-badge active">Trial lesson requested {new Date(person.trialRequestedAt).toLocaleDateString()}</span>
                        {person.trialRequestNote && <div>{person.trialRequestNote}</div>}
                      </div>
                    )}
                  </div>
                  <div className="row-actions">
                    <button onClick={() => setLinking(linking === person.id ? null : person.id)}>
                      {linking === person.id ? 'Close' : 'Make a student'}
                    </button>
                    {user.role === 'OWNER' && person.plan?.source !== 'stripe' && (
                      <button className="ghost" onClick={() => setPlanFor(planFor?.id === person.id ? null : { id: person.id, plan: person.plan?.id ?? 'all', until: person.plan ? person.plan.until.slice(0, 10) : monthAhead() })}>
                        {planFor?.id === person.id ? 'Close' : person.plan ? 'Change plan' : 'Paid by card'}
                      </button>
                    )}
                    {user.role === 'OWNER' && <button className="ghost" onClick={() => navigate(`/people/${person.id}/activity`)}>Activity</button>}
                    <button className="ghost" onClick={() => removePerson(person.id, person.name, person.role)}>Remove</button>
                  </div>
                </div>
                {planFor?.id === person.id && (
                  <div className="link-editor">
                    <div className="muted">Paid outside Stripe (a card in roubles): open the plan by hand.</div>
                    <div className="row-actions">
                      <select value={planFor.plan} onChange={(e) => setPlanFor({ ...planFor, plan: e.target.value })}>
                        {Object.entries(PLAN_NAMES).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                      </select>
                      <label className="muted">until <input type="date" value={planFor.until} onChange={(e) => setPlanFor({ ...planFor, until: e.target.value })} /></label>
                      <button onClick={() => saveManualPlan(person.id, planFor.plan, planFor.until)}>Save</button>
                      {person.plan && <button className="ghost" onClick={() => saveManualPlan(person.id, null)}>End plan</button>}
                    </div>
                  </div>
                )}
                {linking === person.id && (
                  <div className="link-editor">
                    <div className="muted">Their teacher:</div>
                    <div className="row-actions">
                      {teachers.map((teacher) => (
                        <button key={teacher.id} className="ghost" onClick={() => link(person.id, teacher.id)}>
                          {teacher.name}{teacher.id === user.id ? ' (me)' : ''}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
  )
  const studentRow = (person) => {
            const cabinets = cabinetsOf(person)
            return (
            <div key={person.id} className="row column">
              <div className="row-main">
                <div>
                  {cabinets[0]
                    ? <Link className="person-link" to={`/classroom/${cabinets[0].id}`} title="Cabinet: board, payment, lessons, teachers, statistics"><strong>{person.name}</strong></Link>
                    : <PersonLink id={person.id} name={person.name} />}
                  {person.trialReportPending && cabinets[0] && (
                    <Link className="activity-tag bad" style={{ marginLeft: 8 }} to={`/classroom/${cabinets[0].id}?trial=1`} title="The trial lesson is over; its report hasn't been sent">report not sent</Link>
                  )}
                  <div className="muted">{person.username ? `логин ${person.username}${person.contact ? ` · ${person.contact}` : ""}` : person.email}</div>
                  <div className="muted">
                    {person.teachers?.length
                      ? `Studies with: ${person.teachers.map((t) => t.name).join(', ')}`
                      : 'Not linked to a teacher'}
                  </div>
                </div>
                <div className="row-actions">
                  {roleSelect(person)}
                  <button className="ghost" onClick={() => setEditing(editing?.id === person.id ? null : { id: person.id, name: person.name, email: person.email })}>
                    {editing?.id === person.id ? 'Close' : 'Edit'}
                  </button>
                  {admin && <button
                    className="ghost"
                    onClick={() => setLinking(linking === person.id ? null : person.id)}
                  >
                    {linking === person.id ? 'Close' : 'Teachers'}
                  </button>}
                  {user.role === 'OWNER' && (
                    <button className="ghost" onClick={() => removePerson(person.id, person.name, person.role)}>
                      Remove
                    </button>
                  )}
                </div>
              </div>

              {editForm(person)}
              {linking === person.id && <TeacherEditor person={person} teachers={teachers} onChanged={refresh} />}
            </div>
            )
  }
  const ROLE_LABEL = { OWNER: 'Team · administrator', PARTNER: 'Team · partner', TEACHER: 'Team · teacher' }
  const sectionOf = (p) => ROLE_LABEL[p.role] ?? (p.free ? 'Free app user' : 'Student')

  return (
    <div className="page">
      <Nav title="People" />

      {error && <div className="error">{error}</div>}

      <input className="home-search" type="search" placeholder="Search people by name or email" value={query} onChange={(e) => setQuery(e.target.value)} />

      {/* While searching, the matches come first — right under the box —
          and the rest of the page waits until the search is cleared. */}
      {q && (
        <section className="search-results">
          <div className="muted" style={{ marginBottom: 8 }}>
            {found.length ? `Found ${found.length}` : 'Nobody found'} ·{' '}
            <button type="button" className="link-button" onClick={() => setQuery('')}>Clear search</button>
          </div>
          <div className="list">
            {found.map((person) => (
              <div key={person.id}>
                <div className="muted" style={{ fontSize: 12, margin: '6px 0 2px' }}>{sectionOf(person)}</div>
                {person.role !== 'STUDENT' ? staffRow(person) : person.free ? freeRow(person) : studentRow(person)}
              </div>
            ))}
          </div>
        </section>
      )}

      {!mail.enabled && (
        <div className="notice">
          Email delivery is off — invitations still work, but you need to send the link yourself.
        </div>
      )}

      {delivery?.telegram && (
        <div className="notice">
          Приглашение создано. Перешлите эту ссылку ученику в Telegram {delivery.telegram} — по ней он придумает логин и пароль:{' '}
          <code className="invite-link">{delivery.link}</code>{' '}
          <button type="button" className="link-button" onClick={() => navigator.clipboard?.writeText(delivery.link)}>Копировать</button>{' · '}
          <a href={`https://t.me/${delivery.telegram.replace(/^@/, '')}`} target="_blank" rel="noreferrer">Открыть чат с {delivery.telegram}</a>
        </div>
      )}
      {delivery && !delivery.telegram && (
        <div className={delivery.sent ? 'notice' : 'error'}>
          {delivery.sent
            ? 'Invitation email sent.'
            : `Email not sent (${delivery.reason}). Copy the link below and send it yourself.`}
        </div>
      )}

      {!q && (<>
      {funnel.length > 0 && (
        <Panel id="people:trial-funnel" title="Пробные уроки с сайта" count={funnel.filter((t) => !t.isTest).length} hint="запись → пришёл → отчёт → оплата" defaultOpen>
          <TrialFunnel trials={funnel} onRemove={['OWNER', 'PARTNER'].includes(user.role) ? removeBooking : null} onMerge={user.role === 'OWNER' ? mergeBooking : null} />
        </Panel>
      )}

      {contacts.length > 0 && (
        <Panel id="people:trial-contacts" title="Архив пробных — для повторных контактов" count={contacts.length}>
          <TrialContacts contacts={contacts} />
        </Panel>
      )}

      {trialReports.length > 0 && (
        <Panel id="people:trial-reports" title="Trial reports" count={trialReports.length} hint={`${trialReports.filter((r) => !r.publishedAt).length} not sent`} defaultOpen={trialReports.some((r) => !r.publishedAt)}>
          <TrialReportList reports={trialReports} onRemoved={(id) => setTrialReports((list) => list.filter((r) => r.id !== id))} />
        </Panel>
      )}

      <Panel id="people:invite-teacher" title="Invite a teacher">
        <InviteForm role="TEACHER" teachers={teachers} currentUserId={user.id} onInvited={handleInvited} />
      </Panel>

      <Panel id="people:invite-student" title="Invite a student" defaultOpen>
        <p className="muted" style={{ marginBottom: 10 }}>
          The student is linked to the teacher you pick and will see that teacher's lessons.
        </p>
        <InviteForm role="STUDENT" teachers={teachers} currentUserId={user.id} onInvited={handleInvited} trialStudents={people.filter((p) => p.role === 'STUDENT' && p.viaLink)} />
      </Panel>

      {invites.length > 0 && (
        <Panel id="people:invites" title="Pending invitations" count={invites.length}>
          <p className="muted" style={{ marginBottom: 10 }}>
            {mail.enabled
              ? 'An email went out automatically. The link also works if you prefer to send it yourself.'
              : 'Send the link to the person yourself — by email or messenger.'}{' '}
            It works once and expires in 14 days.
          </p>
          <div className="list">
            {invites.map((invite) => (
              <div key={invite.id} className="row column">
                <div className="row-main">
                  <div>
                    <strong>{invite.name}</strong>
                    <div className="muted">
                      {invite.viaTelegram ? `Telegram ${invite.telegram ?? ''}` : invite.email} · {invite.role.toLowerCase()}
                      {invite.teacher && ` · with ${invite.teacher.name}`}
                    </div>
                  </div>
                  <div className="row-actions">
                    {mail.enabled && !invite.viaTelegram && (
                      <button className="ghost" onClick={() => resend(invite)} disabled={resending === invite.id}>
                        {resending === invite.id ? 'Sending…' : 'Resend email'}
                      </button>
                    )}
                    {invite.viaTelegram && invite.telegram && (
                      <a className="button-link" style={{ marginTop: 0 }} href={`https://t.me/${invite.telegram.replace(/^@/, '')}`} target="_blank" rel="noreferrer">Открыть чат</a>
                    )}
                    <button onClick={() => copyLink(invite)}>
                      {copied === invite.id ? 'Copied' : 'Copy link'}
                    </button>
                    <button className="ghost" onClick={() => revoke(invite.id)}>Revoke</button>
                  </div>
                </div>
                <code className="invite-link">{invite.link}</code>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Panel id="people:team" title="Team" count={staff.length} forceOpen={Boolean(q)}>
        <p className="muted" style={{ marginBottom: 10 }}>
          A partner has the same access as the administrator, except for changing roles.
        </p>
        <div className="list">
          {staff.map(staffRow)}
        </div>
      </Panel>

      {leads.length > 0 && (
        <Panel id="people:leads" title="Website requests" count={leads.filter((l) => !l.handled).length} defaultOpen={leads.some((l) => !l.handled)} hint="From the forms on the IELTS / TOEFL page and the home page (self-study on the platform).">
          <div className="list">
            {leads.map((lead) => (
              <div key={lead.id} className="row column" style={lead.handled ? { opacity: 0.6 } : undefined}>
                <div className="row-main">
                  <div>
                    <strong>{lead.name}</strong>
                    <div className="muted">
                      {[lead.messenger, lead.email].filter(Boolean).join(' · ')} · {new Date(lead.createdAt).toLocaleString()} · {{ platform: 'platform, self-study', toefl: 'TOEFL' }[lead.source] ?? 'IELTS / TOEFL'}
                    </div>
                    {lead.comment && <div style={{ marginTop: 6 }}>{lead.comment}</div>}
                  </div>
                  <div className="row-actions">
                    <button className="ghost" onClick={() => markLead(lead)}>{lead.handled ? 'Reopen' : 'Done'}</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {freeUsers.length > 0 && (
        <Panel id="people:free" title="Free app users" count={freeUsers.length} defaultOpen={requests > 0} forceOpen={Boolean(q)}
          hint={requests ? `${requests} asked for a trial lesson` : 'signed up in the app'}>
          <p className="muted" style={{ marginBottom: 10 }}>
            They signed up by themselves and use the free plan (the first grammar units, part of the vocabulary, the dictionary, the trainer's trial).
            Linking one to a teacher makes them a student: everything opens, the trainer included.
          </p>
          <div className="list">
            {freeUsers.map(freeRow)}
          </div>
        </Panel>
      )}

      {user.role === 'OWNER' && activity.length > 0 && (
        <Panel id="people:activity" title="Activity" count={activity.filter((p) => p.activeDays30 > 0).length} hint="active in the last 30 days · everyone who registered">
          <div className="list">
            {activity.map((p) => (
              <div key={p.id} className="row">
                <div>
                  <PersonLink id={p.id} name={p.name} /> <span className="muted">· {p.role === 'STUDENT' && p.free ? 'free app user' : p.role.toLowerCase()}</span>
                  <div className="muted">last seen {p.lastSeenAt ? new Date(p.lastSeenAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'not recorded yet'} · {p.activeDays30} active {p.activeDays30 === 1 ? 'day' : 'days'} in 30</div>
                </div>
                <button className="ghost" onClick={() => navigate(`/people/${p.id}/activity`)}>Activity</button>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Panel id="people:students" title="Students" count={students.length} defaultOpen>
        {students.length === 0 && <p className="muted">No students yet. Send an invitation above — the student sets a password from the link and appears here.</p>}

        <div className="list">
          {students.map(studentRow)}
        </div>
      </Panel>
      </>)}
      <SiteFooter />
    </div>
  )
}
