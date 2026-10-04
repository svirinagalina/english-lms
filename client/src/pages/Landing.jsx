import { Link } from 'react-router-dom'
import { Brand, SiteFooter } from '../components/Brand'

// What a signed-out visitor sees at the site's address: why it's worth it,
// what it costs, and the two ways in. Russian — that's who comes here.
// Line icons in the brand colours (drawn here, not emoji).
const Icon = ({ name }) => {
  const paths = {
    call: <><rect x="3" y="6" width="13" height="12" rx="3" /><path d="M16 10.5 21 7.5v9l-5-3" /><path d="M7 12h5" /></>,
    grammar: <><path d="M5 4h10l4 4v12H5z" /><path d="M15 4v4h4" /><path d="m8.5 14 2 2 4-4.5" /></>,
    words: <><rect x="4" y="6" width="12" height="14" rx="2" /><path d="M8 3h10a2 2 0 0 1 2 2v12" /><path d="M7.5 11h5M7.5 15h3" /></>,
    speak: <><path d="M4 6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-6l-5 4v-4H7a3 3 0 0 1-3-3z" /><path d="M9 9.5v1M12 8v4M15 9.5v1" /></>
  }
  return (
    <svg className="landing-icon" viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}

const FEATURES = [
  { icon: 'call', kicker: 'Видеозвонки', title: 'Видеозвонки для уроков', text: 'Удобная интерактивная онлайн-доска со встроенным переводом и озвучкой слов.' },
  {
    icon: 'grammar', kicker: 'Грамматика', title: 'Упражнения для самопроверки',
    text: <>Наш ИИ-ментор, обученный на авторской методике преподавания <Link to="/author">Галины Свириной</Link>, проверит ваши упражнения и покажет аналитику прогресса. Занимайтесь в любое время и в любом месте.</>
  },
  { icon: 'words', kicker: 'Слова', title: 'Слова, которые не забываются', text: 'Словарь с произношением, свои слова в один клик прямо с доски и карточки с интервальным повторением: приложение само напомнит, что пора повторить.' },
  { icon: 'speak', kicker: 'Разговор', title: 'Чат-бот, с которым не стыдно', text: 'Говорите вслух сколько угодно и получайте исправления. Никто не смотрит, никто не торопит — лучший способ перестать бояться говорить.' }
]

const STEPS = [
  { n: '1', title: 'Создайте аккаунт', text: 'Минута и почта — без карты и без звонков менеджера.' },
  { n: '2', title: 'Занимайтесь бесплатно', text: '10 тем грамматики, словарь, карточки и чат-бот открыты сразу.' },
  { n: '3', title: 'Откройте всё, когда захотите', text: 'Подписка от 390 ₽ в месяц, отменить можно в любой момент.' }
]

const PLANS = [
  { name: 'Бесплатно', price: '0 ₽', note: 'навсегда', items: ['10 тем грамматики', '20 проверок ИИ в день', 'Словарь и карточки', 'Пробные разговоры с чат-ботом'] },
  { name: 'Практика', price: '390 ₽', eur: '4,90 €', items: ['Вся грамматика — 34 темы', 'ИИ без ограничений', 'Все наборы слов', 'Чат-бот без ограничений'] },
  { name: 'Звонки', price: '490 ₽', eur: '5,90 €', items: ['Свои видеозвонки без лимита времени', 'Доска, документ, размытие фона', 'До 6 участников', 'Гости заходят бесплатно'] },
  { name: 'Всё вместе', price: '690 ₽', eur: '8,90 €', best: true, items: ['Практика + Звонки', 'Выгоднее, чем по отдельности', 'Годовой тариф — ещё около −30%'] }
]

const FAQ = [
  { q: 'Нужна ли карта, чтобы начать?', a: 'Нет. Бесплатный доступ открывается сразу после подтверждения почты и ничего не списывает.' },
  { q: 'Можно отменить подписку?', a: 'Да, в любой момент в два клика. Доступ сохраняется до конца оплаченного периода.' },
  { q: 'Чем это лучше Zoom или Duolingo?', a: 'Здесь звонок, доска, грамматика, словарь и разговорная практика в одном месте — и дешевле, чем каждый сервис по отдельности. Слова с урока сразу попадают в ваши карточки.' },
  { q: 'А если я хочу заниматься с преподавателем?', a: 'Запишитесь на пробный урок из личного кабинета. Ученикам с преподавателем все тарифы включены бесплатно.' },
  { q: 'Можно оплатить российской картой?', a: 'Да: оставьте контакт на странице тарифов, пришлём реквизиты — тариф откроется, как только придёт оплата.' }
]

export default function Landing() {
  return (
    <div className="landing">
      <header className="landing-head">
        <Brand />
        <Link className="button ghost landing-signin" to="/login">Войти</Link>
      </header>
      <main>
        <section className="landing-hero">
          <span className="landing-eyebrow">Все инструменты для изучения английского в одном месте</span>
          <h1>Эффективная среда изучения английского</h1>
          <p className="landing-lead">
            Видеоуроки на общей доске, упражнения с умной проверкой, слова, которые запоминаются, и чат-бот для разговора.
            Начните бесплатно сегодня.
          </p>
          <div className="landing-actions">
            <Link className="button big" to="/signup">Начать бесплатно</Link>
            <Link className="button big ghost" to="/login">У меня уже есть аккаунт</Link>
          </div>
          <p className="landing-small muted">Без карты · Регистрация за минуту · Отмена в любой момент</p>
        </section>

        <section className="landing-features">
          {FEATURES.map((f) => (
            <div key={f.kicker} className="tile landing-feature">
              <Icon name={f.icon} />
              <span className="tile-kicker">{f.kicker}</span>
              <strong>{f.title}</strong>
              <span className="muted">{f.text}</span>
            </div>
          ))}
        </section>

        <section className="landing-steps">
          <h2>Как начать</h2>
          <div className="landing-steps-row">
            {STEPS.map((s) => (
              <div key={s.n} className="landing-step">
                <span className="landing-step-n">{s.n}</span>
                <strong>{s.title}</strong>
                <span className="muted">{s.text}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="landing-pricing">
          <h2>Тарифы дешевле, чем один урок у репетитора</h2>
          <p className="muted landing-pricing-sub">Для сравнения: Zoom Pro, Duolingo Super или ELSA по отдельности стоят дороже, чем «Всё вместе» здесь.</p>
          <div className="landing-plan-cards">
            {PLANS.map((p) => (
              <div key={p.name} className={`landing-plan${p.best ? ' best' : ''}`}>
                {p.best && <span className="plan-badge">Выгоднее всего</span>}
                <h3>{p.name}</h3>
                <div className="landing-plan-price">{p.price}<span className="muted"> {p.note ?? '/ мес'}</span></div>
                {p.eur && <div className="muted landing-plan-eur">или {p.eur} картой любой страны</div>}
                <ul>{p.items.map((item) => <li key={item}>{item}</li>)}</ul>
                <Link className={`button${p.best ? '' : ' ghost'}`} to="/signup">{p.price === '0 ₽' ? 'Начать бесплатно' : 'Попробовать'}</Link>
              </div>
            ))}
          </div>
        </section>

        <section className="landing-faq">
          <h2>Частые вопросы</h2>
          {FAQ.map((item) => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <p className="muted">{item.a}</p>
            </details>
          ))}
        </section>

        <section className="landing-final">
          <h2>Первое занятие — уже сегодня</h2>
          <p className="muted">Зарегистрируйтесь и сделайте первое упражнение за 5 минут. Это бесплатно.</p>
          <Link className="button big" to="/signup">Создать аккаунт бесплатно</Link>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
