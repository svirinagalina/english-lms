import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../AuthContext'
import EditableName from './EditableName'
import { MAIN_CARD_NAME, TRIAL_CARD_NAME, parseDetails, parseExtraCards } from '../utils/paymentDetails'

// Everything about a student's lessons and money in one place, every field
// open: paid, held, left, the day the package counts from, the price, the
// rouble card, the teachers. The same block sits in the student's cabinet
// and on their person page, so it is edited the same way wherever one is.
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Moscow' })
const dayOf = (v) => (v ? new Date(v).toLocaleDateString('en-CA', { timeZone: 'Europe/Moscow' }) : '')

export default function StudentSettings({ studentId, onChanged, focus = false }) {
  const { user: me } = useAuth()
  const isOwner = me?.role === 'OWNER'
  const [student, setStudent] = useState(null)
  const [form, setForm] = useState(null)
  const [allTeachers, setAllTeachers] = useState([])
  const [cards, setCards] = useState({ main: MAIN_CARD_NAME, trial: TRIAL_CARD_NAME, extra: [] })
  const [addTeacher, setAddTeacher] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [payments, setPayments] = useState(null)
  // The student's personal bot link, for a parent's Telegram.
  const [botLink, setBotLink] = useState(null)

  const load = () => api.billingStudent(studentId).then(({ student }) => {
    setStudent(student)
    setForm({
      paid: student.package.lessonsPaid ?? '',
      size: student.packageSize ?? '',
      held: student.package.held,
      heldTouched: false,
      from: dayOf(student.package.startedAt),
      price: student.priceAmount == null ? '' : String(student.priceAmount / 100),
      currency: student.priceCurrency || 'RUB',
      card: student.payCardId ? `extra:${student.payCardId}` : student.paysTrialCardAuto ? 'auto' : student.payToTrialCard ? 'trial' : 'school',
      link: student.paymentLink ?? '',
      amount: '',
      note: ''
    })
    api.studentPayments(studentId).then(({ payments }) => setPayments(payments)).catch(() => setPayments([]))
  }).catch((err) => setError(err.message))
  useEffect(() => { load() }, [studentId])
  // Opened from a «Payment» link: bring this block into view.
  const ref = useRef(null)
  useEffect(() => { if (focus && form) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, [focus, Boolean(form)])
  useEffect(() => {
    api.schoolPaymentDetails().then(({ paymentDetails, trialPaymentDetails, extraPaymentCards }) => {
      // Only the cards' names here (Galina card, Maxim card…); the numbers live on the Payments page.
      const label = (name, fallback) => name || fallback
      const main = parseDetails(paymentDetails)
      const trial = parseDetails(trialPaymentDetails)
      setCards({
        main: label(main.cardName, MAIN_CARD_NAME),
        trial: label(trial.cardName, TRIAL_CARD_NAME),
        // Without a number the after-trial card falls back to the main one (as the server does).
        trialReady: Boolean(trial.card),
        extra: parseExtraCards(extraPaymentCards).filter((c) => c.id && c.card).map((c) => ({ id: c.id, label: label(c.name, 'Card') }))
      })
    }).catch(() => {})
  }, [])
  useEffect(() => { if (isOwner) api.listTeachers().then(({ teachers }) => setAllTeachers(teachers)).catch(() => {}) }, [isOwner])

  if (!form) return error ? <div className="error">{error}</div> : null
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value, ...(k === 'held' ? { heldTouched: true } : {}) }))
  const left = form.paid === '' ? null : Number(form.paid) - Number(form.held || 0)

  const after = async (message) => { await load(); await onChanged?.(); setSaved(message); setTimeout(() => setSaved(''), 3000) }
  const run = async (fn, message) => {
    setBusy(true); setError(''); setSaved('')
    try { await fn(); await after(message) } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  const save = (e) => {
    e.preventDefault()
    run(async () => {
      const price = form.price.trim() === '' ? null : Math.round(Number(form.price.replace(',', '.')) * 100)
      if (price != null && !Number.isFinite(price)) throw new Error('The price should be a number')
      const amount = form.amount.trim() === '' ? null : Math.round(Number(form.amount.replace(',', '.').replace(/\s/g, '')) * 100)
      if (amount != null && !Number.isFinite(amount)) throw new Error('The amount should be a number')
      const fromChanged = form.from !== dayOf(student.package.startedAt)
      await api.updateStudentBilling(studentId, {
        lessonsPaid: form.paid === '' ? null : Number(form.paid),
        packageSize: form.size === '' ? null : Number(form.size),
        ...(fromChanged ? { packageStartedAt: form.from || null } : {}),
        // Held as typed; after only a new start date it is recounted from the calls.
        ...(form.heldTouched || !fromChanged ? { held: Number(form.held) || 0 } : {}),
        priceAmount: price,
        priceCurrency: form.currency,
        ...(isOwner ? {
          payToTrialCard: form.card === 'auto' ? null : form.card === 'trial',
          payCardId: form.card.startsWith('extra:') ? form.card.slice(6) : null
        } : {}),
        paymentLink: form.link.trim() === '' ? null : form.link.trim(),
        paidAmount: amount,
        paidNote: form.note
      })
      if (student.paymentReportedAt) await api.paymentSeen(studentId).catch(() => {})
    }, 'Saved ✓')
  }
  const newPackage = () => setForm((f) => ({ ...f, from: today(), held: 0, heldTouched: true }))
  const others = allTeachers.filter((t) => !student.teachers.some((x) => x.id === t.id))

  return (
    <section className="student-settings" ref={ref}>
      <div className="ss-head">
        <div>
          <h3 style={{ margin: 0 }}>Lessons and payment</h3>
          <EditableName id={studentId} name={student.name} as="span" onSaved={async () => { await load(); await onChanged?.() }} />
        </div>
        {student.paymentReportedAt && <span className="paid-badge active">Says paid {new Date(student.paymentReportedAt).toLocaleDateString()}</span>}
      </div>
      {(() => {
        // What the student sees on their Payment page, in one line.
        const price = student.priceAmount != null ? student.priceAmount / 100 : null
        const money = (v) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: student.priceCurrency || 'RUB', maximumFractionDigits: 2 }).format(v)
        const card = (student.payCardId && cards.extra.find((c) => c.id === student.payCardId)?.label) || (student.paysTrialCard && cards.trialReady ? cards.trial : cards.main)
        const parts = [
          price != null ? `${money(price)} per lesson` : 'no price set',
          student.packageSize ? `package of ${student.packageSize} lessons${price != null ? ` = ${money(price * student.packageSize)}` : ''}` : 'no package size set',
          `card: ${card ?? '—'}`
        ]
        return <p className="ss-summary"><strong>{student.name} sees:</strong> {parts.join(' · ')}</p>
      })()}
      <form onSubmit={save}>
        <div className="ss-grid">
          <label>Lessons paid<input type="number" min="0" max="500" value={form.paid} onChange={set('paid')} placeholder="not set" /></label>
          <label>Lessons held<input type="number" min="0" max="1000" value={form.held} onChange={set('held')} /></label>
          <label>Left<div className={`ss-left${left != null && left <= 0 ? ' out' : ''}`}>{left == null ? '—' : left}</div></label>
          <label>Package counts from<input type="date" value={form.from} onChange={set('from')} /></label>
          <label>Price per lesson
            <span className="ss-price">
              <input inputMode="decimal" value={form.price} onChange={set('price')} placeholder="—" />
              <select value={form.currency} onChange={set('currency')}>
                <option value="RUB">₽</option><option value="EUR">€</option><option value="USD">$</option>
              </select>
            </span>
          </label>
          <label>Package to pay (lessons)<input type="number" min="1" max="500" value={form.size} onChange={set('size')} placeholder="e.g. 8" /></label>
          <label>Card (rubles)
            <select value={form.card} onChange={set('card')} disabled={!isOwner} title={isOwner ? undefined : 'Only the administrator changes the card'}>
              <option value="auto">Automatic ({student.paysTrialCard ? `${cards.trial}, came from the landing` : cards.main})</option>
              <option value="school">{cards.main}</option>
              <option value="trial">{cards.trial}</option>
              {cards.extra.map((c) => <option key={c.id} value={`extra:${c.id}`}>{c.label}</option>)}
            </select>
          </label>
          <label>Payment link (card abroad)<input type="url" value={form.link} onChange={set('link')} placeholder="https://buy.stripe.com/…" /></label>
          <label>Amount received
            <input inputMode="decimal" value={form.amount} onChange={set('amount')} placeholder={form.price && form.paid ? `${Number(form.price.replace(',', '.')) * Number(form.paid)} (lessons × price)` : 'lessons × price'} />
          </label>
          <label>Payment comment<input value={form.note} onChange={set('note')} maxLength={300} placeholder="e.g. transfer from his mother" /></label>
        </div>
        <p className="muted ss-hint">
          Paid after a lesson given on credit? Set “Package counts from” to that lesson’s day — it is then counted in the new package.
          Lessons held are counted from calls automatically; type another number to correct it.
          A new package (or more lessons paid) goes into the payment history below, with the amount and the card.
        </p>
        <div className="row-actions">
          <button type="submit" disabled={busy}>Save</button>
          <button type="button" className="ghost" onClick={newPackage} title="Fills in today as the start and 0 held — then enter lessons paid and Save">New package from today</button>
          {saved && <span className="paid-badge active">{saved}</span>}
        </div>
      </form>

      <div className="ss-payments">
        <h4>Payment history</h4>
        {payments === null && <p className="muted">Loading…</p>}
        {payments?.length === 0 && <p className="muted">No payments yet.</p>}
        {payments?.length > 0 && (
          <table className="ss-pay-table">
            <thead><tr><th>Date</th><th>What</th><th>Lessons</th><th>Amount</th><th>Card</th><th /></tr></thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className={p.kind === 'reported' ? 'muted' : ''}>
                  <td>{p.at ? new Date(p.at).toLocaleDateString('ru-RU') : '—'}</td>
                  <td>
                    {{ package: 'Package', stripe: 'Paid online', reported: 'Student: «I have paid»', current: 'Current package' }[p.kind] ?? p.kind}
                    {p.by ? <span className="muted"> · {p.by}</span> : null}
                    {p.note ? <div className="muted">{p.note}</div> : null}
                  </td>
                  <td>{p.lessons ?? '—'}</td>
                  <td>{p.amountCents != null ? new Intl.NumberFormat('ru-RU', { style: 'currency', currency: p.currency || 'RUB', maximumFractionDigits: 2 }).format(p.amountCents / 100) : '—'}</td>
                  <td>{p.card ?? '—'}</td>
                  <td>{isOwner && !['stripe', 'current'].includes(p.kind) && (
                    <button type="button" className="ghost ss-x" title="Delete this line" disabled={busy}
                      onClick={() => window.confirm('Delete this line from the history? The package itself does not change.') && run(() => api.deleteStudentPayment(studentId, p.id), 'Deleted ✓')}>✕</button>
                  )}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="ss-teachers">
        <span className="muted">Teachers:</span>
        {student.teachers.length === 0 && <span className="muted">none</span>}
        {student.teachers.map((t) => (
          <span key={t.id} className="activity-tag">{t.name}
            {isOwner && <button type="button" className="ghost ss-x" disabled={busy} title="Remove this teacher"
              onClick={() => window.confirm(`Remove ${t.name} as this student's teacher? Their lessons and boards stay.`) && run(() => api.unlinkStudent(t.id, studentId), 'Teacher removed ✓')}>✕</button>}
          </span>
        ))}
        {isOwner && others.length > 0 && (
          <>
            <select value={addTeacher} onChange={(e) => setAddTeacher(e.target.value)}>
              <option value="">Add a teacher…</option>
              {others.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button type="button" disabled={!addTeacher || busy} onClick={() => run(async () => { await api.linkStudent(addTeacher, studentId); setAddTeacher('') }, 'Teacher added ✓')}>Add</button>
          </>
        )}
      </div>
      <div className="ss-teachers">
        <span className="muted">Бот для родителя:</span>
        <button type="button" className="ghost" disabled={busy} onClick={async () => {
          try {
            const { link } = await api.studentTelegramLink(studentId)
            setBotLink(link)
            await navigator.clipboard?.writeText(link).catch(() => {})
          } catch (err) { setError(err.message) }
        }} title="Отправьте эту ссылку маме или папе: Start в их Telegram подключит этого ученика — напоминания и «Мои уроки» (сколько уроков осталось). Для второго ребёнка — его ссылка, тот же Telegram.">
          {botLink ? 'Скопировано ✓' : 'Скопировать ссылку'}
        </button>
        {botLink && <code className="invite-link">{botLink}</code>}
      </div>
      {error && <div className="error">{error}</div>}
    </section>
  )
}
