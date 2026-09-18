import { useEffect, useState } from 'react'
import { api } from '../api'
import { PackageBadge } from './PackageBadge'

const formatPrice = (amount, currency) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount / 100)

export default function StudentPayment() {
  const [billing, setBilling] = useState(null)

  useEffect(() => {
    api.myBilling().then(({ billing }) => setBilling(billing)).catch(() => setBilling(null))
  }, [])

  if (!billing) return null

  const { priceAmount, priceCurrency, paymentLink, paymentDetails } = billing
  const pkg = billing.package
  const nothingConfigured = priceAmount == null && !paymentLink && !paymentDetails && pkg?.lessonsPaid == null
  if (nothingConfigured) return null

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
            <span className="muted">After paying, let your teacher know.</span>
          </div>
        </div>
      )}
    </section>
  )
}
