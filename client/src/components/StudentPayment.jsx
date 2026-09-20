import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { PackageBadge } from './PackageBadge'
import { parseDetails, formatCard, detailsAsText } from '../utils/paymentDetails'
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
  const [eur, setEur] = useState(null) // { rate, date }
  const [paying, setPaying] = useState('')
  const [payError, setPayError] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()
  const [paidResult, setPaidResult] = useState(null)

  // Back from Stripe: confirm the payment and thank the student.
  useEffect(() => {
    const sessionId = searchParams.get('session_id')
    if (searchParams.get('paid') === '1' && sessionId) {
      api.verifyCheckout(sessionId).then((r) => { setPaidResult(r); if (r.paid) setReported(new Date().toISOString()) }).catch((err) => setPaidResult({ paid: false, error: err.message }))
      setSearchParams({}, { replace: true })
    } else if (searchParams.get('paid') === '0') {
      setSearchParams({}, { replace: true })
    }
  }, [])

  // Stripe Checkout with the amount already filled in; if online payment is
  // not set up yet, the plain link with the amount to enter.
  const pay = async (plan, link, price, euros) => {
    setPaying(plan.id); setPayError('')
    try {
      const { url } = await api.checkout(plan.id)
      window.location.assign(url)
    } catch (err) {
      if (/not set up/i.test(err.message)) {
        report(`Переход к оплате: тариф ${plan.name}, ${formatRub(price)}${euros != null ? ` ≈ ${formatEur(euros)}` : ''}`).catch(() => {})
        window.open(link, '_blank', 'noopener')
      } else {
        setPayError(err.message)
      }
      setPaying('')
    }
  }

  useEffect(() => {
    api.myBilling().then(({ billing }) => {
      setBilling(billing)
      setReported(billing.paymentReportedAt)
      if (billing.trial) api.eurRate().then(({ eur }) => setEur(eur)).catch(() => setEur(null))
    }).catch(() => setBilling(null))
  }, [])
  const inEur = (rub) => (eur ? Math.ceil((rub / eur.rate) * 100) / 100 : null)
  const formatEur = (n) => `${n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`

  if (!billing) return null

  const { priceAmount, priceCurrency, paymentLink, paymentDetails, trial } = billing
  const pkg = billing.package
  const nothingConfigured = !trial && priceAmount == null && !paymentLink && !paymentDetails && pkg?.lessonsPaid == null
  if (nothingConfigured) return null

  const details = parseDetails(paymentDetails)
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
              const link = trial.links?.[plan.id] || OFFER.stripeLink
              const price = deadline.active ? plan.discounted : plan.price
              const euros = inEur(price)
              return (
                <div key={plan.id} className={`offer-plan ${plan.recommended ? 'mine' : ''}`}>
                  {plan.recommended && <div className="offer-badge">Рекомендуем</div>}
                  <div className="offer-plan-name">{plan.name}</div>
                  <div className="muted">{plan.line}</div>
                  <div className="offer-price">
                    {deadline.active && <s>{formatRub(plan.price)}/мес</s>} <strong>{deadline.active ? '≈' : ''}{formatRub(price)}</strong> /мес
                  </div>
                  {euros != null && (
                    <div className="offer-eur">
                      К оплате сегодня: <strong>{formatEur(euros)}</strong>
                      <span className="muted"> · по курсу ЦБ РФ {eur.rate.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽/€ на {eur.date}</span>
                    </div>
                  )}
                  <ul>{plan.includes.map((i) => <li key={i}>{i}</li>)}</ul>
                  <button className="offer-pay" disabled={paying === plan.id} onClick={() => pay(plan, link, price, euros)}>
                    {paying === plan.id ? 'Открываем оплату…' : `Оплатить ${plan.name}${euros != null ? ` — ${formatEur(euros)}` : ''}`}
                  </button>
                </div>
              )
            })}
          </div>
          {payError && <div className="error">{payError}</div>}
          {paidResult && (
            paidResult.paid
              ? <div className="notice">Оплата получена — спасибо! Преподаватель добавит уроки в ваш пакет.</div>
              : <div className="error">{paidResult.error ? `Не удалось проверить оплату: ${paidResult.error}` : 'Оплата не завершена. Попробуйте ещё раз.'}</div>
          )}
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
          <div className="pay-details">
            <strong>How to pay</strong>
            {details.card && (
              <div className="pay-row">
                <div>
                  <span className="pay-label">Card, in rubles</span>
                  <span className="pay-card">{formatCard(details.card)}</span>
                  {details.cardNote && <span className="muted"> · {details.cardNote}</span>}
                </div>
                <button className="ghost" onClick={() => copy(details.card)}>{copied ? 'Copied' : 'Copy'}</button>
              </div>
            )}
            {details.link && (
              <div className="pay-row">
                <div>
                  <span className="pay-label">Online, in euro</span>
                  <span className="muted">Card or Apple/Google Pay, secure page</span>
                </div>
                <a className="button" href={details.link} target="_blank" rel="noreferrer">Pay online</a>
              </div>
            )}
            {details.note && <p className="muted pay-note">{details.note}</p>}
            {(details.card || details.link) && (
              <button className="ghost compact" onClick={() => copy(detailsAsText(details))}>Copy all details</button>
            )}
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
