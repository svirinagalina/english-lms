import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { Brand } from '../components/Brand'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      await api.forgotPassword(email)
      setSent(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <form className="card" onSubmit={submit}>
        <div className="login-brand"><Brand /></div>
        <h1>Forgot password</h1>
        {sent ? (
          <>
            <p>If an account exists for <strong>{email}</strong>, a link to set a new password is on its way. It works for one hour.</p>
            <p className="muted">No letter? Check spam, or ask your teacher.</p>
            <Link className="button" to="/login">Back to sign in</Link>
          </>
        ) : (
          <>
            <p className="muted">Enter the email you signed up with — we will send a link to choose a new password.</p>
            {error && <div className="error">{error}</div>}
            <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            <button type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send the link'}</button>
            <p className="muted"><Link to="/login">Back to sign in</Link></p>
          </>
        )}
      </form>
    </div>
  )
}
