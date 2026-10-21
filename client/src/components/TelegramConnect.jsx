import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'

// Home, for a teacher whose Telegram isn't connected: a short reminder —
// lesson notices, payments and «✅ Отметить урок» come through the bot, and
// the Profile block was easy to miss (Nessa, 2026-10-21). «Later» hides it
// for a week in this browser.
const SNOOZE_KEY = 'telegram.reminder.snoozedUntil'
export function TelegramReminder() {
  const [me, setMe] = useState(null)
  const [snoozed, setSnoozed] = useState(() => { try { return Number(localStorage.getItem(SNOOZE_KEY)) > Date.now() } catch { return false } })
  useEffect(() => { if (!snoozed) api.telegramMe().then(setMe).catch(() => {}) }, [snoozed])
  if (snoozed || !me?.ready || me.connected) return null
  const later = () => { try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + 7 * 86400000)) } catch { /* private mode */ } setSnoozed(true) }
  return (
    <div className="notice telegram-reminder">
      <strong>Подключите Telegram-бот школы.</strong> Туда приходят пробные уроки, напоминания, оплаты учеников, а после урока можно нажать «✅ Отметить урок».
      <div className="row-actions" style={{ marginTop: 8 }}>
        <a className="button-link" href={me.link} target="_blank" rel="noreferrer">Подключить Telegram</a>
        <Link className="button ghost" to="/profile">Профиль</Link>
        <button type="button" className="ghost" onClick={later}>Позже</button>
      </div>
    </div>
  )
}

// Profile: connect one's own Telegram to the school's bot (lessons,
// reminders, payments). Hidden until the owner has set the bot up.
export default function TelegramConnect({ first = false }) {
  const [me, setMe] = useState(null)
  const load = () => api.telegramMe().then(setMe).catch(() => {})
  useEffect(() => {
    load()
    // Back from Telegram: show the new state.
    const refresh = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', refresh)
    return () => document.removeEventListener('visibilitychange', refresh)
  }, [])
  if (!me?.ready) return null
  const disconnect = async () => { await api.disconnectTelegram().catch(() => {}); load() }
  return (
    <section className="profile" style={first ? { marginBottom: 16 } : { marginTop: 16 }}>
      <h2>Telegram</h2>
      {me.connected ? (
        <div className="row-actions" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="paid-badge active">Connected{me.name ? ` · ${me.name}` : ''}</span>
          <button type="button" className="ghost" onClick={disconnect}>Disconnect</button>
        </div>
      ) : (
        <>
          <p className="muted">Lesson reminders, new trial lessons and payments come to Telegram. Press the button, then Start in the bot.</p>
          <a className="button-link" href={me.link} target="_blank" rel="noreferrer">Connect Telegram</a>
        </>
      )}
    </section>
  )
}
