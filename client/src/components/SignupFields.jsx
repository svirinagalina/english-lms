import { useState } from 'react'

// Email + password for an account that came from a trial lesson link.
export default function SignupFields({ onSubmit, button = 'Сохранить и продолжить' }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event) => {
    event.preventDefault()
    setBusy(true); setError('')
    try { await onSubmit({ email: email.trim(), password }) } catch (err) { setError(err.message); setBusy(false) }
  }
  return (
    <form onSubmit={submit} className="ll-form">
      <label>Почта<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required /></label>
      <label>Пароль<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="не короче 8 символов" autoComplete="new-password" minLength={8} required /></label>
      {error && <p className="error">{error}</p>}
      <button type="submit" className="ll-go" disabled={busy}>{busy ? 'Сохраняю…' : button}</button>
      <p className="muted ll-note">Ваши уроки, доска, слова и ошибки остаются с вами — это тот же аккаунт.</p>
    </form>
  )
}
