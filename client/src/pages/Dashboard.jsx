import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { api } from '../api'
import BillingEditor from '../components/BillingEditor'
import StudentPayment from '../components/StudentPayment'

const formatPrice = (amount, currency) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount / 100)

export default function Dashboard() {
  const { user, logout } = useAuth()
  const [lessons, setLessons] = useState([])
  const [people, setPeople] = useState([])
  const [newLesson, setNewLesson] = useState('')
  const [newPerson, setNewPerson] = useState({ name: '', email: '', role: 'STUDENT' })
  const [createdCredentials, setCreatedCredentials] = useState(null)
  const [error, setError] = useState('')
  const [editingBilling, setEditingBilling] = useState(null)
  const [paymentDetails, setPaymentDetails] = useState('')
  const [detailsSaved, setDetailsSaved] = useState(false)

  const isStaff = user.role === 'OWNER' || user.role === 'TEACHER'

  const refresh = async () => {
    const { lessons } = await api.listLessons()
    setLessons(lessons)
    if (isStaff) {
      const { users } = await api.listUsers()
      setPeople(users)
    }
    if (user.role === 'OWNER') {
      const { paymentDetails } = await api.schoolPaymentDetails()
      setPaymentDetails(paymentDetails ?? '')
    }
  }

  useEffect(() => {
    refresh().catch((err) => setError(err.message))
  }, [])

  const handleSaveDetails = async (event) => {
    event.preventDefault()
    setError('')
    try {
      await api.updateSchoolPaymentDetails({
        paymentDetails: paymentDetails.trim() === '' ? null : paymentDetails
      })
      setDetailsSaved(true)
      setTimeout(() => setDetailsSaved(false), 2500)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleCreateLesson = async (event) => {
    event.preventDefault()
    setError('')
    try {
      await api.createLesson({ title: newLesson })
      setNewLesson('')
      await refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleCreatePerson = async (event) => {
    event.preventDefault()
    setError('')
    try {
      const { user: created, tempPassword } = await api.createUser(newPerson)
      setCreatedCredentials({ email: created.email, password: tempPassword })
      setNewPerson({ name: '', email: '', role: 'STUDENT' })
      await refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleEnroll = async (lessonId, studentId) => {
    setError('')
    try {
      await api.addStudent(lessonId, studentId)
      await refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  const students = people.filter((person) => person.role === 'STUDENT')

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <strong>{user.schoolName ?? 'My school'}</strong>
          <span className="muted"> · {user.name} ({user.role.toLowerCase()})</span>
        </div>
        <button className="ghost" onClick={logout}>Sign out</button>
      </header>

      {error && <div className="error">{error}</div>}

      <section>
        <h2>Lessons</h2>
        {isStaff && (
          <form className="inline-form" onSubmit={handleCreateLesson}>
            <input
              placeholder="Lesson title"
              value={newLesson}
              onChange={(e) => setNewLesson(e.target.value)}
              required
            />
            <button type="submit">Create lesson</button>
          </form>
        )}

        {lessons.length === 0 && <p className="muted">No lessons yet.</p>}

        <div className="list">
          {lessons.map((lesson) => (
            <div key={lesson.id} className="row">
              <div>
                <strong>{lesson.title}</strong>
                <div className="muted">
                  Teacher: {lesson.teacher?.name}
                  {lesson.students?.length > 0 && ` · Students: ${lesson.students.map((s) => s.name).join(', ')}`}
                </div>
              </div>
              <div className="row-actions">
                {isStaff && students.length > 0 && (
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) handleEnroll(lesson.id, e.target.value)
                      e.target.value = ''
                    }}
                  >
                    <option value="">Add student…</option>
                    {students.map((student) => (
                      <option key={student.id} value={student.id}>{student.name}</option>
                    ))}
                  </select>
                )}
                <Link className="button" to={`/lesson/${lesson.id}`}>Join call</Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {isStaff && (
        <section>
          <h2>People</h2>
          <form className="inline-form" onSubmit={handleCreatePerson}>
            <input
              placeholder="Full name"
              value={newPerson.name}
              onChange={(e) => setNewPerson({ ...newPerson, name: e.target.value })}
              required
            />
            <input
              type="email"
              placeholder="Email"
              value={newPerson.email}
              onChange={(e) => setNewPerson({ ...newPerson, email: e.target.value })}
              required
            />
            <select
              value={newPerson.role}
              onChange={(e) => setNewPerson({ ...newPerson, role: e.target.value })}
            >
              <option value="STUDENT">Student</option>
              {user.role === 'OWNER' && <option value="TEACHER">Teacher</option>}
            </select>
            <button type="submit">Add</button>
          </form>

          {createdCredentials && (
            <div className="notice">
              Account created. Share these credentials — the password is shown only once:
              <br />
              <code>{createdCredentials.email}</code> · <code>{createdCredentials.password}</code>
              <button className="ghost" onClick={() => setCreatedCredentials(null)}>Dismiss</button>
            </div>
          )}

          <div className="list">
            {people.map((person) => {
              const isStudent = person.role === 'STUDENT'
              const active = person.paidUntil && new Date(person.paidUntil) >= new Date()

              return (
                <div key={person.id} className="row column">
                  <div className="row-main">
                    <div>
                      <strong>{person.name}</strong>
                      <div className="muted">
                        {person.email} · {person.role.toLowerCase()}
                        {isStudent && person.priceAmount != null &&
                          ` · ${formatPrice(person.priceAmount, person.priceCurrency)}`}
                      </div>
                      {isStudent && (
                        <div className={active ? 'paid-badge active' : 'paid-badge'}>
                          {active
                            ? `Paid until ${new Date(person.paidUntil).toLocaleDateString()}`
                            : person.paidUntil
                              ? `Expired ${new Date(person.paidUntil).toLocaleDateString()}`
                              : 'Not paid'}
                        </div>
                      )}
                    </div>

                    {isStudent && (
                      <button
                        className="ghost"
                        onClick={() =>
                          setEditingBilling(editingBilling === person.id ? null : person.id)
                        }
                      >
                        {editingBilling === person.id ? 'Close' : 'Payment'}
                      </button>
                    )}
                  </div>

                  {editingBilling === person.id && (
                    <BillingEditor
                      student={person}
                      onCancel={() => setEditingBilling(null)}
                      onSaved={async () => {
                        setEditingBilling(null)
                        await refresh()
                      }}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {user.role === 'OWNER' && (
        <section>
          <h2>Bank transfer details</h2>
          <p className="muted">Shown only to signed-in students of your school.</p>
          <form onSubmit={handleSaveDetails} className="details-form">
            <textarea
              rows={4}
              placeholder={'Card 0000 0000 0000 0000\nGalina S., Tinkoff\nPlease add your name to the transfer comment'}
              value={paymentDetails}
              onChange={(e) => setPaymentDetails(e.target.value)}
            />
            <div className="editor-actions">
              <button type="submit">Save details</button>
              {detailsSaved && <span className="muted">Saved</span>}
            </div>
          </form>
        </section>
      )}

      {user.role === 'STUDENT' && <StudentPayment />}
    </div>
  )
}
