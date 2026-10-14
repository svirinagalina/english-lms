import { useEffect, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../AuthContext'
import Panel from './Panel'

// Timetable: the free time a teacher offers for trial lessons. Students book
// 40-minute lessons on the hour inside it on the /trial page; when several
// teachers are free, the one with fewer trials this month gets the lesson.
const pad = (n) => String(n).padStart(2, '0')
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
const hm = (d) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const describe = (w) => w.recurrence === 'WEEKLY'
  ? `Every ${new Date(w.startTime).toLocaleDateString('en-GB', { weekday: 'long' })}, ${hm(w.startTime)}–${hm(w.endTime)}`
  : `${new Date(w.startTime).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}, ${hm(w.startTime)}–${hm(w.endTime)}`

export default function TrialWindows() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [form, setForm] = useState({ date: today(), from: '10:00', to: '14:00', weekly: true })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const refresh = () => api.trialWindows().then(setData).catch((err) => setError(err.message))
  useEffect(() => { refresh() }, [])

  const add = async (event) => {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      const startTime = new Date(`${form.date}T${form.from}`)
      const endTime = new Date(`${form.date}T${form.to}`)
      if (endTime <= startTime) throw new Error('"To" must be later than "From"')
      await api.addTrialWindow({
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        recurrence: form.weekly ? 'WEEKLY' : null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      })
      await refresh()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  const remove = async (id) => {
    try { await api.deleteTrialWindow(id); await refresh() } catch (err) { setError(err.message) }
  }

  if (!data) return null
  const mine = data.windows.filter((w) => w.teacherId === user.id)
  const others = data.windows.filter((w) => w.teacherId !== user.id)

  return (
    <Panel id="timetable:trial-windows" title="Free time for trial lessons" count={mine.length}>
      <p className="muted" style={{ marginTop: 0 }}>
        New students book a free 40-minute trial lesson in this time, on the hour and at least 3 hours ahead, on <a href={data.page} target="_blank" rel="noreferrer">{data.page.replace(/^https:\/\//, '')}</a>. If several teachers are free at that hour, the one with fewer trials this month gets it. A booked lesson appears in your Timetable once the student confirms it in Telegram.
      </p>
      {!data.open && <div className="notice">The booking page opens once the school's Telegram bot is connected (Settings → Telegram bot).</div>}

      <form className="inline-form" onSubmit={add} style={{ flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={{ width: 'auto' }} required />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>From <input type="time" step="1800" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} style={{ width: 'auto' }} required /></label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>to <input type="time" step="1800" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} style={{ width: 'auto' }} required /></label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={form.weekly} onChange={(e) => setForm({ ...form, weekly: e.target.checked })} style={{ width: 'auto' }} />
          every week
        </label>
        <button type="submit" disabled={busy}>{busy ? 'Adding…' : 'Add'}</button>
      </form>
      {error && <div className="error">{error}</div>}

      <div className="list" style={{ marginTop: 12 }}>
        {!mine.length && <p className="muted">You haven't offered any time yet.</p>}
        {mine.map((w) => (
          <div key={w.id} className="row">
            <span>{describe(w)}</span>
            <button type="button" className="ghost" onClick={() => remove(w.id)}>Remove</button>
          </div>
        ))}
      </div>
      {others.length > 0 && (
        <>
          <h3 style={{ margin: '16px 0 8px', fontSize: 15 }}>Other teachers</h3>
          <div className="list">
            {others.map((w) => (
              <div key={w.id} className="row">
                <span><strong>{w.teacher.name}</strong> · {describe(w)}</span>
                <button type="button" className="ghost" onClick={() => remove(w.id)}>Remove</button>
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  )
}
