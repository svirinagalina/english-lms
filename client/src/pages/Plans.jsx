import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../AuthContext'
import Nav from '../components/Nav'
import { openTrialOffer } from '../components/TrialOffer'
import { isNativeApp } from '../utils/native'

// The self-service plans (server/src/plans.js) and Stripe Checkout.
const ROWS = [
  { label: 'Grammar with AI checking', free: '10 chapters, 20 AI checks a day', practice: 'All chapters, unlimited', calls: '10 chapters, 20 AI checks a day', all: 'All chapters, unlimited' },
  { label: 'Dictionary, flashcards, your own words', free: '✓', practice: '✓ + every word set', calls: '✓', all: '✓ + every word set' },
  { label: 'Speaking chatbot (trainer)', free: 'Trial', practice: 'Unlimited', calls: 'Trial', all: 'Unlimited' },
  { label: 'Your own video calls — up to 6 people, board, Writing, blur, noise removal', free: '—', practice: '—', calls: '✓ no time limit', all: '✓ no time limit' },
  { label: 'Joining a call someone invited you to', free: '✓', practice: '✓', calls: '✓', all: '✓' }
]
const euro = (cents) => `${(cents / 100).toLocaleString('en', { minimumFractionDigits: cents % 100 ? 2 : 0 })} €`
const rub = (amount) => `${amount.toLocaleString('ru-RU')} ₽`

export default function Plans() {
  const { user, refreshUser } = useAuth()
  const [params, setParams] = useSearchParams()
  const [data, setData] = useState(null)
  const [period, setPeriod] = useState('month')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const native = isNativeApp()
  const access = user.access ?? {}

  useEffect(() => { api.listPlans().then(setData).catch((e) => setError(e.message)) }, [])

  // Back from Stripe Checkout.
  useEffect(() => {
    const sessionId = params.get('session_id')
    if (!sessionId) return
    setNotice('Confirming your payment…')
    api.verifySubscription(sessionId)
      .then(async ({ plan }) => {
        await refreshUser()
        setNotice(plan ? 'Thank you! Your plan is active.' : 'The payment is being processed — your plan opens in a minute.')
      })
      .catch((e) => { setNotice(''); setError(e.message) })
      .finally(() => setParams({}, { replace: true }))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const subscribe = async (plan) => {
    setBusy(plan); setError('')
    try {
      const { url } = await api.subscribe(plan, period)
      window.location.assign(url)
    } catch (e) {
      setError(e.message)
      setBusy('')
    }
  }
  const manage = async () => {
    setBusy('manage'); setError('')
    try {
      const { url } = await api.subscriptionPortal()
      window.location.assign(url)
    } catch (e) {
      setError(e.message)
      setBusy('')
    }
  }

  const plans = data?.plans ?? []
  const current = access.plan
  const until = access.planUntil && new Date(access.planUntil).toLocaleDateString()

  return (
    <div className="page plans-page">
      <Nav title="Plans" />

      {!user.free ? (
        <div className="notice">You study with a teacher — everything here is already open for you.</div>
      ) : current ? (
        <div className="free-plan">
          <p><strong>Your plan: {plans.find((p) => p.id === current)?.name ?? current}</strong> <span className="muted">· until {until}{access.planSource === 'manual' ? ' (paid by card)' : ''}</span></p>
          {access.canManage && !native && <button type="button" className="ghost" onClick={manage} disabled={busy === 'manage'}>{busy === 'manage' ? 'Opening…' : 'Manage subscription'}</button>}
        </div>
      ) : (
        <p className="muted">You're on the free plan. Pick what you need — you can cancel any time.</p>
      )}

      {notice && <div className="notice">{notice}</div>}
      {error && <div className="error">{error}</div>}

      {!native && (
        <div className="period-switch" role="group" aria-label="Billing period">
          <button type="button" className={period === 'month' ? 'active' : ''} onClick={() => setPeriod('month')}>Monthly</button>
          <button type="button" className={period === 'year' ? 'active' : ''} onClick={() => setPeriod('year')}>Yearly <span className="save">−30%</span></button>
        </div>
      )}

      <div className="plans-grid">
        <div className="plan-card">
          <h2>Free</h2>
          <div className="plan-price">0 €</div>
          <ul>{ROWS.map((r) => <li key={r.label} className={r.free === '—' ? 'off' : ''}><span>{r.label}</span><strong>{r.free}</strong></li>)}</ul>
          {!current && user.free && <div className="plan-current">Your plan now</div>}
        </div>
        {plans.map((plan) => (
          <div key={plan.id} className={`plan-card${plan.id === 'all' ? ' featured' : ''}${plan.id === current ? ' current' : ''}`}>
            {plan.id === 'all' && <span className="plan-badge">Best value</span>}
            <h2>{plan.name}</h2>
            <div className="plan-price">
              {euro(plan.eur[period])}<span className="muted"> / {period === 'month' ? 'month' : 'year'}</span>
              <div className="plan-rub muted">or {rub(plan.rub[period])} by card</div>
            </div>
            <ul>{ROWS.map((r) => <li key={r.label} className={r[plan.id] === '—' ? 'off' : ''}><span>{r.label}</span><strong>{r[plan.id]}</strong></li>)}</ul>
            {plan.id === current ? (
              <div className="plan-current">Your plan</div>
            ) : native ? (
              <div className="muted plan-note">Plans are bought on the website, lms.advent-academy.online.</div>
            ) : user.free && !current ? (
              <button type="button" onClick={() => subscribe(plan.id)} disabled={Boolean(busy) || !data?.online}>
                {busy === plan.id ? 'Opening Stripe…' : `Get ${plan.name}`}
              </button>
            ) : user.free && access.canManage ? (
              <button type="button" className="ghost" onClick={manage} disabled={Boolean(busy)}>Switch in Manage subscription</button>
            ) : null}
          </div>
        ))}
      </div>

      {data && !data.online && !native && user.free && (
        <p className="muted">Online payment is being set up. To pay by card in roubles, write to us — <button type="button" className="link-button" onClick={openTrialOffer}>leave your contact</button>.</p>
      )}
      {!native && user.free && (
        <p className="muted plan-footnote">
          Paying in roubles by a Russian card? <button type="button" className="link-button" onClick={openTrialOffer}>Leave your contact</button> and we'll send the details; the plan opens as soon as the payment arrives.
          Want lessons with a teacher instead? <button type="button" className="link-button" onClick={openTrialOffer}>Book a trial lesson</button> — students with a teacher get every plan included.
        </p>
      )}
    </div>
  )
}
