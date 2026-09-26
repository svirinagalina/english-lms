import { useEffect, useState } from 'react'
import { api } from '../api'

// Settings → iPhone notifications: the Apple push key (.p8 file, Key ID,
// Team ID) from the Apple Developer account. Stored encrypted on the server.
export default function PushSettings() {
  const [state, setState] = useState(null)
  const [form, setForm] = useState({ key: '', keyId: '', teamId: '' })
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  useEffect(() => { api.pushSettings().then(setState).catch(() => {}) }, [])

  const run = async (action, done) => {
    setBusy(true); setNotice(''); setError('')
    try {
      const result = await action()
      done(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const readFile = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    const text = await file.text()
    // AuthKey_ABC123DEFG.p8: the Key ID is in the file's name.
    const keyId = file.name.match(/AuthKey_([A-Z0-9]{10})/i)?.[1]
    setForm((f) => ({ ...f, key: text, keyId: f.keyId || keyId || '' }))
  }

  const save = (event) => {
    event.preventDefault()
    run(() => api.savePushSettings(form), (saved) => {
      setState(saved)
      setForm({ key: '', keyId: '', teamId: '' })
      setNotice('Saved. Open the app on your iPhone, allow notifications, then send yourself a test.')
    })
  }

  if (!state) return null

  return (
    <section>
      <h2>iPhone notifications</h2>
      <p className="muted" style={{ marginBottom: 12 }}>
        The app tells students when a lesson starts, 15 minutes before a Timetable lesson, when you set homework, and what a lesson added to practise;
        you get trial-lesson requests. It needs Apple's push key: in your Apple Developer account, <em>Certificates, IDs &amp; Profiles → Keys → +</em>,
        tick <em>Apple Push Notifications service</em>, download the <code>.p8</code> file (Apple lets you download it only once) and choose it here.
        The Team ID is under <em>Membership details</em>. Stored encrypted, never shown again.
      </p>
      <div className="row" style={{ marginBottom: 12 }}>
        <div>
          <strong>{state.configured ? 'Connected' : 'Not connected'}</strong>
          {state.configured && <div className="muted">Key {state.keyId} · Team {state.teamId}{state.fromEnv ? ' · set on the server' : ''} · your phones: {state.myDevices}</div>}
        </div>
        {state.configured && (
          <div className="row-actions">
            <button type="button" className="ghost" disabled={busy} onClick={() => run(api.testPush, ({ delivered }) => setNotice(`Sent to ${delivered} ${delivered === 1 ? 'phone' : 'phones'}.`))}>Send me a test</button>
            {!state.fromEnv && <button type="button" className="ghost" disabled={busy} onClick={() => run(api.clearPushSettings, (s) => { setState(s); setNotice('Key removed: no notifications are sent.') })}>Remove key</button>}
          </div>
        )}
      </div>
      {!state.fromEnv && (
        <form className="billing-editor" onSubmit={save} autoComplete="off">
          <label>
            Key file (.p8)
            <input type="file" accept=".p8,text/plain" onChange={readFile} />
          </label>
          {form.key && <div className="muted">Key file loaded.</div>}
          <label>
            Key ID
            <input value={form.keyId} onChange={(e) => setForm({ ...form, keyId: e.target.value })} placeholder="10 letters and digits" maxLength={10} spellCheck={false} />
          </label>
          <label>
            Team ID
            <input value={form.teamId} onChange={(e) => setForm({ ...form, teamId: e.target.value })} placeholder="10 letters and digits" maxLength={10} spellCheck={false} />
          </label>
          {error && <div className="error">{error}</div>}
          {notice && <div className="notice">{notice}</div>}
          <div className="editor-actions">
            <button type="submit" disabled={busy || !form.key || !form.keyId.trim() || !form.teamId.trim()}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      )}
      {state.fromEnv && (error || notice) && <div className={error ? 'error' : 'notice'}>{error || notice}</div>}
    </section>
  )
}
