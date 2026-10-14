import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'

// The trial-lesson booking page (/trial). Maxim's site is only the way in:
// its «Записаться» button opens this page (utm_* in the address are kept).
// The student picks a time — the teacher is chosen by the platform — leaves a
// name and confirms in the school's Telegram bot, where the link and the
// reminders come. Times are Moscow time, as everywhere for students.
const MSK = 'Europe/Moscow'
const dayLabel = (date) => new Date(`${date}T12:00:00+03:00`).toLocaleDateString('ru-RU', { timeZone: MSK, weekday: 'short', day: 'numeric', month: 'short' })
const timeMsk = (iso) => new Date(iso).toLocaleTimeString('ru-RU', { timeZone: MSK, hour: '2-digit', minute: '2-digit' })
const timeHere = (iso) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
const whenMsk = (iso) => new Date(iso).toLocaleString('ru-RU', { timeZone: MSK, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
// The student's own clock differs from Moscow's: show both.
const otherZone = new Date().toLocaleTimeString('ru-RU', { timeZone: MSK, hour: '2-digit' }) !== new Date().toLocaleTimeString('ru-RU', { hour: '2-digit' })

const SAVED = 'trial-booking'
const load = () => { try { return JSON.parse(localStorage.getItem(SAVED) ?? 'null') } catch { return null } }
const save = (value) => { try { value ? localStorage.setItem(SAVED, JSON.stringify(value)) : localStorage.removeItem(SAVED) } catch { /* private window */ } }
const utmFromUrl = () => {
  const params = new URLSearchParams(window.location.search)
  return Object.fromEntries(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref'].map((k) => [k, params.get(k)]).filter(([, v]) => v))
}

export default function TrialBooking() {
  const [slots, setSlots] = useState(null)
  const [day, setDay] = useState(null)
  const [time, setTime] = useState(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [booking, setBooking] = useState(load)
  const [lesson, setLesson] = useState(null)

  const loadSlots = () => api.bookingSlots().then((data) => {
    setSlots(data)
    setDay((d) => (d && data.days.some((x) => x.date === d) ? d : data.days[0]?.date ?? null))
  }).catch(() => setSlots({ open: false, days: [] }))
  useEffect(() => { if (!booking) loadSlots() }, [booking])

  // After booking: wait for the Start in Telegram, then show the lesson.
  useEffect(() => {
    if (!booking) return
    let stop = false
    const check = () => api.lessonLink(booking.token).then((info) => { if (!stop) setLesson(info) }).catch(() => { if (!stop) { save(null); setBooking(null) } })
    check()
    const timer = setInterval(() => { if (lesson?.status !== 'scheduled') check() }, 4000)
    return () => { stop = true; clearInterval(timer) }
  }, [booking?.token, lesson?.status])

  const times = useMemo(() => slots?.days.find((d) => d.date === day)?.times ?? [], [slots, day])

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      const result = await api.bookTrial({ startsAt: time, name: name.trim(), email: email.trim(), utm: utmFromUrl(), website })
      const value = { token: result.token, telegram: result.telegram, startsAt: result.startsAt, hours: result.confirmHours }
      save(value)
      setBooking(value)
    } catch (err) {
      setError(err.message)
      if (err.data?.error && /заняли|недоступно/.test(err.data.error)) { setTime(null); loadSlots() }
    } finally { setBusy(false) }
  }
  const again = () => { save(null); setBooking(null); setLesson(null); setTime(null) }

  const header = (
    <>
      <div className="ll-kicker">Advent Academy</div>
      <h1 className="ll-title">Бесплатный пробный урок</h1>
      <p className="ll-when">40 минут с преподавателем: определим уровень, поговорим о целях и составим план.</p>
    </>
  )

  // Booked: confirm in Telegram, then the lesson.
  if (booking) {
    const confirmed = lesson?.status === 'scheduled'
    const cancelled = lesson?.status === 'cancelled'
    return (
      <div className="centered"><div className="card ll-card">
        {header}
        {cancelled ? (
          <>
            <p className="error">Запись отменена: её не подтвердили в Telegram.</p>
            <button type="button" className="ll-go" onClick={again}>Записаться снова</button>
          </>
        ) : confirmed ? (
          <>
            <div className="ll-wait"><span className="ll-dot" />Вы записаны ✅ {whenMsk(lesson.startsAt)} МСК{lesson.teacherName ? `, преподаватель ${lesson.teacherName}` : ''}.</div>
            <p>Ссылка на урок пришла в Telegram. Перед уроком бот напомнит. Регистрироваться не нужно — в назначенное время откройте ссылку и введите имя.</p>
            <a className="button ll-go" href={`/lesson/${booking.token}`}>Открыть страницу урока</a>
          </>
        ) : (
          <>
            <p className="bk-chosen">{whenMsk(booking.startsAt)} МСК</p>
            <p><strong>Почти готово!</strong> Подтвердите запись в Telegram: нажмите кнопку и затем «Start» в боте. Туда придёт ссылка на урок и напоминания.</p>
            {booking.telegram && <a className="ll-tg" href={booking.telegram} target="_blank" rel="noreferrer">✈️ Подтвердить в Telegram</a>}
            <p className="muted ll-tg-hint">Без подтверждения запись отменится через {booking.hours ?? 24} ч. Эта страница обновится сама.</p>
            <button type="button" className="ghost bk-again" onClick={again}>Выбрать другое время</button>
          </>
        )}
      </div></div>
    )
  }

  if (!slots) return <div className="centered">Загрузка…</div>

  if (!slots.open || !slots.days.length) {
    return (
      <div className="centered"><div className="card ll-card">
        {header}
        <p>{slots.open ? 'Свободного времени на ближайшие две недели пока нет — загляните чуть позже.' : 'Запись скоро откроется.'}</p>
      </div></div>
    )
  }

  return (
    <div className="centered"><div className="card ll-card">
      {header}
      {!time ? (
        <>
          <p className="bk-label">Выберите день</p>
          <div className="bk-days">
            {slots.days.map((d) => (
              <button key={d.date} type="button" className={`bk-chip${d.date === day ? ' on' : ''}`} onClick={() => setDay(d.date)}>{dayLabel(d.date)}</button>
            ))}
          </div>
          <p className="bk-label">Время (московское)</p>
          <div className="bk-times">
            {times.map((t) => (
              <button key={t} type="button" className="bk-chip" onClick={() => setTime(t)}>
                {timeMsk(t)}{otherZone && <small>у вас {timeHere(t)}</small>}
              </button>
            ))}
          </div>
        </>
      ) : (
        <form onSubmit={submit} className="ll-form">
          <p className="bk-chosen">{whenMsk(time)} МСК <button type="button" className="bk-change" onClick={() => setTime(null)}>изменить</button></p>
          <label>Как вас зовут?
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Имя" maxLength={80} autoFocus required />
          </label>
          <label>Почта <span className="muted">(необязательно)</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@mail.ru" maxLength={200} />
          </label>
          <input className="bk-trap" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} aria-hidden="true" />
          {error && <p className="error">{error}</p>}
          <button type="submit" className="ll-go" disabled={busy || !name.trim()}>{busy ? 'Записываю…' : 'Записаться'}</button>
          <p className="muted ll-note">Дальше — подтверждение в Telegram: туда придёт ссылка на урок. Урок идёт в браузере, ничего устанавливать не нужно.</p>
        </form>
      )}
    </div></div>
  )
}
