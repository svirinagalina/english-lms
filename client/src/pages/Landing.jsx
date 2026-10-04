import { Link } from 'react-router-dom'
import { Brand, SiteFooter } from '../components/Brand'

// What a signed-out visitor sees at the site's address: why it's worth it,
// what it costs, and the two ways in. Russian — that's who comes here.
const FEATURES = [
  { icon: '🎥', kicker: 'Видеозвонки', title: 'Урок, где всё под рукой', text: 'Видео, общая доска и документ, который правите вместе. Размытие фона и шумоподавление — ни кухни, ни соседского ремонта. До 6 человек.' },
  { icon: '✍️', kicker: 'Грамматика', title: 'Упражнения, которые проверяют сами', text: '34 темы от Present Simple до косвенной речи. ИИ засчитает любой правильный вариант и объяснит ошибку по-русски — как репетитор, только в 2 часа ночи тоже.' },
  { icon: '🧠', kicker: 'Слова', title: 'Слова, которые не забываются', text: 'Словарь с произношением, свои слова в один клик прямо с доски и карточки с интервальным повторением: приложение само напомнит, что пора повторить.' },
  { icon: '🗣️', kicker: 'Разговор', title: 'Чат-бот, с которым не стыдно', text: 'Говорите вслух сколько угодно и получайте исправления. Никто не смотрит, никто не торопит — лучший способ перестать бояться говорить.' }
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
          <span className="landing-eyebrow">Английский без разрозненных приложений</span>
          <h1>Заговорите по-английски — уроки, грамматика и практика в одном месте</h1>
          <p className="landing-lead">
            Видеоуроки на общей доске, упражнения с умной проверкой, слова, которые запоминаются, и чат-бот для разговора.
            Начните бесплатно сегодня — полный доступ <strong>от 390 ₽ в месяц</strong>.
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
              <span className="landing-icon" aria-hidden="true">{f.icon}</span>
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
