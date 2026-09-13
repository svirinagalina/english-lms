import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { api } from '../api'

export default function Join() {
  const { token } = useParams()
  const { acceptInvite } = useAuth()
  const [invite, setInvite] = useState(null)
  const [error, setError] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.getInvite(token)
      .then(({ invite }) => setInvite(invite))
      .catch((err) => setError(err.message))
  }, [token])

  const submit = async (event) => {
    event.preventDefault()
    setError('')

    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }

    setBusy(true)
    try {
      await acceptInvite(token, password)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  if (error && !invite) {
    return (
      <div className="auth-page">
        <div className="card">
          <h1>Invitation unavailable</h1>
          <p className="error">{error}</p>
          <Link className="button" to="/login">Go to sign in</Link>
        </div>
      </div>
    )
  }

  if (!invite) return <div className="centered">Loading…</div>

  return (
    <div className="auth-page">
      <form className="card" onSubmit={submit}>
        <h1>Join {invite.schoolName}</h1>
        <p className="muted">
          {invite.invitedBy} invited you as {invite.role === 'TEACHER' ? 'a teacher' : 'a student'}.
          Pick a password to finish setting up your account.
        </p>

        {error && <div className="error">{error}</div>}

        <input value={invite.name} disabled />
        <input value={invite.email} disabled />

        <input
          type="password"
          placeholder="Password (min 8 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
          autoFocus
        />
        <input
          type="password"
          placeholder="Repeat password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          minLength={8}
          required
        />

        <button type="submit" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </div>
  )
}
