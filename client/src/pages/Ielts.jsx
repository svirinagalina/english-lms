import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import '@fontsource/mulish/cyrillic-400.css'
import '@fontsource/mulish/cyrillic-600.css'
import '@fontsource/mulish/cyrillic-700.css'
import '@fontsource/mulish/cyrillic-800.css'
import '@fontsource/mulish/latin-400.css'
import '@fontsource/mulish/latin-600.css'
import '@fontsource/mulish/latin-700.css'
import '@fontsource/mulish/latin-800.css'
import '../styles/ielts.css'
import { api } from '../api'
import { parseDetails, formatCard } from '../utils/paymentDetails'

// "Курс подготовки к IELTS и TOEFL" — built from Galina's Figma layout
// (Advent Academy (New), «Полная стр десктоп»): Mulish, green #14453f,
// pink #ffd5ed, cream #fcfbf6. Pictures are in public/ielts.

const TELEGRAM = 'https://t.me/svirinagalina'
const INSTAGRAM = 'https://www.instagram.com/advent_academy_gram'
const SITE = 'https://advent-academy.online'
const img = (name) => `/ielts/${name}`
// The course sold by the «Самостоятельно» tariff (price and access days are
// set on the course page, Sales panel).
const COURSE_ID = 'cmucp0xsi0003mm2cyuz5lv19'

const WHY = [
  'Пробные тесты для каждого тарифа перед покупкой обучения.',
  'Авторские материалы для Writing Part, которых нет в учебниках.',
  'Продвинутая аналитика для отслеживания прогресса студентов.'
]

const FOR_YOU = ['Строите карьеру на международном уровне', 'Планируете учебу за рубежом', 'Хотите переехать в англоязычную страну']

const TEACHERS = [
  {
    name: 'Галина', photo: 'galina.jpg',
    points: [
      'Автор курса и сооснователь онлайн академии Advent Academy',
      'Уровень языка C2, IELTS 8.5',
      'Кандидат филологических наук МГУ, окончила курсы academic writing в Harvard University',
      'Опыт преподавания более 13 лет',
      'Автор известной книги "EnglishTime. Самоучитель для изучения английского языка"'
    ]
  },
  { name: 'Яков', photo: 'yakov.png', points: ['Преподаватель-эксперт', 'Уровень языка C2', 'Языковые курсы в University College London'] },
  { name: 'Дарья', photo: 'darya.jpg', pos: '78% 30%', points: ['Преподаватель-эксперт', 'Уровень языка C2', 'Опыт преподавания более 8 лет'] }
]

// Screens of the real platform (public/ielts/platform-*.jpg).
const PLATFORM = [
  { id: 'board', label: 'Доска на уроке', src: 'platform-board.jpg' },
  { id: 'practice', label: 'Упражнения с проверкой', src: 'platform-practice.jpg' },
  { id: 'vocab', label: 'Словарь и повторение', src: 'platform-vocab.jpg' }
]

const LESSON_LEFT = [
  { b: 'Проверка эссе', t: ' и еженедельная разговорная практика' },
  { b: 'Чат студентов', t: ' с кураторами и с Галиной в телеграм' },
  { b: 'Дополнительные бонусы', t: ' — курсы на произношение, пунктуацию и академический словарь' },
  { b: 'Графики', t: ' для отслеживания прогресса' },
  { b: 'Доступ к библиотеке ресурсов', t: ' для подготовки к IELTS и TOEFL' },
  { b: 'Гайды на полезный словарь', t: ' для speaking и writing' }
]

const LESSON_GRID = [
  [{ b: 'Доступ к материалам в удобном формате', t: ' на интерактивной платформе' }, { b: 'Подробный разбор', t: ' всех заданий' }, { b: '', t: 'Разбор ', b2: 'всех типов заданий', t2: ' эссе и графиков' }],
  [{ b: 'Письменные примеры', t: ' эссе и графиков на балл 6,5 и выше' }, { b: '', t: 'Большое количество ', b2: 'практических упражнений', t2: ' на все разделы теста' }, { b: '', t: 'Дополнительные ', b2: 'авторские материалы', t2: '' }]
]

const SECTIONS = [
  { title: 'Вводная часть', text: 'Знакомство с форматом экзаменов IELTS и TOEFL, их структурой и системой оценивания: с чего начать и как распределить силы.' },
  { title: 'Раздел 1: Listening', text: 'Типы заданий на аудирование, разбор ловушек и практика на реальных форматах теста.' },
  { title: 'Раздел 2: Reading', text: 'Стратегии работы с текстом, типы вопросов и тренировка скорости чтения.' },
  { title: 'Раздел 3: Writing', text: 'Авторские материалы по Writing Part, разбор примеров эссе и заданий из первой части письма, шаблоны и проверка работ.' },
  { title: 'Раздел 4: Speaking', text: 'Разговорные темы, типичные вопросы всех трёх частей и тренировка ответов.' }
]

const BASE_FEATURES = [
  '4 раздела (аудирование, чтение, письмо, говорение)',
  '35 модулей информации',
  '20 видео уроков',
  '150+ практических заданий',
  'доступ к курсу 4 месяца',
  'разбор примеров эссе и заданий из первой части письма',
  'разговорные темы и темы эссе',
  'поддержка в чате 24/7',
  'дополнительные авторские материалы по говорению, письму, аудированию, чтению'
]

const CURATOR_PRICES = [
  ['До 24 занятий', '3 400 ₽'],
  ['От 24 занятий', '3 250 ₽'],
  ['От 48 занятий', '3 000 ₽'],
  ['От 96 занятий', '2 750 ₽']
]
const PREMIUM_PRICES = [
  ['До 24 занятий', '3 900 ₽'],
  ['От 24 занятий', '3 750 ₽'],
  ['От 48 занятий', '3 500 ₽'],
  ['От 96 занятий', '3 250 ₽']
]

const REVIEWS = [
  { name: 'Ксения Снегирева', photo: 'ksenia.jpg', a: 'IELTS 6.5', b: 'IELTS 7.5', time: '3 месяца', text: 'Галина — без преувеличения лучший преподаватель английского, который у меня был, даже с учетом нэйтив спикеров, с которыми я готовилась к CAE в Дубае.' },
  { name: 'Ирина Буранова', text: 'Мне очень нравится этот курс! Очень удобно, что кроме видеоурока есть еще конспект лекции. А слушать ваши видеоуроки одно удовольствие! Они живые, полные эмоций и человечности!' },
  { name: 'Оксана Ярославская', text: 'Хочу сказать огромное спасибо Галине Дмитриевне за помощь в подготовке к экзамену TOEFL. За ее правильный путь подготовки, и за постоянную поддержку. Я набрала 100/120 баллов, это очень высокий результат.' }
]

const FAQ = [
  { q: 'Чем отличаются тарифы?', a: 'В тарифе «Самостоятельно» вы занимаетесь на платформе сами: все материалы курса, видеоуроки, задания и поддержка в чате. «С куратором» — это то же самое плюс индивидуальные занятия с квалифицированным специалистом. «Премиум» — то же самое, но занятия проводит лично Галина Свирина.' },
  { q: 'Как проходят индивидуальные занятия?', a: 'Все занятия проходят индивидуально. Программа и интенсивность подбираются под каждый случай и задачи ученика: от цели и срока до текущего уровня.' },
  { q: 'Можно ли сначала попробовать?', a: 'Да. К курсу есть демо-версия, а для каждого тарифа — пробный тест перед покупкой обучения. Оставьте заявку, и мы подскажем, с чего начать.' },
  { q: 'Что входит в тариф «Самостоятельно»?', a: 'Четыре раздела (аудирование, чтение, письмо, говорение), 35 модулей информации, 20 видеоуроков, более 150 практических заданий, доступ к курсу на 4 месяца, поддержка в чате 24/7 и дополнительные авторские материалы.' }
]

const MENU = [['Почему мы', '#why'], ['Преподаватели', '#teachers'], ['Как проходят занятия', '#lessons'], ['Тарифы', '#tariffs'], ['Отзывы', '#reviews'], ['Вопросы', '#faq']]

// «Купить»: Stripe (the price converted to euros, access opens by itself)
// or a rouble transfer to the school's card + «Я оплатил(а)».
function BuyDialog({ onClose }) {
  const [shop, setShop] = useState(null)
  const [error, setError] = useState('')
  const [way, setWay] = useState(null) // null | 'transfer'
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null) // the transfer report's answer
  const [copied, setCopied] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', messenger: '', website: '' })

  useEffect(() => {
    api.courseShop(COURSE_ID).then(setShop).catch((err) => setError(err.message))
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const payByCard = async () => {
    setBusy(true); setError('')
    try {
      const { url } = await api.courseCheckout(COURSE_ID)
      window.location.href = url
    } catch (err) { setError(err.message); setBusy(false) }
  }
  const reportTransfer = async (event) => {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      setDone(await api.courseTransfer(COURSE_ID, form))
    } catch (err) { setError(err.message) }
    setBusy(false)
  }
  const details = parseDetails(shop?.paymentDetails)
  const months = shop ? Math.round(shop.accessDays / 30.5) : 4
  const field = (key) => ({ value: form[key], onChange: (e) => setForm({ ...form, [key]: e.target.value }) })

  return (
    <div className="iel-modal" role="dialog" aria-modal="true" aria-label="Покупка курса" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="iel-modal-card">
        <button type="button" className="iel-modal-x" aria-label="Закрыть" onClick={onClose}>×</button>
        <h3>Тариф «Самостоятельно»</h3>
        {shop && <p className="iel-price">{shop.priceRub.toLocaleString('ru-RU')} ₽</p>}
        <p className="iel-modal-lead">Доступ к курсу на платформе на {months} {months === 1 ? 'месяц' : months < 5 ? 'месяца' : 'месяцев'}. После оплаты на почту придёт письмо со входом.</p>
        {!shop && !error && <p>Загружаем…</p>}
        {error && <p className="iel-error" role="alert">{error}</p>}
        {shop && done && (
          <>
            <p className="iel-ok" role="status">Спасибо! Как только перевод придёт, мы откроем курс и пришлём письмо на {form.email}.</p>
            <TelegramButton link={done.telegramLink} />
          </>
        )}
        {shop && !done && way === null && (
          <div className="iel-modal-ways">
            {shop.stripe && <button type="button" className="iel-btn pink" disabled={busy} onClick={payByCard}>{busy ? 'Открываем оплату…' : 'Оплатить картой (Stripe)'}</button>}
            {details.card && <button type="button" className="iel-btn iel-ghost" onClick={() => setWay('transfer')}>Перевод в рублях</button>}
            {shop.stripe && <p className="iel-modal-note">Карта любой страны, кроме российских. Сумма спишется в евро по курсу ЦБ РФ на сегодня.</p>}
          </div>
        )}
        {shop && !done && way === 'transfer' && (
          <form className="iel-form iel-modal-form" onSubmit={reportTransfer}>
            <div className="iel-requisites">
              <span>Переведите {shop.priceRub.toLocaleString('ru-RU')} ₽ на карту</span>
              <strong>{formatCard(details.card)}</strong>
              {details.cardNote && <span>{details.cardNote}</span>}
              <button type="button" className="iel-link" onClick={() => { navigator.clipboard?.writeText(details.card).then(() => setCopied(true)).catch(() => {}) }}>{copied ? 'Скопировано ✓' : 'Скопировать номер'}</button>
            </div>
            <p className="iel-modal-note">После перевода оставьте почту — на неё откроем курс.</p>
            <label><span>Ваше имя</span><input required maxLength={100} autoComplete="name" {...field('name')} /></label>
            <label><span>Ваш email</span><input required type="email" maxLength={160} autoComplete="email" {...field('email')} /></label>
            <label><span>Telegram (по желанию)</span><input maxLength={120} {...field('messenger')} /></label>
            <input className="iel-hp" tabIndex={-1} autoComplete="off" aria-hidden="true" {...field('website')} />
            <button type="submit" className="iel-btn pink" disabled={busy}>{busy ? 'Отправляем…' : 'Я оплатил(а)'}</button>
            <button type="button" className="iel-link" onClick={() => setWay(null)}>← Другой способ</button>
          </form>
        )}
      </div>
    </div>
  )
}

// Telegram can't be written to by @username: the buyer presses Start in the
// school bot, and the access link comes there too.
function TelegramButton({ link }) {
  if (!link) return null
  return (
    <div className="iel-modal-ways" style={{ marginTop: 14 }}>
      <a className="iel-btn iel-ghost" href={link} target="_blank" rel="noopener noreferrer">Получить доступ в Telegram</a>
      <p className="iel-modal-note">Откройте бота школы и нажмите «Start» — ссылка на курс придёт туда же.</p>
    </div>
  )
}

// Back from Stripe: /ielts?paid=1&session_id=… — the course opens at once.
function PaidBanner({ sessionId, onClose }) {
  const [state, setState] = useState({ loading: true })
  useEffect(() => {
    api.courseCheckoutVerify(sessionId).then((r) => setState(r)).catch((err) => setState({ error: err.message }))
  }, [sessionId])
  return (
    <div className="iel-modal" role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="iel-modal-card">
        <button type="button" className="iel-modal-x" aria-label="Закрыть" onClick={onClose}>×</button>
        {state.loading && <p>Проверяем оплату…</p>}
        {state.error && <p className="iel-error">{state.error}</p>}
        {state.paid && <><h3>Спасибо за покупку! 🎉</h3><p className="iel-modal-lead">Курс открыт. Письмо со входом отправлено на {state.email ?? 'вашу почту'} — проверьте и папку «Спам».</p><TelegramButton link={state.telegramLink} /></>}
        {state.paid === false && <p className="iel-modal-lead">Оплата ещё не прошла. Если деньги списались — напишите нам в Telegram, разберёмся.</p>}
      </div>
    </div>
  )
}

function Accordion({ items }) {
  const [open, setOpen] = useState(null)
  return (
    <div className="iel-acc">
      {items.map((item, i) => {
        const text = item.text ?? item.a
        const title = item.title ?? item.q
        return (
          <div key={title} className={`iel-acc-item ${open === i ? 'open' : ''}`}>
            <button type="button" className="iel-acc-head" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
              <span>{title}</span>
              <span className="iel-plus" aria-hidden="true" />
            </button>
            {open === i && <p className="iel-acc-body">{text}</p>}
          </div>
        )
      })}
    </div>
  )
}

function PriceTable({ rows }) {
  return (
    <div className="iel-prices" role="table" aria-label="Стоимость часа занятия">
      {rows.map(([label, price]) => (
        <div key={label} className="iel-price-row" role="row"><span role="cell">{label}</span><strong role="cell">{price} <small>/ час</small></strong></div>
      ))}
    </div>
  )
}

function Bullets({ items, className = '' }) {
  return <ul className={`iel-list ${className}`}>{items.map((t) => <li key={t}>{t}</li>)}</ul>
}

export default function Ielts() {
  const [menu, setMenu] = useState(false)
  const [slide, setSlide] = useState(0)
  const [platform, setPlatform] = useState(0)
  const [form, setForm] = useState({ name: '', messenger: '', email: '', comment: '', website: '' })
  const [state, setState] = useState({ busy: false, done: false, error: '' })
  const reviewsRef = useRef(null)
  const [buying, setBuying] = useState(false)
  const [paidSession, setPaidSession] = useState(() => new URLSearchParams(window.location.search).get('session_id'))

  useEffect(() => { document.title = 'Курс подготовки к IELTS и TOEFL — Advent Academy' }, [])

  const goToForm = (interest) => {
    if (interest) setForm((f) => (f.comment.trim() ? f : { ...f, comment: `Интересует: ${interest}` }))
    document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const onScroll = (event) => {
    const el = event.currentTarget
    const card = el.firstElementChild?.getBoundingClientRect().width ?? 1
    setSlide(Math.min(REVIEWS.length - 1, Math.round(el.scrollLeft / (card + 20))))
  }

  const submit = async (event) => {
    event.preventDefault()
    if (state.busy) return
    setState({ busy: true, done: false, error: '' })
    try {
      await api.sendLead({ source: 'ielts', ...form })
      setState({ busy: false, done: true, error: '' })
      setForm({ name: '', messenger: '', email: '', comment: '', website: '' })
    } catch (err) {
      setState({ busy: false, done: false, error: err.message })
    }
  }
  const field = (key) => ({ value: form[key], onChange: (e) => setForm({ ...form, [key]: e.target.value }) })

  return (
    <div className="iel">
      <section className="iel-hero">
        <header className="iel-head iel-wrap">
          <Link to="/author" className="iel-logo" aria-label="Advent Academy"><img src={img('logo.svg')} alt="Advent Academy" /></Link>
          <div className="iel-head-actions">
            <a className="iel-btn iel-ghost light small iel-hide-sm" href="#contact">Связаться с нами</a>
            <a className="iel-btn pink small" href="#tariffs">Купить курс</a>
            <button type="button" className="iel-burger" aria-label="Меню" aria-expanded={menu} onClick={() => setMenu((v) => !v)}><i /><i /><i /></button>
          </div>
          {menu && (
            <nav className="iel-menu" onClick={() => setMenu(false)}>
              {MENU.map(([label, href]) => <a key={href} href={href}>{label}</a>)}
            </nav>
          )}
        </header>

        <div className="iel-collage" aria-hidden="true">
          <img className="iel-grid-paper" src={img('grid-torn.png')} alt="" />
          <img className="iel-star" src={img('star.svg')} alt="" />
          <div className="iel-polaroid">
            <img src={img('harvard.jpg')} alt="" />
          </div>
          <img className="iel-suitcase" src={img('suitcase.png')} alt="" />
          <img className="iel-tickets" src={img('tickets.png')} alt="" />
        </div>

        <div className="iel-hero-body iel-wrap">
          <img className="iel-avatar" src={img('galina.jpg')} alt="" />
          <img className="iel-plane-trail" src={img('plane-trail.svg')} alt="" aria-hidden="true" />
          <h1>Получи 7+ баллов на IELTS или 94+ на TOEFL за 2−4 месяца подготовки</h1>
          <div className="iel-hero-cta">
            <p>Оставь заявку на пробный период и начни обучение уже сегодня</p>
            <button type="button" className="iel-btn pink big" onClick={() => goToForm()}>Оставить заявку</button>
          </div>
        </div>
      </section>

      <section className="iel-why iel-wrap" id="why">
        <h2>Почему мы?</h2>
        <img className="iel-doodle smile" src={img('heart.svg')} alt="" aria-hidden="true" />
        <ul className="iel-why-grid">
          {WHY.map((t) => <li key={t}><img src={img('chevron.svg')} alt="" aria-hidden="true" />{t}</li>)}
        </ul>
      </section>

      <section className="iel-foryou iel-wrap">
        <h2>Этот курс для вас, если:</h2>
        <div className="iel-foryou-art">
          <div className="iel-blob"><img src={img('girl.png')} alt="" /></div>
          <div className="iel-notes">
            {FOR_YOU.map((t, i) => (
              <div key={t} className="iel-note" style={{ '--tilt': `${[-1.5, 1, -0.5][i]}deg` }}>
                <svg className="iel-binder" viewBox="0 0 40 44" aria-hidden="true"><path d="M8 20h24l-3 20H11z" fill="#1d1d1b" /><path d="M13 20V9a7 7 0 0 1 14 0v11" fill="none" stroke="#1d1d1b" strokeWidth="2.5" /></svg>
                <p>{t}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="iel-teachers" id="teachers">
        <div className="iel-wrap">
          <h2>С вами будет работать преподаватель с собственным баллом 8.0+</h2>
          <div className="iel-teacher-cards">
            {TEACHERS.map((t) => (
              <article key={t.name} className="iel-teacher">
                <h3>{t.name}</h3>
                <img src={img(t.photo)} alt={t.name} style={t.pos ? { '--pos': t.pos } : undefined} />
                <Bullets items={t.points} />
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="iel-lessons" id="lessons">
        <img className="iel-torn top" src={img('torn-edge.png')} alt="" aria-hidden="true" />
        <div className="iel-wrap">
          <h2>Как будут проходить занятия</h2>
          <img className="iel-doodle heart" src={img('heart.svg')} alt="" aria-hidden="true" />
          <div className="iel-lessons-grid">
            <div className="iel-platform">
              <div className="iel-platform-tabs" role="tablist">
                {PLATFORM.map((p, i) => (
                  <button key={p.id} type="button" role="tab" aria-selected={platform === i} className={platform === i ? 'on' : ''} onClick={() => setPlatform(i)}>{p.label}</button>
                ))}
              </div>
              <div className="iel-platform-frame">
                <img src={img(PLATFORM[platform].src)} alt={`Платформа Advent Academy: ${PLATFORM[platform].label}`} loading="lazy" />
              </div>
            </div>
            <ul className="iel-trail">
              {LESSON_LEFT.map((l) => <li key={l.b}><img src={img('spiral.svg')} alt="" aria-hidden="true" /><span><b>{l.b}</b>{l.t}</span></li>)}
            </ul>
          </div>
          <div className="iel-lesson-extras">
            {LESSON_GRID.flat().map((l, i) => (
              <p key={i}><img src={img('spiral.svg')} alt="" aria-hidden="true" /><span>{l.b && <b>{l.b}</b>}{l.t}{l.b2 && <b>{l.b2}</b>}{l.t2}</span></p>
            ))}
          </div>
          <div className="iel-row">
            <a className="iel-btn iel-ghost light" href="#tariffs">Начать обучение</a>
            <button type="button" className="iel-btn pink" onClick={() => goToForm()}>Оставить заявку</button>
          </div>
        </div>
        <img className="iel-torn bottom" src={img('torn-edge.png')} alt="" aria-hidden="true" />
      </section>

      <section className="iel-wrap iel-sections">
        <div className="iel-sections-head">
          <p>Мы включили в курс дополнительные занятия по произношению и большое количество практических заданий для достижения максимальных результатов</p>
          <div className="iel-row">
            <a className="iel-btn pink small" href="#tariffs">Купить курс целиком</a>
            <a className="iel-btn iel-ghost small" href="#tariffs">Купить раздел курса</a>
          </div>
        </div>
        <Accordion items={SECTIONS} />
      </section>

      <section className="iel-wrap iel-tariffs" id="tariffs">
        <div className="iel-paper"><h2>Тарифы</h2><img className="iel-doodle sparkle" src={img('sparkles.svg')} alt="" aria-hidden="true" /></div>
        <div className="iel-plans">
          <article className="iel-plan">
            <h3>Самостоятельно</h3>
            <p className="iel-price">19 000 ₽</p>
            <Bullets items={BASE_FEATURES} />
            <div className="iel-plan-foot">
              <strong className="iel-demo">демо-версия курса на 7 дней</strong>
              <button type="button" className="iel-btn pink" onClick={() => setBuying(true)}>Купить</button>
              <a className="iel-btn iel-ghost" href={TELEGRAM} target="_blank" rel="noopener noreferrer">Связаться</a>
            </div>
          </article>

          <article className="iel-plan">
            <h3>С куратором</h3>
            <p className="iel-plan-lead">Все занятия проводятся индивидуально, с квалифицированным специалистом с большим опытом подготовки на 7,5+ баллов.</p>
            <p className="iel-plan-lead">Программа и интенсивность подбираются индивидуально под каждый случай и задачи ученика.</p>
            <div className="iel-plus-base">
              <b>+ всё из тарифа «Самостоятельно»</b>
              <span>В дополнение ко всем индивидуальным занятиям вы получаете доступ к платформе со всеми материалами базового тарифа.</span>
            </div>
            <Bullets items={['индивидуальные занятия по индивидуальной программе', ...BASE_FEATURES]} />
            <PriceTable rows={CURATOR_PRICES} />
            <div className="iel-plan-foot">
              <strong className="iel-demo">демо-версия курса на 7 дней</strong>
              <button type="button" className="iel-btn iel-ghost" onClick={() => goToForm('тариф «С куратором»')}>Оставить заявку</button>
            </div>
          </article>

          <article className="iel-plan dark">
            <h3>Премиум</h3>
            <p className="iel-plan-lead">Занятия лично с Галиной Свириной: кандидат филологических наук МГУ, проходила обучение академическому письму в Harvard University, подготовила более 500 студентов для поступления в топовые вузы.</p>
            <p className="iel-plan-lead">Программа и интенсивность подбираются индивидуально под каждый случай и задачи ученика.</p>
            <div className="iel-plus-base">
              <b>+ всё из тарифа «Самостоятельно»</b>
              <span>В дополнение ко всем индивидуальным занятиям вы получаете доступ к платформе со всеми материалами базового тарифа.</span>
            </div>
            <Bullets items={['индивидуальные занятия лично с Галиной Свириной', ...BASE_FEATURES]} />
            <PriceTable rows={PREMIUM_PRICES} />
            <div className="iel-plan-foot">
              <strong className="iel-demo">демо-версия курса на 7 дней</strong>
              <button type="button" className="iel-btn pink" onClick={() => goToForm('тариф «Премиум» с Галиной Свириной')}>Оставить заявку</button>
            </div>
          </article>
        </div>
      </section>

      <section className="iel-reviews" id="reviews">
        <div className="iel-wrap">
          <svg className="iel-binder-big" viewBox="0 0 110 80" aria-hidden="true"><path d="M30 38h50l-6 38H36z" fill="#d9a21b" stroke="#a87a0c" strokeWidth="2" /><path d="M40 38V16a15 15 0 0 1 30 0v22" fill="none" stroke="#e8b72b" strokeWidth="5" strokeLinecap="round" /><path d="M44 38V18a11 11 0 0 1 22 0v20" fill="none" stroke="#a87a0c" strokeWidth="1.5" /></svg>
          <div className="iel-reviews-head">
            <h2>91% студентов…</h2>
            <span>смотри карусель!</span>
          </div>
          <div className="iel-carousel" ref={reviewsRef} onScroll={onScroll}>
            {REVIEWS.map((r) => (
              <figure key={r.name} className="iel-review">
                {r.photo ? <img src={img(r.photo)} alt="" /> : <span className="iel-initial" aria-hidden="true">{r.name[0]}</span>}
                <figcaption>
                  <strong>{r.name}</strong>
                  {r.a && <small>Точка A: {r.a}<br />Точка B: {r.b}<br />Время: {r.time}</small>}
                </figcaption>
                <blockquote>{r.text}</blockquote>
              </figure>
            ))}
          </div>
          <div className="iel-dots" aria-hidden="true">{REVIEWS.map((r, i) => <i key={r.name} className={i === slide ? 'on' : ''} />)}</div>
        </div>
      </section>

      <section className="iel-wrap iel-faq" id="faq">
        <h2>FAQ</h2>
        <Accordion items={FAQ} />
        <button type="button" className="iel-btn pink" onClick={() => goToForm()}>Начать обучение</button>
      </section>

      <section className="iel-contact" id="contact">
        <img className="iel-contact-plane" src={img('plane.png')} alt="" aria-hidden="true" />
        <div className="iel-wrap iel-contact-grid">
          <div>
            <h2>Остались вопросы?</h2>
            <p>Мы сами читаем все обращения, без участия менеджеров. Просто напишите свой вопрос и мы свяжемся с вами, чтобы помочь с решением</p>
            <div className="iel-socials">
              <a href={INSTAGRAM} target="_blank" rel="noopener noreferrer">Instagram<img src={img('scribble.svg')} alt="" aria-hidden="true" /></a>
              <a href={TELEGRAM} target="_blank" rel="noopener noreferrer">Telegram<img src={img('scribble.svg')} alt="" aria-hidden="true" /></a>
            </div>
          </div>
          <form className="iel-form" onSubmit={submit}>
            <label><span>Ваше имя</span><input required maxLength={100} autoComplete="name" {...field('name')} /></label>
            <label><span>Мессенджер для связи</span><input maxLength={120} placeholder="Telegram или WhatsApp" {...field('messenger')} /></label>
            <label><span>Ваш email</span><input type="email" maxLength={160} autoComplete="email" {...field('email')} /></label>
            <label><span>Ваш комментарий</span><textarea rows={3} maxLength={2000} {...field('comment')} /></label>
            <input className="iel-hp" tabIndex={-1} autoComplete="off" aria-hidden="true" {...field('website')} />
            {state.error && <p className="iel-error" role="alert">{state.error}</p>}
            {state.done && <p className="iel-ok" role="status">Спасибо! Мы получили заявку и скоро свяжемся с вами.</p>}
            <button type="submit" className="iel-btn pink" disabled={state.busy}>{state.busy ? 'Отправляем…' : 'Отправить'}</button>
          </form>
        </div>
      </section>

      {buying && <BuyDialog onClose={() => setBuying(false)} />}
      {paidSession && <PaidBanner sessionId={paidSession} onClose={() => { setPaidSession(null); window.history.replaceState(null, '', '/ielts') }} />}

      <footer className="iel-foot iel-wrap">
        <div className="iel-foot-bar">
          <div className="iel-foot-brand">
            <img src={img('logo.svg')} alt="Advent Academy" />
            <span>© {new Date().getFullYear()}. Advent Academy.<br />All rights reserved</span>
          </div>
          <nav className="iel-foot-links">
            <Link to="/ielts">IELTS / TOEFL</Link>
            <a href="#contact">Контакты</a>
            <a href={SITE}>Общий английский</a>
            <a href="/privacy.html">Политика конфиденциальности</a>
            <a href={SITE}>Учебник</a>
          </nav>
          <img className="iel-foot-polaroid" src={img('harvard.jpg')} alt="" aria-hidden="true" />
          <img className="iel-foot-mark" src={img('chevron-white.svg')} alt="" aria-hidden="true" />
        </div>
      </footer>
    </div>
  )
}
