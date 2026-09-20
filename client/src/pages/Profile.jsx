import { useRef, useState } from 'react'
import Nav from '../components/Nav'
import { Avatar } from '../components/Avatar'
import { useAuth } from '../AuthContext'
import { api } from '../api'

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

  const emailChanged = email.trim().toLowerCase() !== user.email
  const needsPassword = emailChanged || newPassword

  const save = async (event) => {
    event.preventDefault()
    setError(''); setMessage('')
    if (newPassword && newPassword !== repeat) { setError('The new password and its repeat differ'); return }
    if (newPassword && newPassword.length < 8) { setError('The new password needs at least 8 characters'); return }
    setSaving(true)
    try {
      const body = { name: name.trim(), email: email.trim().toLowerCase() }
      if (needsPassword) body.currentPassword = currentPassword
      if (newPassword) body.newPassword = newPassword
      const { user: updated } = await api.updateProfile(body)
      updateUser(updated)
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
    </div>
  )
}
