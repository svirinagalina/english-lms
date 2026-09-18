import { useEffect, useState } from 'react'
import { api } from '../api'
import { PackageBadge } from './PackageBadge'

const formatPrice = (amount, currency) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount / 100)

export default function StudentPayment() {
  const [billing, setBilling] = useState(null)
  const [copied, setCopied] = useState(false)
  const [note, setNote] = useState('')
  const [reporting, setReporting] = useState(false)
  const [reported, setReported] = useState(null)

  useEffect(() => {
    api.myBilling().then(({ billing }) => { setBilling(billing); setReported(billing.paymentReportedAt) }).catch(() => setBilling(null))
  }, [])

  if (!billing) return null

  const { priceAmount, priceCurrency, paymentLink, paymentDetails } = billing
  const pkg = billing.package
  const nothingConfigured = priceAmount == null && !paymentLink && !paymentDetails && pkg?.lessonsPaid == null
  if (nothingConfigured) return null

  // The card number is usually the first long run of digits in the details.
  const cardNumber = paymentDetails?.match(/(?:\d[ \-]?){13,19}/)?.[0]?.trim() ?? null
  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { window.prompt('Copy:', text) }
  }

  const report = async () => {
    setReporting(true)
    try {
      const { reportedAt } = await api.reportPayment(note)
      setReported(reportedAt)
      setNote('')
    } finally {
      setReporting(false)
    }
  }

  return (
    <section>
      <h2>Payment</h2>

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
              <button onClick={report} disabled={reporting}>{reporting ? 'Sending…' : 'I have paid'}</button>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
