import { useEffect, useState } from 'react'
import { api } from '../api'

// The school's Telegram bot (owner, Settings): its key from @BotFather, the
// switch for messages, the booking page for «Выбрать время», a test message.
export default function TelegramSettings() {
  const [bot, setBot] = useState(null)
  const [token, setToken] = useState('')
  const [booking, setBooking] = useState('')
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const load = () => api.telegramSettings().then((data) => { setBot(data); setBooking(data.bookingUrl ?? '') }).catch((err) => setError(err.message))
  useEffect(() => { load() }, [])

  const run = async (name, action, done) => {
    setBusy(name); setError(''); setNotice('')
    try { const data = await action(); if (data?.username !== undefined) setBot(data); if (done) setNotice(done) } catch (err) { setError(err.message) } finally { setBusy('') }
  }
  const saveToken = (event) => {
    event.preventDefault()
    run('token', () => api.saveTelegramToken(token.trim()), token.trim() ? 'Saved. Now connect your own Telegram below.' : 'Bot disconnected.').then(() => setToken(''))
  }
  const toggle = (on) => run('switch', () => api.switchTelegram(on), on ? "Trials from Advent's site are on." : "Trials from Advent's site are off.")
  const saveBooking = (event) => { event.preventDefault(); run('booking', () => api.saveTelegramBooking(booking.trim()), 'Saved.') }
  const test = () => run('test', () => api.testTelegram(), 'Sent — check your Telegram.')

  if (!bot) return error ? <section><h2>Telegram bot</h2><div className="error">{error}</div></section> : null
  const people = bot.connected ?? {}
  const count = (role) => people[role] ?? 0

  return (
    <section>
      <h2>Telegram bot</h2>
      <p className="muted" style={{ marginBottom: 12 }}>
        The school's own bot: the trial lesson from booking to the first payment (link, reminders, the report with prices, the discount days), a reminder 15 minutes before every Timetable lesson, a polite reminder to pay when a package is used up — and every payment and debt to you and the partner. Students connect from their lesson page («Напоминания в Telegram»), everyone else from Profile.
      </p>
      <div className="row" style={{ marginBottom: 12 }}>
        <div>
          <strong>{bot.configured ? `Connected: @${bot.username ?? '…'}` : 'Not connected'}</strong>
          {bot.configured && (
            <div className="muted">
              In the bot — students: {count('STUDENT')}, teachers: {count('TEACHER') + count('PARTNER')}, owners: {count('OWNER')}{bot.fromEnv ? ' · key set on the server' : ''}
            </div>
          )}
        </div>
      </div>

      {!bot.fromEnv && (
        <form className="billing-editor" onSubmit={saveToken} autoComplete="off">
          <label>
            Bot key from @BotFather {bot.configured && <span className="muted">(leave empty and save to disconnect)</span>}
            <input type="password" placeholder="123456789:AAE…" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="new-password" spellCheck={false} />
          </label>
          <div className="editor-actions">
            <button type="submit" disabled={busy === 'token' || (!token.trim() && !bot.configured)}>{busy === 'token' ? 'Checking…' : 'Save'}</button>
          </div>
        </form>
      )}

      {bot.configured && (
        <>
          <div className="row-actions" style={{ margin: '12px 0', flexWrap: 'wrap' }}>
            {bot.myLink && <a className="button-link" style={{ marginTop: 0 }} href={bot.myLink} target="_blank" rel="noreferrer">Connect my Telegram</a>}
            <button type="button" className="ghost" onClick={test} disabled={busy === 'test'}>Send me a test message</button>
          </div>

          <label className="row-actions" style={{ alignItems: 'center', gap: 8 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={bot.on} disabled={busy === 'switch'} onChange={(e) => toggle(e.target.checked)} />
            <span>Also send messages about trials booked on Advent's site</span>
          </label>
          <p className="muted small-hint">
            Everything else already goes as soon as the bot is connected. Switch this on once Advent's bot has stopped sending its own messages, or those students get everything twice.
          </p>

          <form className="inline-form" onSubmit={saveBooking} style={{ marginTop: 12 }}>
            <input type="url" value={booking} onChange={(e) => setBooking(e.target.value)} placeholder="https://advent-academy.online/…" />
            <button type="submit" disabled={busy === 'booking'}>Save</button>
          </form>
          <p className="muted small-hint">The booking page behind «Выбрать время» (after a missed or cancelled trial).</p>
        </>
      )}
      {error && <div className="error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}
    </section>
  )
}
