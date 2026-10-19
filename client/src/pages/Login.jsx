import { useEffect, useState } from 'react'
import { CheckInbox } from './Signup'
import { Link } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { api } from '../api'
import { Brand } from '../components/Brand'

export default function Login() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [registrationOpen, setRegistrationOpen] = useState(false)
  const [signupOpen, setSignupOpen] = useState(false)
  const [unverified, setUnverified] = useState('')
  const [telegramLink, setTelegramLink] = useState(null)

  useEffect(() => {
    api.registrationStatus()
      .then(({ open }) => setRegistrationOpen(open))
      .catch(() => setRegistrationOpen(false))
    api.signupStatus().then(({ open }) => setSignupOpen(open)).catch(() => setSignupOpen(false))
    api.telegramLoginLink().then(({ link }) => setTelegramLink(link)).catch(() => {})
  }, [])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login({ email, password })
    } catch (err) {
      if (err.data?.unverified) { setUnverified(err.data.email); setBusy(false); return }
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (unverified) return <CheckInbox email={unverified} />

  return (
    <div className="auth-page">
      <form className="card" onSubmit={handleSubmit}>
        <div className="login-brand"><Brand /></div>
        <h1>Вход</h1>
        {error && <div className="error">{error}</div>}
        <input
          type="email"
          placeholder="Почта"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Пароль"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit" disabled={busy}>{busy ? 'Входим…' : 'Войти'}</button>
        <p className="muted"><Link to="/forgot">Забыли пароль?</Link></p>
        {telegramLink && (
          <a className="button-link" href={telegramLink} target="_blank" rel="noreferrer">
            Войти через Telegram
          </a>
        )}
        {signupOpen && !registrationOpen && (
          <p className="muted">
            Впервые здесь? <Link to="/signup">Создать аккаунт бесплатно</Link>
          </p>
        )}
        {registrationOpen && (
          <p className="muted">
            New school? <Link to="/register">Create an account</Link>
          </p>
        )}
      </form>
    </div>
  )
}
