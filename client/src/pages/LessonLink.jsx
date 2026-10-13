import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../AuthContext'

// The page behind a lesson link from the Advent site (sent to the student in
// Telegram): no sign-up, no password. The student checks their name, presses
// one button and waits here; the moment the teacher starts the lesson, the
// call opens by itself. A teacher's link signs them in and opens the
// student's cabinet, where they press Trial lesson.
const when = (iso) => new Date(iso).toLocaleString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

function DeviceCheck() {
  const videoRef = useRef(null)
  const [state, setState] = useState('idle') // idle | on | denied
  const [level, setLevel] = useState(0)
  useEffect(() => () => videoRef.current?.srcObject?.getTracks().forEach((t) => t.stop()), [])
  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      videoRef.current.srcObject = stream
      setState('on')
      const ctx = new AudioContext()
      const analyser = ctx.createAnalyser()
      ctx.createMediaStreamSource(stream).connect(analyser)
      const data = new Uint8Array(analyser.fftSize)
      const tick = () => {
        if (!stream.active) { ctx.close(); return }
        analyser.getByteTimeDomainData(data)
        let peak = 0
        for (const v of data) peak = Math.max(peak, Math.abs(v - 128))
        setLevel(Math.min(1, peak / 64))
        requestAnimationFrame(tick)
      }
      tick()
    } catch {
      setState('denied')
    }
  }
  return (
    <div className="ll-check">
      <video ref={videoRef} autoPlay playsInline muted className="ll-video" style={{ display: state === 'on' ? 'block' : 'none' }} />
      {state === 'on' && (
        <div className="ll-meter" title="Скажите что-нибудь — полоска должна двигаться"><i style={{ width: `${Math.round(level * 100)}%` }} /></div>
      )}
      {state === 'idle' && <button type="button" className="ghost" onClick={start}>Проверить камеру и микрофон</button>}
      {state === 'on' && <p className="muted">Видите себя, и полоска двигается, когда говорите? Всё готово.</p>}
      {state === 'denied' && (
        <p className="error">Браузер не дал доступ к камере или микрофону. Нажмите на значок замка или камеры в адресной строке, разрешите доступ и обновите страницу.</p>
      )}
    </div>
  )
}

export default function LessonLink() {
  const { token } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [info, setInfo] = useState(null)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => api.lessonLink(token).then((data) => { setInfo(data); setName((n) => n || data.studentName || '') }).catch((err) => setError(err.message))
  useEffect(() => { load() }, [token])

  // Signed in as this lesson's student: wait here, open the call when it starts.
  const inside = info?.role === 'student' && user?.role === 'STUDENT'
  useEffect(() => {
    if (!inside) return
    if (info.callToken) { navigate(`/call/${info.callToken}`, { replace: true }); return }
    const timer = setInterval(load, 4000)
    return () => clearInterval(timer)
  }, [inside, info?.callToken])

  const enter = async (event) => {
    event?.preventDefault()
    setBusy(true); setError('')
    try {
      const result = await api.enterLessonLink(token, name.trim())
      // A fresh page, so the whole app knows who is signed in.
      window.location.assign(result.redirect ?? window.location.pathname)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  if (error && !info) return <div className="centered"><div className="card ll-card"><h2>Не получилось открыть урок</h2><p className="error">{error}</p></div></div>
  if (!info) return <div className="centered">Загрузка…</div>

  const what = info.kind === 'trial' ? 'Пробный урок' : 'Урок'
  const header = (
    <>
      <div className="ll-kicker">Advent Academy</div>
      <h1 className="ll-title">{what}{info.teacherName ? ` с ${info.teacherName}` : ''}</h1>
      <p className="ll-when">{when(info.startsAt)} · {info.durationMin} мин</p>
    </>
  )

  if (info.status === 'cancelled') {
    return <div className="centered"><div className="card ll-card">{header}<p className="error">Этот урок отменён. Новую запись можно сделать на сайте Advent.</p></div></div>
  }

  // The teacher's link.
  if (info.role === 'teacher') {
    return (
      <div className="centered"><div className="card ll-card">
        {header}
        <p>Ученик: <strong>{info.studentName ?? '—'}</strong>. Он войдёт по своей ссылке без регистрации.</p>
        <p className="muted">Откроется кабинет ученика — нажмите там <strong>Trial lesson</strong>, ученика впустит в звонок само.</p>
        {error && <p className="error">{error}</p>}
        <button className="ll-go" onClick={enter} disabled={busy}>{busy ? 'Открываю…' : 'Открыть кабинет ученика'}</button>
      </div></div>
    )
  }

  if (inside) {
    return (
      <div className="centered"><div className="card ll-card">
        {header}
        <div className="ll-wait"><span className="ll-dot" />Вы на месте! {info.teacherName ?? 'Преподаватель'} начнёт урок — страница откроет его сама. Ничего нажимать не нужно.</div>
        <DeviceCheck />
      </div></div>
    )
  }

  if (info.ownAccount) {
    return (
      <div className="centered"><div className="card ll-card">
        {header}
        <p>У вас уже есть аккаунт на платформе. Войдите в него — урок начнётся в вашем кабинете.</p>
        <a className="ll-go" href={`/login?next=${encodeURIComponent(`/lesson/${token}`)}`}>Войти</a>
      </div></div>
    )
  }

  return (
    <div className="centered"><div className="card ll-card">
      {header}
      <form onSubmit={enter} className="ll-form">
        <label>Как вас зовут?
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Имя" maxLength={80} autoFocus required />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="ll-go" disabled={busy || !name.trim()}>{busy ? 'Вхожу…' : 'Войти на урок'}</button>
        <p className="muted ll-note">Без регистрации и паролей — нужна только эта ссылка. Урок идёт прямо в браузере, ничего устанавливать не нужно.</p>
      </form>
    </div></div>
  )
}
