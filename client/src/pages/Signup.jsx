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
    api.signupStatus('signup').then(({ open }) => setOpen(open)).catch(() => setOpen(false))
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
          <h1>Регистрация закрыта</h1>
          <p className="muted">Аккаунты создаёт преподаватель — попросите у него приглашение.</p>
          <Link className="button" to="/login">Ко входу</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <form className="card" onSubmit={handleSubmit}>
        <div className="login-brand"><Brand /></div>
        <h1>Начните бесплатно</h1>
        <p className="muted">Грамматика с умной проверкой, словарь, карточки и чат-бот для разговора — открываются сразу. Без карты.</p>
        {error && <div className="error">{error}</div>}
        <input placeholder="Ваше имя" value={form.name} onChange={update('name')} autoComplete="name" required minLength={2} />
        <input type="email" placeholder="Почта" value={form.email} onChange={update('email')} autoComplete="email" required />
        <input
          type="password"
          placeholder="Пароль (не меньше 8 символов)"
          value={form.password}
          onChange={update('password')}
          autoComplete="new-password"
          minLength={8}
          required
        />
        <button type="submit" disabled={busy}>{busy ? 'Создаём…' : 'Создать аккаунт бесплатно'}</button>
        <p className="muted">
          Регистрируясь, вы принимаете <a href="/privacy.html" target="_blank" rel="noopener noreferrer">политику конфиденциальности</a>.
        </p>
        <p className="muted">Уже есть аккаунт? <Link to="/login">Войти</Link></p>
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
        <h1>Проверьте почту</h1>
        <p>Мы отправили письмо на <strong>{email}</strong>. Откройте его и нажмите <strong>«Подтвердить»</strong> — и вы внутри.</p>
        <p className="muted">Письма нет? Загляните в «Спам» или «Промоакции». Ссылка действует 3 дня.</p>
        <button type="button" className="ghost" onClick={resend} disabled={state === 'sending'}>
          {state === 'sending' ? 'Отправляем…' : state === 'sent' ? 'Отправили ещё раз ✓' : 'Отправить письмо ещё раз'}
        </button>
        {state && !['sending', 'sent'].includes(state) && <div className="error">{state}</div>}
        <p className="muted">Ошиблись адресом? <Link to="/signup" onClick={() => window.location.reload()}>Зарегистрироваться заново</Link></p>
      </div>
    </div>
  )
}
