import { useEffect, useState } from 'react'
import { useAuth } from '../AuthContext'
import { api } from '../api'
import Nav from '../components/Nav'
import Panel from '../components/Panel'
import { parseDetails, serializeDetails, emptyDetails, formatCard } from '../utils/paymentDetails'
import { SiteFooter } from '../components/Brand'
import BillingEditor from '../components/BillingEditor'
import StudentPayment from '../components/StudentPayment'
import { isNativeApp } from '../utils/native'
import { PackageBadge } from '../components/PackageBadge'

const formatPrice = (amount, currency) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount / 100)

export default function Billing() {
  const { user } = useAuth()
  const [students, setStudents] = useState([])
  const [editing, setEditing] = useState(null)
  const [details, setDetails] = useState(emptyDetails())
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const isStaff = user.role !== 'STUDENT'

  const refresh = async () => {
    if (!isStaff) return
    const { students } = await api.billingStudents()
    setStudents(students)

    if (user.role === 'OWNER' || user.role === 'PARTNER') {
      const { paymentDetails } = await api.schoolPaymentDetails()
      setDetails(parseDetails(paymentDetails))
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
        paymentDetails: serializeDetails(details)
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
        <Nav title={isNativeApp() ? 'Lessons' : 'Payment'} />
        <StudentPayment lessonsOnly={isNativeApp()} />
      </div>
    )
  }

  return (
    <div className="page">
      <Nav title="Payments" />

      {error && <div className="error">{error}</div>}

      <Panel id="billing:students" title="Students" count={students.length} defaultOpen>
        <p className="muted" style={{ marginBottom: 10 }}>
          Payment is per lesson: set the price and how many lessons are paid. Every call with the student uses one lesson up.
        </p>
        {students.length === 0 && <p className="muted">No students yet — invite one in People, then set their price and lessons here.</p>}

        <div className="list">
          {students.map((student) => (
            <div key={student.id} className="row column">
              <div className="row-main">
                <div>
                  <strong>{student.name}</strong>
                  <div className="muted">
                    {student.email}
                    {student.priceAmount != null &&
                      ` · ${formatPrice(student.priceAmount, student.priceCurrency)} per lesson`}
                  </div>
                  <PackageBadge pkg={student.package} />
                  {student.paymentReportedAt && (
                    <div className="paid-badge mid" style={{ marginLeft: 8 }}>
                      Says they paid on {new Date(student.paymentReportedAt).toLocaleDateString()}
                      <button className="link-button" onClick={async () => { await api.paymentSeen(student.id); await refresh() }}>dismiss</button>
                    </div>
                  )}
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
          ))}
        </div>
      </Panel>

      {(user.role === 'OWNER' || user.role === 'PARTNER') && (
        <section>
          <h2>Bank transfer details</h2>
          <p className="muted">Shown only to signed-in students of your school.</p>
          <form onSubmit={saveDetails} className="details-form">
            <label className="field">
              <span>Card number (for payments in rubles)</span>
              <input
                inputMode="numeric"
                placeholder="2200 0000 0000 0000"
                value={formatCard(details.card)}
                onChange={(e) => setDetails({ ...details, card: e.target.value.replace(/\D/g, '').slice(0, 19) })}
              />
            </label>
            <label className="field">
              <span>Card holder / bank (shown next to the number)</span>
              <input placeholder="Galina S., Tinkoff" value={details.cardNote} onChange={(e) => setDetails({ ...details, cardNote: e.target.value })} maxLength={120} />
            </label>
            <label className="field">
              <span>Online payment link (Stripe, in euro)</span>
              <input type="url" placeholder="https://buy.stripe.com/…" value={details.link} onChange={(e) => setDetails({ ...details, link: e.target.value })} />
            </label>
            <label className="field">
              <span>Note for students</span>
              <textarea rows={2} placeholder="Please add your name to the transfer comment" value={details.note} onChange={(e) => setDetails({ ...details, note: e.target.value })} />
            </label>
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
