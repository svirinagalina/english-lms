import { useState } from 'react'
import { api } from '../api'

const CURRENCIES = ['RUB', 'USD', 'EUR']

const toMinorUnits = (value) => Math.round(Number(value) * 100)
const toMajorUnits = (value) => (value == null ? '' : String(value / 100))
const asDateInput = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '')

export default function BillingEditor({ student, onSaved, onCancel }) {
  const [price, setPrice] = useState(toMajorUnits(student.priceAmount))
  const [currency, setCurrency] = useState(student.priceCurrency ?? 'RUB')
  const [link, setLink] = useState(student.paymentLink ?? '')
  const [paidUntil, setPaidUntil] = useState(asDateInput(student.paidUntil))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setBusy(true)

    try {
      await api.updateStudentBilling(student.id, {
        priceAmount: price === '' ? null : toMinorUnits(price),
        priceCurrency: currency,
        paymentLink: link.trim() === '' ? null : link.trim(),
        paidUntil: paidUntil === '' ? null : new Date(`${paidUntil}T00:00:00.000Z`).toISOString()
      })
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="billing-editor" onSubmit={handleSubmit}>
      {error && <div className="error">{error}</div>}

      <label>
        Price per month
        <div className="price-row">
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
          </select>
        </div>
      </label>

      <label>
        Payment link (Stripe)
        <input
          type="url"
          placeholder="https://buy.stripe.com/..."
          value={link}
          onChange={(e) => setLink(e.target.value)}
        />
      </label>

      <label>
        Paid until
        <input type="date" value={paidUntil} onChange={(e) => setPaidUntil(e.target.value)} />
      </label>

      <div className="editor-actions">
        <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" className="ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}
