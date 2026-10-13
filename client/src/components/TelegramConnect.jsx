import { useEffect, useState } from 'react'
import { api } from '../api'

// Profile: connect one's own Telegram to the school's bot (lessons,
// reminders, payments). Hidden until the owner has set the bot up.
export default function TelegramConnect() {
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
    <section className="profile" style={{ marginTop: 16 }}>
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
