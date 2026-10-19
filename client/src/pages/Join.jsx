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
  // A Telegram invitation (no email): the student picks a login.
  const [login, setLogin] = useState('')
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
      setError(invite.needsLogin ? 'Пароли не совпадают' : 'Passwords do not match')
      return
    }

    setBusy(true)
    try {
      await acceptInvite(token, password, invite.needsLogin ? login : undefined)
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
        <h1>{invite.needsLogin ? `Регистрация — ${invite.schoolName}` : `Join ${invite.schoolName}`}</h1>
        <p className="muted">
          {invite.needsLogin
            ? <>{invite.invitedBy} приглашает вас учиться. Придумайте логин и пароль — по ним вы будете входить на платформу.</>
            : <>{invite.invitedBy} invited you as {invite.role === 'TEACHER' ? 'a teacher' : 'a student'}. Pick a password to finish setting up your account.</>}
        </p>

        {error && <div className="error">{error}</div>}

        <input value={invite.name} disabled />
        {invite.needsLogin ? (
          <input
            placeholder="Логин (латиница, цифры, . _ -)"
            value={login}
            onChange={(e) => setLogin(e.target.value.trim().toLowerCase())}
            pattern="[a-z0-9._\-]{3,32}"
            title="От 3 до 32 латинских букв, цифр, точек, _ или -"
            autoCapitalize="none"
            autoComplete="username"
            required
            autoFocus
          />
        ) : (
          <input value={invite.email} disabled />
        )}

        <input
          type="password"
          placeholder={invite.needsLogin ? 'Пароль (не меньше 8 символов)' : 'Password (min 8 characters)'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
          autoFocus={!invite.needsLogin}
        />
        <input
          type="password"
          placeholder={invite.needsLogin ? 'Пароль ещё раз' : 'Repeat password'}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          minLength={8}
          required
        />

        <button type="submit" disabled={busy}>
          {invite.needsLogin ? (busy ? 'Создаём…' : 'Создать аккаунт') : busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </div>
  )
}
