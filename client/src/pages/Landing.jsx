import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { Brand, SiteFooter } from '../components/Brand'

// What a signed-out visitor sees at the site's address. The hero shows the
// product itself (a board word with its translation, a checked exercise, a
// lesson in progress) rather than generic cards; headings use the Fraunces
// accent serif next to the brand's Manrope.

const Icon = ({ name, size = 26 }) => {
  const paths = {
    call: <><rect x="3" y="6" width="13" height="12" rx="3" /><path d="M16 10.5 21 7.5v9l-5-3" /><path d="M7 12h5" /></>,
    grammar: <><path d="M5 4h10l4 4v12H5z" /><path d="M15 4v4h4" /><path d="m8.5 14 2 2 4-4.5" /></>,
    words: <><rect x="4" y="6" width="12" height="14" rx="2" /><path d="M8 3h10a2 2 0 0 1 2 2v12" /><path d="M7.5 11h5M7.5 15h3" /></>,
    speak: <><path d="M4 6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-6l-5 4v-4H7a3 3 0 0 1-3-3z" /><path d="M9 9.5v1M12 8v4M15 9.5v1" /></>,
    play: <path d="M8 5.5v13l10-6.5z" />
  }
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}

// A hand-drawn stroke under a word.
const Scribble = () => (
  <svg className="scribble" viewBox="0 0 300 24" preserveAspectRatio="none" aria-hidden="true">
    <path d="M4 15c40-9 92-12 146-9 52 3 98 1 146-7M24 20c60-6 140-7 250-4" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
  </svg>
)

function HeroCollage() {
  return (
    <div className="collage" aria-hidden="true">
      <div className="collage-board">
        <div className="collage-board-bar"><span /><span /><span /><em>Доска урока</em></div>
        <p className="collage-hand">I've been living here <mark>since</mark> 2019.</p>
        <p className="collage-hand small">She <s>don't</s> <ins>doesn't</ins> like coffee.</p>
        <p className="collage-hand note">+ since → в мои слова</p>
        <div className="collage-word">
          <div className="collage-word-top"><strong>since</strong><span className="collage-play"><Icon name="play" size={12} /></span></div>
          <div className="muted">/sɪns/</div>
          <div>с (какого-то момента)</div>
        </div>
      </div>
      <div className="collage-check">
        <span className="collage-tick">✓</span>
        <div>
          <strong>Верно!</strong>
          <div className="muted">«I have lived here» — тоже подходит</div>
        </div>
      </div>
      <div className="collage-call">
        <span className="collage-avatar">G</span>
        <div>
          <strong>Урок идёт</strong>
          <div className="muted"><span className="collage-dot" />12:40</div>
        </div>
      </div>
    </div>
  )
}

const FEATURES = [
  {
    icon: 'call', kicker: 'Видеозвонки', title: 'Видеозвонки для уроков',
    text: 'Удобная интерактивная онлайн-доска со встроенным переводом и озвучкой слов.',
    art: <div className="art-board"><span className="art-word">comfortable</span><span className="art-tip">удобный · /ˈkʌmftəbl/</span></div>
  },
  {
    icon: 'grammar', kicker: 'Грамматика', title: 'Упражнения для самопроверки',
    text: <>Наш ИИ-ментор, обученный на авторской методике преподавания <Link to="/author">Галины Свириной</Link>, проверит ваши упражнения и покажет аналитику прогресса. Занимайтесь в любое время и в любом месте.</>,
    art: (
      <div className="art-progress">
        {[['Present Perfect', 86], ['Articles', 64], ['Past Simple', 92]].map(([topic, value]) => (
          <div key={topic}><span>{topic}</span><i style={{ '--v': `${value}%` }} /><b>{value}%</b></div>
        ))}
      </div>
    )
  },
  {
    icon: 'words', kicker: 'Слова', title: 'Слова, которые не забываются',
    text: 'Словарь с произношением, свои слова в один клик прямо с доски и карточки с интервальным повторением: приложение само напомнит, что пора повторить.',
    art: <div className="art-cards"><div className="art-card back">удобный</div><div className="art-card front">comfortable<small>повторить через 3 дня</small></div></div>
  },
  {
    icon: 'speak', kicker: 'Разговор', title: 'Чат-бот, с которым не стыдно',
    text: 'Говорите вслух сколько угодно и получайте исправления. Никто не смотрит, никто не торопит — лучший способ перестать бояться говорить.',
    art: <div className="art-chat"><span className="me">I go to Paris last summer</span><span className="bot">Почти! <b>I went</b> — прошлое время</span></div>
  }
]

const STEPS = [
  { title: 'Оставьте заявку', text: 'Имя и как с вами связаться — это минута.' },
  { title: 'Мы напишем вам', text: 'Ответим в Telegram или на почту, расскажем про платформу и откроем доступ.' },
  { title: 'Занимайтесь сами', text: 'Грамматика, слова, карточки и чат-бот — в любое время и в любом месте.' }
]

const FAQ = [
  { q: 'Как получить доступ к платформе?', a: 'Оставьте заявку внизу страницы — мы напишем вам в Telegram или на почту и откроем доступ.' },
  { q: 'Чем это лучше Zoom или Duolingo?', a: 'Здесь звонок, доска, грамматика, словарь и разговорная практика в одном месте. Слова с урока сразу попадают в ваши карточки.' },
  { q: 'А если я хочу заниматься с преподавателем?', a: 'Напишите об этом в комментарии к заявке — подберём преподавателя и запишем на пробный урок.' }
]

const EMPTY_FORM = { name: '', messenger: '', email: '', comment: '', website: '' }

// The request form: goes to the owners' email and Telegram (server/src/routes/leads.js).
function ApplyForm() {
  const [form, setForm] = useState(EMPTY_FORM)
  const [state, setState] = useState({ busy: false, done: false, error: '' })
  const field = (key) => ({ value: form[key], onChange: (e) => setForm({ ...form, [key]: e.target.value }) })

  const submit = async (event) => {
    event.preventDefault()
    if (state.busy) return
    if (!form.messenger.trim() && !form.email.trim()) return setState({ busy: false, done: false, error: 'Оставьте Telegram или почту, чтобы мы могли ответить' })
    setState({ busy: true, done: false, error: '' })
    try {
      await api.sendLead({ source: 'platform', ...form })
      setState({ busy: false, done: true, error: '' })
      setForm(EMPTY_FORM)
    } catch (err) {
      setState({ busy: false, done: false, error: err.message })
    }
  }

  if (state.done) {
    return (
      <div className="lp-form lp-form-done">
        <strong>Спасибо, заявка отправлена!</strong>
        <p>Мы напишем вам в ближайшее время.</p>
      </div>
    )
  }
  return (
    <form className="lp-form" onSubmit={submit}>
      <label>Имя<input required maxLength={100} autoComplete="name" {...field('name')} /></label>
      <label>Telegram или WhatsApp<input maxLength={120} placeholder="@username или номер" {...field('messenger')} /></label>
      <label>Почта<input type="email" maxLength={160} autoComplete="email" {...field('email')} /></label>
      <label>Комментарий<textarea rows={3} maxLength={2000} placeholder="Ваш уровень, цель, что хотите подтянуть" {...field('comment')} /></label>
      <input className="lp-hp" tabIndex={-1} autoComplete="off" aria-hidden="true" {...field('website')} />
      {state.error && <p className="lp-form-error" role="alert">{state.error}</p>}
      <button className="lp-btn dark" type="submit" disabled={state.busy}>{state.busy ? 'Отправляем…' : 'Отправить заявку'}</button>
    </form>
  )
}

export default function Landing() {
  return (
    <div className="lp">
      <div className="lp-glow" aria-hidden="true" />
      <header className="lp-head">
        <Brand />
        <Link className="lp-signin" to="/login">Войти</Link>
      </header>

      <main>
        <section className="lp-hero">
          <div className="lp-hero-text">
            <span className="lp-eyebrow">Все инструменты для изучения английского в одном месте</span>
            <h1>Эффективная среда изучения <span className="lp-accent">английского<Scribble /></span></h1>
            <p className="lp-lead">Видеоуроки на общей доске, упражнения с умной проверкой, слова, которые запоминаются, и чат-бот для разговора.</p>
            <div className="lp-actions">
              <a className="lp-btn primary" href="#apply">Хочу попробовать <span aria-hidden="true">→</span></a>
              <Link className="lp-btn" to="/login">У меня уже есть аккаунт</Link>
            </div>
            <p className="lp-small">Оставьте заявку — мы напишем и откроем доступ</p>
          </div>
          <HeroCollage />
        </section>

        <section className="lp-features">
          {FEATURES.map((f, i) => (
            <article key={f.kicker} className={`lp-feature${i % 2 ? ' flip' : ''}`}>
              <div className="lp-feature-text">
                <div className="lp-feature-kicker"><span className="lp-num">0{i + 1}</span><Icon name={f.icon} size={20} />{f.kicker}</div>
                <h2>{f.title}</h2>
                <p>{f.text}</p>
              </div>
              <div className="lp-feature-art">{f.art}</div>
            </article>
          ))}
        </section>

        <section className="lp-steps">
          <h2 className="lp-h2">Как начать</h2>
          <ol>
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <span className="lp-step-num">{i + 1}</span>
                <strong>{s.title}</strong>
                <span>{s.text}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="lp-faq">
          <h2 className="lp-h2">Частые вопросы</h2>
          {FAQ.map((item) => (
            <details key={item.q}>
              <summary>{item.q}<span className="lp-faq-plus" aria-hidden="true" /></summary>
              <p>{item.a}</p>
            </details>
          ))}
        </section>

        <section className="lp-final" id="apply">
          <h2>Хотите заниматься <em>самостоятельно</em>?</h2>
          <p>Оставьте заявку — мы напишем вам в Telegram или на почту и откроем доступ к платформе.</p>
          <ApplyForm />
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
