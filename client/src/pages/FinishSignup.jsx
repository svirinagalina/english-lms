import { Navigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../AuthContext'
import SignupFields from '../components/SignupFields'

// A student who came through a trial lesson link, three days after the
// lesson: to keep using the platform they choose an email and a password.
export default function FinishSignup() {
  const { user, loading } = useAuth()
  if (loading) return <div className="centered">Загрузка…</div>
  if (!user) return <Navigate to="/login" replace />
  if (!user.viaLink) return <Navigate to="/" replace />
  return (
    <div className="centered"><div className="card ll-card">
      <div className="ll-kicker">Advent Academy</div>
      <h1 className="ll-title">Сохраните доступ</h1>
      <p className="ll-when">{user.needsSignup
        ? 'Три дня пробного доступа закончились. Чтобы продолжить заниматься, придумайте почту и пароль — так вы сможете входить сами.'
        : 'Придумайте почту и пароль — так вы сможете входить на платформу сами, без ссылки.'}</p>
      <SignupFields onSubmit={async (body) => { await api.finishSignup(body); window.location.assign('/') }} />
    </div></div>
  )
}
