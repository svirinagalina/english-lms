import { useEffect, useState } from 'react'
import { api } from '../api'

// Settings → «Message to the teachers»: one text to every teacher through the
// school's bot. Starts with the trial-lesson rules (Galina, 2026-10-15).
const RULES = `📌 Новые правила для пробных уроков

1. Запись на пробный — на сайте Advent. Ученик сразу появляется у вас в списке и в Timetable, а здесь, в боте, приходит «Новый пробный урок» — нажмите «Подтверждаю».
2. Перед уроком подготовьте доску в My boards и назначьте её ученику (Assign).
3. В назначенное время нажмите «Открыть урок» → в кабинете ученика — Trial lesson. Ученик заходит по своей ссылке, без регистрации.
4. После урока заполните отчёт и нажмите Send to the student — ученик получит отчёт, цены и кнопку оплаты.
5. Приглашать ученика на платформу не нужно: после оплаты платформа сама пришлёт ему приглашение на почту. Доска и всё с пробного останутся у него.
6. После оплаты договоритесь с учеником о времени и поставьте уроки в Timetable — бот напомнит ему за 15 минут.
7. Перенести, отменить урок или передать его другому учителю — только в Timetable на платформе.

Спасибо! Вопросы — Галине.`

export default function TeacherBroadcast() {
  const [teachers, setTeachers] = useState(null)
  const [text, setText] = useState(RULES)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { api.telegramTeachers().then(({ teachers }) => setTeachers(teachers)).catch(() => setTeachers([])) }, [])
  if (!teachers) return null
  const connected = teachers.filter((t) => t.connected)
  const send = async () => {
    if (!window.confirm(`Отправить это сообщение ${connected.length} учителям в Telegram?`)) return
    setBusy(true); setError(''); setResult(null)
    try { setResult(await api.broadcastToTeachers(text)) } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return (
    <div style={{ marginTop: 20 }}>
      <h3 style={{ margin: '0 0 6px', fontSize: 16 }}>Message to the teachers</h3>
      <p className="muted small-hint" style={{ marginTop: 0 }}>
        In the bot: {connected.length ? connected.map((t) => t.name).join(', ') : 'nobody yet'}.
        {teachers.length > connected.length && <> Not connected (they get nothing until Profile → Connect Telegram): {teachers.filter((t) => !t.connected).map((t) => t.name).join(', ')}.</>}
      </p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={14} style={{ width: '100%', fontFamily: 'inherit', fontSize: 14 }} maxLength={3500} />
      <div className="row-actions" style={{ marginTop: 8 }}>
        <button type="button" onClick={send} disabled={busy || !connected.length || text.trim().length < 5}>{busy ? 'Sending…' : `Send to ${connected.length} teacher${connected.length === 1 ? '' : 's'}`}</button>
      </div>
      {result && <div className="notice">Sent: {result.sent.length ? result.sent.join(', ') : 'nobody'}.{result.missed.length ? ` Not reached: ${result.missed.join(', ')}.` : ''}</div>}
      {error && <div className="error">{error}</div>}
    </div>
  )
}
