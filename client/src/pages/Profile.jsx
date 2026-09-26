import { useEffect, useRef, useState } from 'react'
import Nav from '../components/Nav'
import { Avatar } from '../components/Avatar'
import { useAuth } from '../AuthContext'
import { api } from '../api'

// The zones people actually live in, offered first; any IANA name is accepted.
const ZONES = ['Europe/Kaliningrad', 'Europe/Moscow', 'Europe/Samara', 'Asia/Yekaterinburg', 'Asia/Omsk', 'Asia/Novosibirsk', 'Asia/Krasnoyarsk', 'Asia/Irkutsk', 'Asia/Yakutsk', 'Asia/Vladivostok', 'Asia/Magadan', 'Asia/Kamchatka', 'Europe/Minsk', 'Europe/Kyiv', 'Asia/Almaty', 'Asia/Tashkent', 'Asia/Tbilisi', 'Asia/Yerevan', 'Asia/Baku', 'Europe/Istanbul', 'Asia/Dubai', 'Europe/London', 'Europe/Berlin', 'Europe/Madrid', 'Europe/Paris', 'Asia/Bangkok', 'America/New_York', 'America/Los_Angeles']
const EMPTY_DETAILS = { phone: '', messenger: '', birthday: '', city: '', timezone: '', about: '' }

// Reads a picture file and returns a square 256 px JPEG data URL.
const squarePicture = (file) => new Promise((resolve, reject) => {
  const image = new Image()
  const url = URL.createObjectURL(file)
  image.onload = () => {
    const size = 256
    const side = Math.min(image.naturalWidth, image.naturalHeight)
    const canvas = document.createElement('canvas')
    canvas.width = size; canvas.height = size
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, size, size)
    URL.revokeObjectURL(url)
    resolve(canvas.toDataURL('image/jpeg', 0.88))
  }
  image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This file is not a picture')) }
  image.src = url
})

export default function Profile() {
  const { user, updateUser } = useAuth()
  const [name, setName] = useState(user.name)
  const [email, setEmail] = useState(user.email)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const fileRef = useRef(null)
  // Personal details: phone, messenger, birthday, city, time zone, about.
  const [details, setDetails] = useState(EMPTY_DETAILS)
  const setDetail = (field) => (e) => setDetails((d) => ({ ...d, [field]: e.target.value }))
  useEffect(() => {
    api.getProfile().then(({ details: d }) => setDetails({ ...EMPTY_DETAILS, ...d })).catch(() => {})
  }, [])
  const ownZone = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return '' } })()

  const emailChanged = email.trim().toLowerCase() !== user.email
  const needsPassword = emailChanged || newPassword

  const save = async (event) => {
    event.preventDefault()
    setError(''); setMessage('')
    if (newPassword && newPassword !== repeat) { setError('The new password and its repeat differ'); return }
    if (newPassword && newPassword.length < 8) { setError('The new password needs at least 8 characters'); return }
    setSaving(true)
    try {
      const body = { name: name.trim(), email: email.trim().toLowerCase(), ...details }
      if (needsPassword) body.currentPassword = currentPassword
      if (newPassword) body.newPassword = newPassword
      const { user: updated, details: saved } = await api.updateProfile(body)
      updateUser(updated)
      if (saved) setDetails({ ...EMPTY_DETAILS, ...saved })
      setCurrentPassword(''); setNewPassword(''); setRepeat('')
      setMessage(newPassword ? 'Saved. Use the new password next time you sign in.' : 'Saved.')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const pickPicture = async (file) => {
    if (!file) return
    setError(''); setMessage('')
    try {
      const data = await squarePicture(file)
      const { user: updated } = await api.uploadAvatar(data)
      updateUser(updated)
      setMessage('Picture updated.')
    } catch (err) {
      setError(err.message)
    }
  }
  const removePicture = async () => {
    try { const { user: updated } = await api.removeAvatar(); updateUser(updated) } catch (err) { setError(err.message) }
  }

  return (
    <div className="page">
      <Nav title="My profile" back="/classroom" />
      <section className="profile">
        <div className="profile-picture">
          <Avatar user={user} size={96} />
          <div className="row-actions">
            <button type="button" className="ghost" onClick={() => fileRef.current?.click()}>{user.avatar ? 'Change picture' : 'Add a picture'}</button>
            {user.avatar && <button type="button" className="ghost" onClick={removePicture}>Remove</button>}
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { pickPicture(e.target.files?.[0]); e.target.value = '' }} />
          </div>
          <p className="muted">Shown next to your name; cropped to a square.</p>
        </div>

        <form className="details-form profile-form" onSubmit={save}>
          <label className="field">
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
          </label>
          <label className="field">
            <span>Email (you sign in with it)</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={200} />
          </label>

          <h2 style={{ marginTop: 8 }}>About me</h2>
          <label className="field">
            <span>Phone</span>
            <input type="tel" autoComplete="tel" value={details.phone} onChange={setDetail('phone')} maxLength={40} placeholder="+7 900 000-00-00" />
          </label>
          <label className="field">
            <span>Telegram / WhatsApp</span>
            <input value={details.messenger} onChange={setDetail('messenger')} maxLength={80} placeholder="@username or a number" />
          </label>
          <div className="profile-pair">
            <label className="field">
              <span>Birthday</span>
              <input type="date" value={details.birthday} onChange={setDetail('birthday')} />
            </label>
            <label className="field">
              <span>City</span>
              <input value={details.city} onChange={setDetail('city')} maxLength={80} />
            </label>
          </div>
          <label className="field">
            <span>Time zone — so lesson times show right</span>
            <select value={details.timezone} onChange={setDetail('timezone')}>
              <option value="">— not set —</option>
              {[...new Set([ownZone, details.timezone, ...ZONES].filter(Boolean))].map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}{z === ownZone ? ' (this device)' : ''}</option>)}
            </select>
          </label>
          <label className="field">
            <span>{user.role === 'STUDENT' ? 'About me: why I learn English, my goals and interests' : 'About me'}</span>
            <textarea rows={4} value={details.about} onChange={setDetail('about')} maxLength={1000} />
          </label>

          <h2 style={{ marginTop: 8 }}>Change password</h2>
          <label className="field">
            <span>New password (at least 8 characters) — leave empty to keep the current one</span>
            <input type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </label>
          {newPassword && (
            <label className="field">
              <span>Repeat the new password</span>
              <input type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
            </label>
          )}
          {needsPassword && (
            <label className="field">
              <span>Current password — needed to change the email or the password</span>
              <input type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
            </label>
          )}

          {error && <div className="error">{error}</div>}
          {message && <p className="muted">{message}</p>}
          <div className="editor-actions">
            <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </section>
      {user.role === 'STUDENT' && <DeleteAccount />}
      <p className="muted" style={{ marginTop: 16 }}><a href="/privacy.html" target="_blank" rel="noopener noreferrer">Privacy policy</a></p>
    </div>
  )
}

// Deleting one's own account, as the App Store requires: everything in it
// goes (progress, words, boards), so it asks for the password first.
function DeleteAccount() {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const remove = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      // The server signed this browser out and removed the phone's push
      // registration with the account: a fresh start from the sign-in page.
      await api.deleteMyAccount(password)
      window.location.assign('/login')
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <section className="profile" style={{ marginTop: 16 }}>
      <h2>Delete my account</h2>
      {!open ? (
        <>
          <p className="muted">Removes your account with your progress, saved words and boards. This cannot be undone.</p>
          <div className="editor-actions"><button type="button" className="ghost" onClick={() => setOpen(true)}>Delete my account…</button></div>
        </>
      ) : (
        <form onSubmit={remove} className="card danger-zone" style={{ maxWidth: 460 }}>
          <p>Everything in your account will be deleted for good. Enter your password to confirm.</p>
          <input type="password" autoComplete="current-password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error && <div className="error">{error}</div>}
          <div className="editor-actions">
            <button type="submit" className="danger-button" disabled={busy || !password}>{busy ? 'Deleting…' : 'Delete for good'}</button>
            <button type="button" className="ghost" onClick={() => { setOpen(false); setPassword(''); setError('') }}>Cancel</button>
          </div>
        </form>
      )}
    </section>
  )
}
