import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { api } from '../api'
import { Brand } from '../components/Brand'

// /tg-login/:token — the one-time link the school's bot sends (/login):
// signs the student in and opens their home page.
const attempts = new Map()

export default function TelegramLogin() {
  const { token } = useParams()
  const { refreshUser } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')

  useEffect(() => {
    // The link works once: never send it twice (React runs effects twice in development).
    if (!attempts.has(token)) attempts.set(token, api.telegramLogin(token).then(() => refreshUser()))
    attempts.get(token)
      .then(() => navigate('/', { replace: true }))
      .catch((err) => setError(err.message))
  }, [token])

  return (
    <div className="auth-page">
      <div className="card">
        <div className="login-brand"><Brand /></div>
        {error ? (
          <>
            <h1>Ссылка не сработала</h1>
            <p>{error}</p>
          </>
        ) : (
          <p className="muted">Входим…</p>
        )}
      </div>
    </div>
  )
}
