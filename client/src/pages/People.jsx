import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { api } from '../api'
import { matchesSearch } from '../utils/search'
import Nav from '../components/Nav'
import Panel from '../components/Panel'
import { SiteFooter } from '../components/Brand'

function InviteForm({ role, teachers, currentUserId, onInvited }) {
  const [form, setForm] = useState({ name: '', email: '', teacherId: currentUserId })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const result = await api.createInvite({
        name: form.name,
        email: form.email,
        role,
        ...(role === 'STUDENT' ? { teacherId: form.teacherId } : {})
      })
      setForm({ name: '', email: '', teacherId: currentUserId })
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
      <input
        placeholder="Full name"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        required
      />
      <input
        type="email"
        placeholder="Email"
        value={form.email}
        onChange={(e) => setForm({ ...form, email: e.target.value })}
        required
      />
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

export default function People() {
  const { user } = useAuth()
  const [people, setPeople] = useState([])
  const [teachers, setTeachers] = useState([])
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
  }

  useEffect(() => {
    refresh().catch((err) => setError(err.message)).finally(() => setLoading(false))
  }, [])

  const handleInvited = async (result) => {
    setDelivery(result?.delivery ?? null)
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

  const unlink = async (teacherId, studentId) => {
    await api.unlinkStudent(teacherId, studentId)
    await refresh()
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

  // The student's cabinet (board, Writing, lessons paid…): mine first.
  const cabinetOf = (person) => (person.classrooms?.find((c) => c.teacherId === user.id) ?? person.classrooms?.[0])?.id
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

  return (
    <div className="page">
      <Nav title="People" />

      {error && <div className="error">{error}</div>}

      <input className="home-search" type="search" placeholder="Search people by name or email" value={query} onChange={(e) => setQuery(e.target.value)} />

      {!mail.enabled && (
        <div className="notice">
          Email delivery is off — invitations still work, but you need to send the link yourself.
        </div>
      )}

      {delivery && (
        <div className={delivery.sent ? 'notice' : 'error'}>
          {delivery.sent
            ? 'Invitation email sent.'
            : `Email not sent (${delivery.reason}). Copy the link below and send it yourself.`}
        </div>
      )}

      <Panel id="people:invite-teacher" title="Invite a teacher">
        <InviteForm role="TEACHER" teachers={teachers} currentUserId={user.id} onInvited={handleInvited} />
      </Panel>

      <Panel id="people:invite-student" title="Invite a student" defaultOpen>
        <p className="muted" style={{ marginBottom: 10 }}>
          The student is linked to the teacher you pick and will see that teacher's lessons.
        </p>
        <InviteForm role="STUDENT" teachers={teachers} currentUserId={user.id} onInvited={handleInvited} />
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
                      {invite.email} · {invite.role.toLowerCase()}
                      {invite.teacher && ` · with ${invite.teacher.name}`}
                    </div>
                  </div>
                  <div className="row-actions">
                    {mail.enabled && (
                      <button className="ghost" onClick={() => resend(invite)} disabled={resending === invite.id}>
                        {resending === invite.id ? 'Sending…' : 'Resend email'}
                      </button>
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
          {staff.map((person) => (
            <div key={person.id} className="row column">
             <div className="row-main">
              <div>
                <strong>{person.name}</strong>
                <div className="muted">
                  {person.email} · {person.role === 'OWNER' ? 'administrator' : person.role.toLowerCase()}
                  {person.students?.length > 0 && ` · ${person.students.length} students`}
                </div>
              </div>
              {person.id !== user.id && (user.role === 'OWNER' || person.role === 'TEACHER') && (
                <div className="row-actions">
                  {roleSelect(person)}
                  <button className="ghost" onClick={() => setEditing(editing?.id === person.id ? null : { id: person.id, name: person.name, email: person.email })}>
                    {editing?.id === person.id ? 'Close' : 'Edit'}
                  </button>
                  <button className="ghost" onClick={() => removePerson(person.id, person.name, person.role)}>
                    Remove
                  </button>
                </div>
              )}
             </div>
             {editForm(person)}
            </div>
          ))}
        </div>
      </Panel>

      {freeUsers.length > 0 && (
        <Panel id="people:free" title="Free app users" count={freeUsers.length} defaultOpen={requests > 0} forceOpen={Boolean(q)}
          hint={requests ? `${requests} asked for a trial lesson` : 'signed up in the app'}>
          <p className="muted" style={{ marginBottom: 10 }}>
            They signed up by themselves and use the free plan (the first grammar units, part of the vocabulary, the dictionary, the trainer's trial).
            Linking one to a teacher makes them a student: everything opens, the trainer included.
          </p>
          <div className="list">
            {freeUsers.map((person) => (
              <div key={person.id} className="row column">
                <div className="row-main">
                  <div>
                    <strong>{person.name}</strong>
                    <div className="muted">{person.email} · signed up {new Date(person.createdAt).toLocaleDateString()}</div>
                    <div className="muted">
                      {person.plan
                        ? <span className="paid-badge active">{PLAN_NAMES[person.plan.id]} until {new Date(person.plan.until).toLocaleDateString()}{person.plan.source === 'manual' ? ' · by card' : ' · Stripe'}</span>
                        : 'Free plan'}
                    </div>
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
            ))}
          </div>
        </Panel>
      )}

      <Panel id="people:students" title="Students" count={students.length} defaultOpen>
        {students.length === 0 && <p className="muted">No students yet. Send an invitation above — the student sets a password from the link and appears here.</p>}

        <div className="list">
          {students.map((person) => (
            <div key={person.id} className="row column">
              <div className="row-main">
                <div>
                  <strong>{person.name}</strong>
                  <div className="muted">{person.email}</div>
                  <div className="muted">
                    {person.teachers?.length
                      ? `Studies with: ${person.teachers.map((t) => t.name).join(', ')}`
                      : 'Not linked to a teacher'}
                  </div>
                </div>
                <div className="row-actions">
                  {cabinetOf(person) && (
                    <button onClick={() => navigate(`/classroom/${cabinetOf(person)}`)} title="Board, Writing, lessons paid and held">Open cabinet</button>
                  )}
                  {roleSelect(person)}
                  <button className="ghost" onClick={() => setEditing(editing?.id === person.id ? null : { id: person.id, name: person.name, email: person.email })}>
                    {editing?.id === person.id ? 'Close' : 'Edit'}
                  </button>
                  {user.role === 'OWNER' && <button
                    className="ghost"
                    onClick={() => setLinking(linking === person.id ? null : person.id)}
                  >
                    {linking === person.id ? 'Close' : 'Change teacher'}
                  </button>}
                  {user.role === 'OWNER' && (
                    <button className="ghost" onClick={() => removePerson(person.id, person.name, person.role)}>
                      Remove
                    </button>
                  )}
                </div>
              </div>

              {editForm(person)}
              {linking === person.id && (
                <div className="link-editor">
                  <div className="muted">Link to:</div>
                  <div className="row-actions">
                    {teachers.map((teacher) => {
                      const linked = person.teachers?.some((t) => t.id === teacher.id)
                      return (
                        <button
                          key={teacher.id}
                          className={linked ? '' : 'ghost'}
                          onClick={() =>
                            linked ? unlink(teacher.id, person.id) : link(person.id, teacher.id)
                          }
                        >
                          {teacher.name}{teacher.id === user.id ? ' (me)' : ''}{linked ? ' ✓' : ''}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </Panel>
      <SiteFooter />
    </div>
  )
}
