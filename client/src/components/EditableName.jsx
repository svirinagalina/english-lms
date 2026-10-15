import { useState } from 'react'
import { api } from '../api'

// A person's name with a small ✎ next to it: staff fix a student's first and
// last name right where they see it. The name is stored once, so the change
// shows everywhere on the platform.
export default function EditableName({ id, name, onSaved, as: Tag = 'strong' }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const save = async (event) => {
    event.preventDefault()
    const next = value.trim()
    if (next === name) { setEditing(false); return }
    setBusy(true); setError('')
    try {
      await api.updateUser(id, { name: next })
      setEditing(false)
      await onSaved?.(next)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  if (!editing) {
    return (
      <span className="editable-name">
        <Tag>{name}</Tag>
        <button type="button" className="ghost editable-name-btn" title="Изменить имя и фамилию" aria-label="Изменить имя и фамилию" onClick={() => { setValue(name); setEditing(true) }}>✎</button>
      </span>
    )
  }
  return (
    <form className="editable-name-form" onSubmit={save}>
      <input value={value} onChange={(e) => setValue(e.target.value)} minLength={2} maxLength={80} autoFocus required aria-label="Имя и фамилия" />
      <button type="submit" disabled={busy}>Save</button>
      <button type="button" className="ghost" onClick={() => setEditing(false)}>Cancel</button>
      {error && <span className="error">{error}</span>}
    </form>
  )
}
