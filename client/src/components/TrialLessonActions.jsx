import { useState } from 'react'
import { api } from '../api'
import { useAuth } from '../AuthContext'

// A booked trial lesson in the Timetable: moved, given to another teacher
// (admins) or cancelled only here — the bot tells the student and the teachers.
const pad = (n) => String(n).padStart(2, '0')
const toLocalInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`

export default function TrialLessonActions({ lesson, small, onCancel, onChanged }) {
  const { user } = useAuth()
  const admin = user.role === 'OWNER' || user.role === 'PARTNER'
  const [mode, setMode] = useState(null) // 'move' | 'teacher'
  const [when, setWhen] = useState('')
  const [teachers, setTeachers] = useState([])
  const [teacherId, setTeacherId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const buttonStyle = small ? { fontSize: 10 } : undefined

  const open = async (next) => {
    setError(''); setMode(next)
    if (next === 'move') setWhen(toLocalInput(new Date(lesson.startTime)))
    if (next === 'teacher') {
      const { teachers } = await api.bookingTeachers().catch(() => ({ teachers: [] }))
      setTeachers(teachers); setTeacherId('')
    }
  }
  const save = async () => {
    setBusy(true); setError('')
    try {
      if (mode === 'move') await api.moveTrialLesson(lesson.advent.id, new Date(when).toISOString())
      else await api.reassignTrialLesson(lesson.advent.id, teacherId)
      setMode(null)
      await onChanged()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <>
      <div style={{ display: 'flex', gap: small ? 4 : 6, marginTop: small ? 4 : 6, flexWrap: 'wrap' }}>
        <button type="button" className="timetable-edit" style={buttonStyle} onClick={() => open('move')}>Move</button>
        {admin && <button type="button" className="timetable-edit" style={buttonStyle} onClick={() => open('teacher')}>Teacher</button>}
        <button type="button" className="timetable-edit" style={buttonStyle} onClick={onCancel} title="Cancel this lesson; the student is told">Cancel lesson</button>
      </div>
      {mode && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setMode(null)}>
          <div style={{ background: '#0f3731', color: 'var(--text)', border: '1px solid var(--border)', padding: 24, borderRadius: 12, width: 'min(400px, calc(100vw - 32px))', boxShadow: '0 10px 30px rgba(0,0,0,0.4)' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>{mode === 'move' ? 'Move the lesson' : 'Give the lesson to another teacher'}</h3>
            <p className="muted" style={{ marginTop: 0 }}>{lesson.title} · the student and the teachers are told in Telegram.</p>
            {mode === 'move' ? (
              <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
            ) : (
              <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
                <option value="">Choose a teacher…</option>
                {teachers.filter((t) => t.id !== lesson.userId).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
            {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" className="ghost" onClick={() => setMode(null)}>Cancel</button>
              <button type="button" onClick={save} disabled={busy || (mode === 'move' ? !when : !teacherId)} style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}>{busy ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
