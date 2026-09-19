import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { PackageBadge } from './PackageBadge'
import { OFFER, formatRub, discountDeadline } from '../offer'

const formatPrice = (amount, currency) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount / 100)

// The student's Payment page. A student who came through a trial lesson
// sees the offer's plans at the offer's prices; everyone else sees what
// their teacher set for them.
export default function StudentPayment() {
  const [billing, setBilling] = useState(null)
  const [copied, setCopied] = useState(false)
  const [note, setNote] = useState('')
  const [reporting, setReporting] = useState(false)
  const [reported, setReported] = useState(null)
  const [chosen, setChosen] = useState('')

  useEffect(() => {
    api.myBilling().then(({ billing }) => { setBilling(billing); setReported(billing.paymentReportedAt) }).catch(() => setBilling(null))
  }, [])

  if (!billing) return null

  const { priceAmount, priceCurrency, paymentLink, paymentDetails, trial } = billing
  const pkg = billing.package
  const nothingConfigured = !trial && priceAmount == null && !paymentLink && !paymentDetails && pkg?.lessonsPaid == null
  if (nothingConfigured) return null

  const cardNumber = paymentDetails?.match(/(?:\d[ \-]?){13,19}/)?.[0]?.trim() ?? null
  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { window.prompt('Copy:', text) }
  }

  const report = async (extra = '') => {
    setReporting(true)
    try {
      const { reportedAt } = await api.reportPayment([extra, note].filter(Boolean).join(' · '))
      setReported(reportedAt)
      setNote('')
    } finally {
      setReporting(false)
    }
  }

  const deadline = trial ? discountDeadline(trial.publishedAt) : null

  return (
    <section>
      <h2>Payment</h2>

      {trial && (
        <div className="trial-offer">
          <div className="row-main">
            <div>
              <strong>Ваш план после пробного урока</strong>
              <div className="muted">Уровень {trial.level ?? '—'} · <Link to={`/report/${trial.reportId}`}>отчёт и план</Link></div>
            </div>
            {deadline.active
              ? <span className="paid-badge active">Скидка {OFFER.discountPercent}% до {deadline.label}</span>
              : <span className="paid-badge neutral">Скидка первых {OFFER.discountDays} дней закончилась</span>}
          </div>
          <div className="offer-plans">
            {OFFER.plans.map((plan) => {
              const link = trial.links?.[plan.id]
              const price = deadline.active ? plan.discounted : plan.price
              return (
                <div key={plan.id} className={`offer-plan ${plan.recommended ? 'mine' : ''}`}>
                  {plan.recommended && <div className="offer-badge">Рекомендуем</div>}
                  <div className="offer-plan-name">{plan.name}</div>
                  <div className="muted">{plan.line}</div>
                  <div className="offer-price">
                    {deadline.active && <s>{formatRub(plan.price)}/мес</s>} <strong>{deadline.active ? '≈' : ''}{formatRub(price)}</strong> /мес
                  </div>
                  <ul>{plan.includes.map((i) => <li key={i}>{i}</li>)}</ul>
                  {link
                    ? <a className="button offer-pay" href={link} target="_blank" rel="noopener noreferrer">Оплатить {plan.name} — {formatRub(price)}</a>
                    : <button className="offer-pay" disabled={reporting || chosen === plan.id} onClick={async () => { setChosen(plan.id); await report(`Выбран тариф ${plan.name} (${formatRub(price)}/мес)`) }}>
                        {chosen === plan.id ? 'Заявка отправлена' : `Выбрать ${plan.name}`}
                      </button>}
                </div>
              )
            })}
          </div>
          <p className="muted small-hint">{OFFER.expertNote}</p>
          <p className="muted small-hint">{OFFER.guarantee}</p>
        </div>
      )}

      {!trial && (
        <div className="row">
          <div>
            {priceAmount != null && (
              <strong>{formatPrice(priceAmount, priceCurrency)} per lesson</strong>
            )}
            <div><PackageBadge pkg={pkg} /></div>
            {pkg?.lessonsPaid != null && pkg.remaining <= 0 && priceAmount != null && (
              <div className="muted">Your package is used up — pay for the next lessons below.</div>
            )}
          </div>

          {paymentLink && (
            <a className="button" href={paymentLink} target="_blank" rel="noopener noreferrer">
              Pay now
            </a>
          )}
        </div>
      )}

      {trial && pkg && (
        <div className="row" style={{ marginTop: 12 }}>
          <div><PackageBadge pkg={pkg} /></div>
        </div>
      )}

      {paymentDetails && (
        <div className="notice payment-details">
          <div>
            <strong>Bank transfer details</strong>
            <pre>{paymentDetails}</pre>
            <div className="row-actions">
              {cardNumber && (
                <button className="ghost" onClick={() => copy(cardNumber.replace(/[ \-]/g, ''))}>{copied ? 'Copied' : 'Copy card number'}</button>
              )}
              <button className="ghost" onClick={() => copy(paymentDetails)}>Copy all details</button>
            </div>
          </div>
        </div>
      )}

      <div className="paid-report">
        {reported ? (
          <p className="muted">
            You told your teacher about a payment on {new Date(reported).toLocaleString()}. They will set your new lessons once it arrives.
          </p>
        ) : (
          <>
            <p className="muted" style={{ marginBottom: 8 }}>After paying, let your teacher know — they confirm and add the lessons.</p>
            <div className="row-actions">
              <input
                placeholder="Optional note, e.g. “paid 8 lessons by card”"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={300}
                style={{ flex: 1, minWidth: 220 }}
              />
              <button onClick={() => report()} disabled={reporting}>{reporting ? 'Sending…' : 'I have paid'}</button>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
