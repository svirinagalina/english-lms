import { useEffect, useState } from 'react'
import { useAuth } from '../AuthContext'
import { api } from '../api'
import Nav from '../components/Nav'

function InviteForm({ role, teachers, currentUserId, onInvited }) {
  const [form, setForm] = useState({ name: '', email: '', teacherId: currentUserId })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { invite } = await api.createInvite({
        name: form.name,
        email: form.email,
        role,
        ...(role === 'STUDENT' ? { teacherId: form.teacherId } : {})
      })
      setForm({ name: '', email: '', teacherId: currentUserId })
      onInvited(invite)
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

export default function People() {
  const { user } = useAuth()
  const [people, setPeople] = useState([])
  const [teachers, setTeachers] = useState([])
  const [invites, setInvites] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(null)
  const [linking, setLinking] = useState(null)

  const refresh = async () => {
    const [peopleResult, invitesResult, teachersResult] = await Promise.all([
      api.listPeople(),
      api.listInvites(),
      api.listTeachers()
    ])
    setPeople(peopleResult.people)
    setInvites(invitesResult.invites)
    setTeachers(teachersResult.teachers)
  }

  useEffect(() => {
    refresh().catch((err) => setError(err.message)).finally(() => setLoading(false))
  }, [])

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

  const removePerson = async (id, name) => {
    if (!window.confirm(`Remove ${name}? This deletes their account and progress.`)) return
    try {
      await api.deleteUser(id)
      await refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) return <div className="centered">Loading…</div>

  const staff = people.filter((p) => p.role !== 'STUDENT')
  const students = people.filter((p) => p.role === 'STUDENT')

  return (
    <div className="page">
      <Nav title="People" />

      {error && <div className="error">{error}</div>}

      <section>
        <h2>Invite a teacher</h2>
        <InviteForm role="TEACHER" teachers={teachers} currentUserId={user.id} onInvited={refresh} />
      </section>

      <section>
        <h2>Invite a student</h2>
        <p className="muted" style={{ marginBottom: 10 }}>
          The student is linked to the teacher you pick and will see that teacher's lessons.
        </p>
        <InviteForm role="STUDENT" teachers={teachers} currentUserId={user.id} onInvited={refresh} />
      </section>

      {invites.length > 0 && (
        <section>
          <h2>Pending invitations</h2>
          <p className="muted" style={{ marginBottom: 10 }}>
            Send the link to the person yourself — by email or messenger. It works once and expires in 14 days.
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
        </section>
      )}

      <section>
        <h2>Teachers</h2>
        <div className="list">
          {staff.map((person) => (
            <div key={person.id} className="row">
              <div>
                <strong>{person.name}</strong>
                <div className="muted">
                  {person.email} · {person.role.toLowerCase()}
                  {person.students?.length > 0 && ` · ${person.students.length} students`}
                </div>
              </div>
              {person.id !== user.id && (
                <button className="ghost" onClick={() => removePerson(person.id, person.name)}>
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>Students</h2>
        {students.length === 0 && <p className="muted">No students yet.</p>}

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
                  <button
                    className="ghost"
                    onClick={() => setLinking(linking === person.id ? null : person.id)}
                  >
                    {linking === person.id ? 'Close' : 'Change teacher'}
                  </button>
                  <button className="ghost" onClick={() => removePerson(person.id, person.name)}>
                    Remove
                  </button>
                </div>
              </div>

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
      </section>
    </div>
  )
}
