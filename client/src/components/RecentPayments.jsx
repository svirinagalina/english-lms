import { useEffect, useState } from 'react'
import { api } from '../api'
import PersonLink from './PersonLink'

// Payments → Recent payments: every payment of the school for a period in
// one table, newest first (packages, «I have paid», online purchases, course
// sales). Loaded when the panel is opened.
const PERIODS = [7, 30, 90, 365]
const KIND = { package: 'Package', stripe: 'Paid online', 'stripe-link': 'Stripe link (add lessons)', reported: '«I have paid»', course: 'Course' }

const money = (cents, currency) =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency: currency || 'RUB', maximumFractionDigits: 2 }).format(cents / 100)

export default function RecentPayments() {
  const [days, setDays] = useState(30)
  const [payments, setPayments] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setPayments(null)
    setError('')
    api.recentPayments(days).then(({ payments }) => setPayments(payments)).catch((err) => setError(err.message))
  }, [days])

  // «I have paid» is the student's word, not money in yet: left out of the
  // totals. A Stripe-link payment is counted by the package set for it by hand.
  const totals = {}
  for (const p of payments ?? []) {
    if (p.kind === 'reported' || p.kind === 'stripe-link' || p.amountCents == null) continue
    const currency = p.currency || 'RUB'
    totals[currency] = (totals[currency] ?? 0) + p.amountCents
  }

  return (
    <div className="recent-payments">
      <div className="recent-payments-bar">
        {PERIODS.map((d) => (
          <button key={d} type="button" className={d === days ? '' : 'ghost'} onClick={() => setDays(d)}>
            {d === 365 ? 'Year' : `${d} days`}
          </button>
        ))}
        {payments && Object.keys(totals).length > 0 && (
          <span className="muted">Total: {Object.entries(totals).map(([c, cents]) => money(cents, c)).join(' + ')}</span>
        )}
      </div>
      {error && <div className="error">{error}</div>}
      {!error && payments === null && <p className="muted">Loading…</p>}
      {payments?.length === 0 && <p className="muted">No payments in this period.</p>}
      {payments?.length > 0 && (
        <div className="recent-payments-scroll">
          <table className="ss-pay-table">
            <thead><tr><th>Date</th><th>Who</th><th>What</th><th>Lessons</th><th>Amount</th><th>Card</th></tr></thead>
            <tbody>
              {payments.map((p) => (
                <tr key={`${p.kind}:${p.id}`} className={['reported', 'stripe-link'].includes(p.kind) ? 'muted' : ''}>
                  <td>{new Date(p.at).toLocaleDateString('ru-RU')}</td>
                  <td>{p.studentId ? <PersonLink id={p.studentId} name={p.who ?? '—'} /> : <strong>{p.who ?? '—'}</strong>}</td>
                  <td>
                    {KIND[p.kind] ?? p.kind}
                    {p.by ? <span className="muted"> · {p.by}</span> : null}
                    {p.note ? <div className="muted">{p.note}</div> : null}
                  </td>
                  <td>{p.lessons ?? '—'}</td>
                  <td>{p.amountCents != null ? money(p.amountCents, p.currency) : '—'}</td>
                  <td>{p.card ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
