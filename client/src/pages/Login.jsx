import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { api } from '../api'

export default function Login() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [registrationOpen, setRegistrationOpen] = useState(false)

  useEffect(() => {
    api.registrationStatus()
      .then(({ open }) => setRegistrationOpen(open))
      .catch(() => setRegistrationOpen(false))
  }, [])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login({ email, password })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <form className="card" onSubmit={handleSubmit}>
        <h1>Sign in</h1>
        {error && <div className="error">{error}</div>}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        {registrationOpen && (
          <p className="muted">
            New school? <Link to="/register">Create an account</Link>
          </p>
        )}
      </form>
    </div>
  )
}
