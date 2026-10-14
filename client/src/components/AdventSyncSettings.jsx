import { useEffect, useState } from 'react'
import { api } from '../api'

// Settings → «Advent site»: is the platform in step with Maxim's site? The
// last comparison of both lesson lists, and what is still on its way there.
const KIND = { started: 'урок начался', finished: 'итог урока', report: 'отчёт', cancel: 'отмена', move: 'перенос', teacher: 'смена учителя', payment: 'оплата', links: 'ссылки на урок' }
const when = (iso) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function Lines({ title, items, bad }) {
  if (!items?.length) return null
  return (
    <div style={{ marginTop: 8 }}>
      <strong>{title}</strong>
      <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
        {items.map((x, i) => <li key={i} className={bad ? 'error' : undefined} style={bad ? { background: 'none', padding: 0 } : undefined}>{x}</li>)}
      </ul>
    </div>
  )
}

export default function AdventSyncSettings() {
  const [sync, setSync] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { api.adventSync().then(setSync).catch((err) => setError(err.message)) }, [])
  const run = async (name, action) => {
    setBusy(name); setError('')
    try { setSync(await action()) } catch (err) { setError(err.message) } finally { setBusy('') }
  }
  if (!sync) return error ? <section><h2>Advent site</h2><div className="error">{error}</div></section> : null
  const last = sync.last
  const clean = last?.ok && !last.problems?.length && !last.onlyHere?.length && !sync.outbox.problems.some((p) => p.failedAt)

  return (
    <section>
      <h2>Advent site</h2>
      <p className="muted" style={{ marginBottom: 12 }}>
        Trials are booked on Maxim's site and come here. Everything that happens to them here — the lesson started, its outcome, the report, a cancellation, a move, a new teacher — goes back to his site. Payments stay on the platform only, and is retried until his site takes it. Every 6 hours both lesson lists are compared; you get a Telegram message when something was put right or needs a look.
      </p>
      {!sync.enabled && <div className="error">Not connected: ADVENT_API_KEY / ADVENT_WEBHOOK_SECRET are not set on the server.</div>}
      {last && (
        <div className={clean ? 'notice' : undefined} style={{ marginBottom: 12 }}>
          <div><strong>Last check:</strong> {when(last.at)} — {last.ok ? `${last.theirs} lessons on his site${clean ? ', everything matches ✓' : ''}` : last.error}</div>
          <Lines title="Brought in from his site" items={last.imported} />
          <Lines title="Put right here" items={last.fixedHere} />
          <Lines title="Sent to his site again" items={last.sentThere} />
          <Lines title="Only on the platform" items={last.onlyHere} bad />
          <Lines title="Needs a look" items={last.problems} bad />
        </div>
      )}
      <div className="muted">
        On the way to his site: {sync.outbox.waiting} · delivered in the last 24 h: {sync.outbox.sentToday}
      </div>
      {sync.outbox.problems.length > 0 && (
        <div className="list" style={{ marginTop: 8 }}>
          {sync.outbox.problems.map((p) => (
            <div key={p.id} className="row">
              <div>
                <strong>{KIND[p.kind] ?? p.kind}</strong> · {when(p.createdAt)} · {p.failedAt ? 'refused' : `try ${p.attempts}`}
                <div className="muted" style={{ wordBreak: 'break-word' }}>{p.lastError}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="row-actions" style={{ marginTop: 12 }}>
        <button type="button" onClick={() => run('run', api.runAdventSync)} disabled={busy === 'run'}>{busy === 'run' ? 'Checking…' : 'Check now'}</button>
        {sync.outbox.problems.some((p) => p.failedAt) && <button type="button" className="ghost" onClick={() => run('retry', api.retryAdventSync)} disabled={busy === 'retry'}>Send the refused ones again</button>}
      </div>
      {error && <div className="error">{error}</div>}
    </section>
  )
}
