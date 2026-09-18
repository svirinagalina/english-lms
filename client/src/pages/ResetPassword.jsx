import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'
import { Brand } from '../components/Brand'

export default function ResetPassword() {
  const { token } = useParams()
  const [info, setInfo] = useState(null)
  const [error, setError] = useState('')
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.resetInfo(token).then(setInfo).catch((err) => setError(err.message))
  }, [token])

  const submit = async (event) => {
    event.preventDefault()
    if (password !== again) { setError('The two passwords differ'); return }
    setError('')
    setBusy(true)
    try {
      await api.resetPassword(token, password)
      // The cookie is set; a full load picks the signed-in user up.
      window.location.assign('/')
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <form className="card" onSubmit={submit}>
        <div className="login-brand"><Brand /></div>
        <h1>New password</h1>
        {error && <div className="error">{error}</div>}
        {info && (
          <>
            <p className="muted">For <strong>{info.email}</strong></p>
            <input type="password" placeholder="New password (8+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required autoFocus />
            <input type="password" placeholder="Once more" value={again} onChange={(e) => setAgain(e.target.value)} minLength={8} required />
            <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save and sign in'}</button>
          </>
        )}
        {!info && error && <Link className="button" to="/forgot">Ask for a new link</Link>}
      </form>
    </div>
  )
}
