import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { Brand } from '../components/Brand'

// The link from the sign-up letter: confirms the address and signs in.
export default function VerifyEmail() {
  const { token } = useParams()
  const { verifyEmail } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    verifyEmail(token).then(() => navigate('/', { replace: true })).catch((err) => setError(err.message))
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="auth-page">
      <div className="card">
        <div className="login-brand"><Brand /></div>
        {error ? (
          <>
            <h1>The link didn't work</h1>
            <div className="error">{error}</div>
            <Link className="button" to="/login">Sign in to get a new letter</Link>
          </>
        ) : (
          <h1>Confirming your email…</h1>
        )}
      </div>
    </div>
  )
}
