import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { api } from '../api'

export default function Register() {
  const { register } = useAuth()
  const [form, setForm] = useState({ schoolName: '', name: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(null)

  useEffect(() => {
    api.registrationStatus()
      .then(({ open }) => setOpen(open))
      .catch(() => setOpen(false))
  }, [])

  const update = (field) => (event) => setForm({ ...form, [field]: event.target.value })

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      await register(form)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (open === null) return <div className="centered">Loading…</div>

  if (!open) {
    return (
      <div className="auth-page">
        <div className="card">
          <h1>Registration is closed</h1>
          <p className="muted">
            Accounts on this platform are created by its administrator.
            If you should have access, ask them to add you.
          </p>
          <Link className="button" to="/login">Back to sign in</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <form className="card" onSubmit={handleSubmit}>
        <h1>Create your school</h1>
        {error && <div className="error">{error}</div>}
        <input placeholder="School name" value={form.schoolName} onChange={update('schoolName')} required />
        <input placeholder="Your name" value={form.name} onChange={update('name')} required />
        <input type="email" placeholder="Email" value={form.email} onChange={update('email')} required />
        <input
          type="password"
          placeholder="Password (min 8 characters)"
          value={form.password}
          onChange={update('password')}
          minLength={8}
          required
        />
        <button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create school'}</button>
        <p className="muted">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  )
}
