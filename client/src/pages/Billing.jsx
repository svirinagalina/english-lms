import { useEffect, useState } from 'react'
import { useAuth } from '../AuthContext'
import { api } from '../api'
import Nav from '../components/Nav'
import Panel from '../components/Panel'
import { parseDetails, serializeDetails, emptyDetails, formatCard, parseExtraCards, MAIN_CARD_NAME, TRIAL_CARD_NAME } from '../utils/paymentDetails'
import { SiteFooter } from '../components/Brand'
import StudentSettings from '../components/StudentSettings'
import StudentPayment from '../components/StudentPayment'
import { isNativeApp } from '../utils/native'
import { PackageBadge } from '../components/PackageBadge'
import PersonLink from '../components/PersonLink'
import RecentPayments from '../components/RecentPayments'

const formatPrice = (amount, currency) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount / 100)

export default function Billing() {
  const { user } = useAuth()
  const [students, setStudents] = useState([])
  const [editing, setEditing] = useState(null)
  const [details, setDetails] = useState(emptyDetails())
  // The rouble card shown instead to students after a trial lesson.
  const [trialCard, setTrialCard] = useState({ card: '', cardNote: '', cardName: '' })
  const [extraCards, setExtraCards] = useState([])
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const isStaff = user.role !== 'STUDENT'

  const refresh = async () => {
    if (!isStaff) return
    const { students } = await api.billingStudents()
    setStudents(students)

    if (user.role === 'OWNER' || user.role === 'PARTNER') {
      const { paymentDetails, trialPaymentDetails, extraPaymentCards } = await api.schoolPaymentDetails()
      setExtraCards(parseExtraCards(extraPaymentCards))
      setDetails(parseDetails(paymentDetails))
      try { const t = JSON.parse(trialPaymentDetails ?? 'null'); setTrialCard({ card: t?.card ?? '', cardNote: t?.cardNote ?? '', cardName: t?.cardName ?? '' }) } catch { /* none */ }
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
        paymentDetails: serializeDetails(details),
        trialPaymentDetails: trialCard.card.replace(/\D/g, '') ? JSON.stringify({ card: trialCard.card.replace(/\D/g, ''), cardNote: trialCard.cardNote.trim(), cardName: trialCard.cardName.trim() }) : null,
        extraPaymentCards: JSON.stringify(extraCards
          .map((c) => ({ id: c.id, name: (c.name ?? '').trim(), card: (c.card ?? '').replace(/\D/g, ''), cardNote: (c.cardNote ?? '').trim() }))
          .filter((c) => c.card))
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

      {(user.role === 'OWNER' || user.role === 'PARTNER') && (
        <Panel id="billing:recent" title="Recent payments" hint="every payment of the school in one list">
          <RecentPayments />
        </Panel>
      )}

      <Panel id="billing:students" title="Students" count={students.length} defaultOpen>
        <p className="muted" style={{ marginBottom: 10 }}>
          {user.role === 'OWNER' || user.role === 'PARTNER'
            ? 'Payment is per lesson: set the price and how many lessons are paid. Every call with the student uses one lesson up.'
            : 'How many lessons each student has paid for and held. Every lesson uses one up.'}
        </p>
        {students.length === 0 && <p className="muted">No students yet.</p>}

        <div className="list">
          {students.map((student) => (
            <div key={student.id} className="row column">
              <div className="row-main">
                <div>
                  <PersonLink id={student.id} name={student.name} />
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
                <StudentSettings studentId={student.id} onChanged={refresh} />
              )}
            </div>
          ))}
        </div>
      </Panel>

      {(user.role === 'OWNER' || user.role === 'PARTNER') && (
        <Panel id="billing:cards" title="Cards and bank details" hint="numbers and names of the cards; each student's card is chosen in their cabinet">
          <p className="muted">Shown only to signed-in students of your school.</p>
          <form onSubmit={saveDetails} className="details-form">
            <h3 style={{ margin: '8px 0 4px' }}>{details.cardName || MAIN_CARD_NAME}</h3>
            <p className="muted" style={{ margin: '0 0 8px' }}>The main card: every student pays here unless their card is set to another one.</p>
            <label className="field">
              <span>Card name (only staff see it)</span>
              <input placeholder={MAIN_CARD_NAME} value={details.cardName} onChange={(e) => setDetails({ ...details, cardName: e.target.value })} maxLength={40} />
            </label>
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
              <span>Note for students</span>
              <textarea rows={2} placeholder="Please add your name to the transfer comment" value={details.note} onChange={(e) => setDetails({ ...details, note: e.target.value })} />
            </label>
            <h3 style={{ margin: '18px 0 4px' }}>{trialCard.cardName || TRIAL_CARD_NAME}</h3>
            <p className="muted" style={{ margin: '0 0 8px' }}>Students who have had a trial lesson (their report is published) see this card for payments in rubles instead. Leave empty to show the main card to everyone.</p>
            <label className="field">
              <span>Card name (only staff see it)</span>
              <input placeholder={TRIAL_CARD_NAME} value={trialCard.cardName} onChange={(e) => setTrialCard({ ...trialCard, cardName: e.target.value })} maxLength={40} />
            </label>
            <label className="field">
              <span>Card number (rubles, after a trial)</span>
              <input inputMode="numeric" placeholder="2200 0000 0000 0000" value={formatCard(trialCard.card)} onChange={(e) => setTrialCard({ ...trialCard, card: e.target.value.replace(/\D/g, '').slice(0, 19) })} />
            </label>
            <label className="field">
              <span>Card holder / bank</span>
              <input placeholder="Name, bank" value={trialCard.cardNote} onChange={(e) => setTrialCard({ ...trialCard, cardNote: e.target.value })} maxLength={120} />
            </label>
            <h3 style={{ margin: '18px 0 4px' }}>Stripe (online, in euro)</h3>
            <p className="muted" style={{ margin: '0 0 8px' }}>
              Card payments from abroad, Apple Pay and Google Pay. Students with a lesson price and a package size get a button with the amount filled in, and the lessons are added by themselves; others pay by this link and you add the lessons. A student set to «Stripe» in their cabinet (Pays to) sees only online payment, no rouble card.
            </p>
            <label className="field">
              <span>Stripe payment link (for students without a price set)</span>
              <input type="url" placeholder="https://buy.stripe.com/…" value={details.link} onChange={(e) => setDetails({ ...details, link: e.target.value })} />
            </label>
            {extraCards.map((c, i) => {
              const change = (key) => (e) => setExtraCards((list) => list.map((x, j) => (j === i ? { ...x, [key]: key === 'card' ? e.target.value.replace(/\D/g, '').slice(0, 19) : e.target.value } : x)))
              return (
                <div key={c.id}>
                  <h3 style={{ margin: '18px 0 4px' }}>{c.name || 'New card'}</h3>
                  <p className="muted" style={{ margin: '0 0 8px' }}>Used only for students whose card is set to it (Payments → a student → Edit → Pays to).</p>
                  <label className="field">
                    <span>Card name (only staff see it)</span>
                    <input placeholder="Dmitry card" value={c.name ?? ''} onChange={change('name')} maxLength={40} />
                  </label>
                  <label className="field">
                    <span>Card number</span>
                    <input inputMode="numeric" placeholder="2200 0000 0000 0000" value={formatCard(c.card)} onChange={change('card')} />
                  </label>
                  <label className="field">
                    <span>Card holder / bank</span>
                    <input placeholder="Name, bank" value={c.cardNote ?? ''} onChange={change('cardNote')} maxLength={120} />
                  </label>
                  <button type="button" className="ghost" onClick={() => setExtraCards((list) => list.filter((_, j) => j !== i))}>Remove this card</button>
                </div>
              )
            })}
            <button type="button" className="ghost" style={{ marginTop: 14 }} onClick={() => setExtraCards((list) => [...list, { id: Math.random().toString(36).slice(2, 10), name: '', card: '', cardNote: '' }])}>+ Add a card</button>
            <div className="editor-actions">
              {user.role === 'OWNER' ? <button type="submit">Save details</button> : <span className="muted">Only the administrator can change the cards.</span>}
              {saved && <span className="muted">Saved</span>}
            </div>
          </form>
        </Panel>
      )}
      <SiteFooter />
    </div>
  )
}
