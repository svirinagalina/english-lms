import { useEffect, useState } from 'react'
import { useAuth } from '../AuthContext'
import { api } from '../api'
import Nav from '../components/Nav'
import { SiteFooter } from '../components/Brand'
import BillingEditor from '../components/BillingEditor'
import StudentPayment from '../components/StudentPayment'

const formatPrice = (amount, currency) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount / 100)

export default function Billing() {
  const { user } = useAuth()
  const [students, setStudents] = useState([])
  const [editing, setEditing] = useState(null)
  const [details, setDetails] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const isStaff = user.role !== 'STUDENT'

  const refresh = async () => {
    if (!isStaff) return
    const { people } = await api.listPeople()
    setStudents(people.filter((person) => person.role === 'STUDENT'))

    if (user.role === 'OWNER' || user.role === 'PARTNER') {
      const { paymentDetails } = await api.schoolPaymentDetails()
      setDetails(paymentDetails ?? '')
    }
  }

  useEffect(() => {
    refresh().catch((err) => setError(err.message)).finally(() => setLoading(false))
  }, [])

  const saveDetails = async (event) => {
    event.preventDefault()
    setError('')
    try {
      await api.updateSchoolPaymentDetails({
        paymentDetails: details.trim() === '' ? null : details
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) return <div className="centered">Loading…</div>

  if (!isStaff) {
    return (
      <div className="page">
        <Nav title="Payment" />
        <StudentPayment />
      </div>
    )
  }

  return (
    <div className="page">
      <Nav title="Payments" />

      {error && <div className="error">{error}</div>}

      <section>
        <h2>Students</h2>
        {students.length === 0 && <p className="muted">No students yet.</p>}

        <div className="list">
          {students.map((student) => {
            const active = student.paidUntil && new Date(student.paidUntil) >= new Date()

            return (
              <div key={student.id} className="row column">
                <div className="row-main">
                  <div>
                    <strong>{student.name}</strong>
                    <div className="muted">
                      {student.email}
                      {student.priceAmount != null &&
                        ` · ${formatPrice(student.priceAmount, student.priceCurrency)}`}
                    </div>
                    <div className={active ? 'paid-badge active' : 'paid-badge'}>
                      {active
                        ? `Paid until ${new Date(student.paidUntil).toLocaleDateString()}`
                        : student.paidUntil
                          ? `Expired ${new Date(student.paidUntil).toLocaleDateString()}`
                          : 'Not paid'}
                    </div>
                  </div>
                  <button
                    className="ghost"
                    onClick={() => setEditing(editing === student.id ? null : student.id)}
                  >
                    {editing === student.id ? 'Close' : 'Edit'}
                  </button>
                </div>

                {editing === student.id && (
                  <BillingEditor
                    student={student}
                    onCancel={() => setEditing(null)}
                    onSaved={async () => {
                      setEditing(null)
                      await refresh()
                    }}
                  />
                )}
              </div>
            )
          })}
        </div>
      </section>

      {(user.role === 'OWNER' || user.role === 'PARTNER') && (
        <section>
          <h2>Bank transfer details</h2>
          <p className="muted">Shown only to signed-in students of your school.</p>
          <form onSubmit={saveDetails} className="details-form">
            <textarea
              rows={4}
              placeholder={'Card 0000 0000 0000 0000\nGalina S., Tinkoff\nPlease add your name to the transfer comment'}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
            />
            <div className="editor-actions">
              <button type="submit">Save details</button>
              {saved && <span className="muted">Saved</span>}
            </div>
          </form>
        </section>
      )}
      <SiteFooter />
    </div>
  )
}
