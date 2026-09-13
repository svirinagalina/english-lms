import { useEffect, useState } from 'react'
import { api } from '../api'

const formatPrice = (amount, currency) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount / 100)

const formatDate = (value) => new Date(value).toLocaleDateString()

export default function StudentPayment() {
  const [billing, setBilling] = useState(null)

  useEffect(() => {
    api.myBilling().then(({ billing }) => setBilling(billing)).catch(() => setBilling(null))
  }, [])

  if (!billing) return null

  const { priceAmount, priceCurrency, paymentLink, paidUntil, paymentDetails } = billing
  const nothingConfigured = priceAmount == null && !paymentLink && !paymentDetails
  if (nothingConfigured) return null

  const activeUntil = paidUntil ? new Date(paidUntil) : null
  const isActive = activeUntil && activeUntil >= new Date()

  return (
    <section>
      <h2>Payment</h2>

      <div className="row">
        <div>
          {priceAmount != null && (
            <strong>{formatPrice(priceAmount, priceCurrency)} per month</strong>
          )}
          <div className="muted">
            {isActive
              ? `Paid until ${formatDate(paidUntil)}`
              : activeUntil
                ? `Expired on ${formatDate(paidUntil)}`
                : 'Not paid yet'}
          </div>
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
