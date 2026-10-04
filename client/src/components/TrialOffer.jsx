import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../AuthContext'

// The free tier's one way up: a request for a trial lesson. Opened by
// openTrialOffer() (a locked unit, "Start a lesson" on the try-out board) and
// by any request the server refuses as `locked` (api.js). Mounted once, in App.
export const openTrialOffer = () => window.dispatchEvent(new CustomEvent('trial-offer'))
// The same dialog, leading with the plan that opens `feature` ('practice' | 'calls').
export const openPlanOffer = (feature) => window.dispatchEvent(new CustomEvent('trial-offer', { detail: { feature } }))

export default function TrialOffer() {
  const { user, updateUser } = useAuth()
  const [open, setOpen] = useState(false)
  const [contact, setContact] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [feature, setFeature] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    const show = (event) => { setSent(false); setError(''); setFeature(event.detail?.feature ?? null); setOpen(true) }
    window.addEventListener('trial-offer', show)
    return () => window.removeEventListener('trial-offer', show)
  }, [])
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  if (!open || !user?.free) return null

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { trialRequestedAt } = await api.requestTrial({ contact, note })
      updateUser({ trialRequestedAt })
      setSent(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const requested = user.trialRequestedAt && new Date(user.trialRequestedAt).toLocaleDateString()

  return (
    <div className="modal-backdrop trial-offer-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) setOpen(false) }}>
      <div className="card trial-offer" role="dialog" aria-modal="true" aria-labelledby="trial-offer-title">
        <button type="button" className="word-card-close" onClick={() => setOpen(false)} aria-label="Close">×</button>
        {feature && (
          <div className="plan-offer">
            <span className="tile-kicker">{feature === 'calls' ? 'Your own video calls' : 'All of the practice'}</span>
            <h2 id="trial-offer-title">{feature === 'calls' ? 'Hosting calls is in the Calls plan' : 'This is in the Practice plan'}</h2>
            <p className="muted">
              {feature === 'calls'
                ? 'Start calls with anyone, up to 6 people, with the board, Writing, background blur and noise removal — 5.90 € a month. People you invite join free.'
                : 'Every grammar chapter with unlimited AI checking, every word set and the speaking chatbot in full — 4.90 € a month.'}
            </p>
            <button type="button" onClick={() => { setOpen(false); navigate('/plans') }}>See plans</button>
            <hr />
          </div>
        )}
        <span className="tile-kicker">Lessons with a teacher</span>
        {feature ? <h3>Or study with a teacher — every plan included</h3> : <h2 id="trial-offer-title">Unlock everything with a trial lesson</h2>}
        <p className="muted">
          The free plan gives you the first grammar units, part of the vocabulary, the dictionary and a taste of the speaking trainer.
          Students with a teacher get live video lessons on a shared board, homework, a notebook of their own mistakes,
          the whole grammar course and the full speaking trainer.
        </p>
        {sent ? (
          <div className="notice">Thank you! Your request is sent — we'll get in touch soon to arrange the lesson.</div>
        ) : (
          <form onSubmit={submit} className="trial-offer-form">
            {requested && <div className="muted">You asked on {requested} — send again if you'd like to add something.</div>}
            {error && <div className="error">{error}</div>}
            <label>
              How can we reach you?
              <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Telegram, WhatsApp or phone" maxLength={120} required />
            </label>
            <label>
              What would you like to work on? <span className="muted">(optional)</span>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} placeholder="Speaking, an exam, English for work…" />
            </label>
            <button type="submit" disabled={busy || !contact.trim()}>{busy ? 'Sending…' : 'Request a trial lesson'}</button>
          </form>
        )}
      </div>
    </div>
  )
}
