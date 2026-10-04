import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { api } from '../api'
import { Brand } from '../components/Brand'

// A free account: anyone who downloads the app can start with the
// dictionary, the first grammar units and the speaking trainer.
export default function Signup() {
  const { signup } = useAuth()
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [sentTo, setSentTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(null)

  useEffect(() => {
    api.signupStatus().then(({ open }) => setOpen(open)).catch(() => setOpen(false))
  }, [])

  const update = (field) => (event) => setForm({ ...form, [field]: event.target.value })

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const result = await signup(form)
      if (result?.verify) { setSentTo(result.email); setBusy(false) }
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  if (open === null) return <div className="centered">Loading…</div>

  if (sentTo) return <CheckInbox email={sentTo} />

  if (!open) {
    return (
      <div className="auth-page">
        <div className="card">
          <h1>Sign-up is closed</h1>
          <p className="muted">Accounts are created by your teacher. Ask them for an invitation.</p>
          <Link className="button" to="/login">Back to sign in</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <form className="card" onSubmit={handleSubmit}>
        <div className="login-brand"><Brand /></div>
        <h1>Start learning for free</h1>
        <p className="muted">A dictionary, grammar practice and a speaking trainer — free to begin with. Lessons with a teacher whenever you're ready.</p>
        {error && <div className="error">{error}</div>}
        <input placeholder="Your name" value={form.name} onChange={update('name')} autoComplete="name" required minLength={2} />
        <input type="email" placeholder="Email" value={form.email} onChange={update('email')} autoComplete="email" required />
        <input
          type="password"
          placeholder="Password (min 8 characters)"
          value={form.password}
          onChange={update('password')}
          autoComplete="new-password"
          minLength={8}
          required
        />
        <button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create a free account'}</button>
        <p className="muted">
          By signing up you accept the <a href="/privacy.html" target="_blank" rel="noopener noreferrer">privacy policy</a>.
        </p>
        <p className="muted">Already have an account? <Link to="/login">Sign in</Link></p>
      </form>
    </div>
  )
}

// After sign-up (and from the sign-in page): the letter is on its way.
export function CheckInbox({ email }) {
  const [state, setState] = useState('')
  const resend = async () => {
    setState('sending')
    try { await api.resendVerification(email); setState('sent') } catch (err) { setState(err.message) }
  }
  return (
    <div className="auth-page">
      <div className="card">
        <div className="login-brand"><Brand /></div>
        <h1>Check your inbox</h1>
        <p>We sent a letter to <strong>{email}</strong>. Open it and press <strong>Confirm</strong> to finish signing up.</p>
        <p className="muted">Nothing there? Look in Spam or Promotions. The link works for 3 days.</p>
        <button type="button" className="ghost" onClick={resend} disabled={state === 'sending'}>
          {state === 'sending' ? 'Sending…' : state === 'sent' ? 'Sent again ✓' : 'Send the letter again'}
        </button>
        {state && !['sending', 'sent'].includes(state) && <div className="error">{state}</div>}
        <p className="muted">Wrong address? <Link to="/signup" onClick={() => window.location.reload()}>Sign up again</Link></p>
      </div>
    </div>
  )
}
