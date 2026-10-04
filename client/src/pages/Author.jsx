import { Link } from 'react-router-dom'

// "Автор курса и платформы" — Galina's own page, in the editorial style of
// her personal site (cream paper, terracotta serif, thin rules, black-and-
// white photography). Facts and reviews are the ones published on
// advent-academy.ru / advent-academy.online.

const SITE = 'https://advent-academy.online'

const HELP = [
  'строите карьеру на международном уровне',
  'планируете учёбу за рубежом',
  'хотите переехать в англоязычную страну',
  'знаете правила, но в разговоре всё равно путаетесь и угадываете',
  'годами «учите английский», а нового уровня всё нет'
]

const FORMATS = [
  { title: 'Курсы', note: 'B1–B2 и A2–B2, 5 месяцев', href: `${SITE}/courses` },
  { title: 'Индивидуально', note: 'маршрут и темп под вас', href: `${SITE}/individual` },
  { title: 'Интенсивы', note: 'времена · артикли и предлоги', href: `${SITE}/english-intensive` },
  { title: 'Самоучитель EnglishTime', note: 'авторский учебник', href: SITE },
  { title: 'Платформа', note: 'занимайтесь самостоятельно — бесплатно для начала', to: '/signup' }
]

const COURSES = [
  { mark: 'B1–B2', title: 'Грамматика на практике', text: '5 месяцев системной работы, чтобы грамматика начала работать в речи и понимании.', href: `${SITE}/b1-b2` },
  { mark: '1:1', title: 'A2–B2 One-to-one', text: 'Индивидуальный маршрут, максимальная корректировка и темп под вас.', href: `${SITE}/individual` },
  { mark: 'Intensive', title: 'Времена · Артикли и предлоги', text: 'Быстро закрыть слабое место: собрать систему, убрать кашу и перестать угадывать.', href: `${SITE}/english-intensive` }
]

const PLATFORM = [
  { title: 'Практика, а не зубрёжка', text: 'Тысячи упражнений RU → EN из EnglishTime с умной проверкой.' },
  { title: 'Понятная подача', text: 'Ошибка объясняется по-русски — сразу, а не через неделю.' },
  { title: 'Всё в одном месте', text: 'Уроки на доске, словарь, карточки и разговорный чат-бот.' },
  { title: 'Онлайн и в любое время', text: 'С компьютера и телефона, когда удобно вам.' }
]

const REVIEWS = [
  { name: 'Ксения Снегирева', photo: '/author/ksenia.jpg', text: 'Курс B1 → B2 — безусловно лучший формат обучения, который у меня был. Даже с учётом нэйтив спикеров, с которыми я занималась, когда работала в Дубае.' },
  { name: 'Михаил Снегирев', photo: '/author/mikhail.jpg', text: 'Очень свободно себя чувствую в разговоре. Результат отличный. Я бы всем рекомендовал заниматься на этом курсе, если вы хотите реально научиться английскому языку.' },
  { name: 'Мария Агуреева', photo: '/author/maria.jpg', text: 'С каждым разом всё лучше и лучше говорю! Почти не торможу уже! Само всё формируется в голове до того, как рот открывается. Это случилось в последней поездке в феврале.' }
]

const Arrow = () => <span className="au-arrow" aria-hidden="true">⟶</span>
const Out = ({ href, to, children, className }) => to
  ? <Link className={className} to={to}>{children}</Link>
  : <a className={className} href={href} target="_blank" rel="noopener noreferrer">{children}</a>

export default function Author() {
  return (
    <div className="au">
      <nav className="au-nav">
        <Link to="/">Платформа</Link>
        <a href="#formats">Форматы работы</a>
        <a href="#reviews">Отзывы</a>
        <Link className="au-nav-cta" to="/signup">Начать учиться <Arrow /></Link>
      </nav>

      <header className="au-hero">
        <div>
          <h1>Galina<br />Svirina</h1>
          <p>Преподаватель английского языка с опытом 15+ лет, кандидат наук МГУ, основатель Advent Academy и автор методики EnglishTime</p>
          <Link className="au-link" to="/signup">Начать учиться <Arrow /></Link>
        </div>
        <figure className="au-photo">
          <img src="/author/galina.jpg" alt="Галина Свирина" />
        </figure>
      </header>

      <section className="au-help">
        <div className="au-title-row">
          <h2>Я помогу<br />вам, если вы</h2>
          <span className="au-script">study</span>
        </div>
        <ol>
          {HELP.map((item, i) => (
            <li key={item} style={{ '--i': i }}>
              <span className="au-num">0{i + 1}</span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="au-quote">
        <span className="au-quote-mark" aria-hidden="true">“</span>
        <blockquote>
          Система вместо хаоса, навык вместо зубрёжки. Грамматика через понимание и тренировка построения фраз с русского на английский —
          чтобы знания превращались в навык, а не оставались правилом в тетради.
        </blockquote>
        <cite>Галина Свирина</cite>
      </section>

      <section className="au-formats" id="formats">
        <h2>Начните обучение<br />в удобном формате</h2>
        <ul>
          {FORMATS.map((f) => (
            <li key={f.title}>
              <Out href={f.href} to={f.to}>
                <strong>{f.title}</strong>
                <span>{f.note}</span>
                <Arrow />
              </Out>
            </li>
          ))}
        </ul>
      </section>

      <section className="au-courses">
        <h2>Мои курсы</h2>
        <div className="au-course-grid">
          {COURSES.map((c) => (
            <Out key={c.title} href={c.href} className="au-course">
              <span className="au-course-mark">{c.mark}</span>
              <strong>{c.title}</strong>
              <span>{c.text}</span>
              <Arrow />
            </Out>
          ))}
        </div>
      </section>

      <section className="au-about">
        <figure className="au-photo small">
          <img src="/author/galina.jpg" alt="" />
        </figure>
        <div>
          <h2>Обо мне</h2>
          <span className="au-script">Hi, I'm Galina</span>
          <p>Я преподаю английский больше 15 лет. Основала Advent Academy и написала учебник EnglishTime — 34 темы грамматики с тысячами упражнений на перевод.</p>
          <p>Моя методика отточена практикой и построена вокруг результата: выйти на новый уровень и удержать его. Не «выучить правило», а начать говорить — свободно и без угадывания.</p>
          <p>По этой методике работают преподаватели школы, а на платформе ей обучен ИИ-ментор, который проверяет ваши упражнения.</p>
        </div>
      </section>

      <section className="au-edu">
        <h2>Моё образование</h2>
        <div className="au-timeline">
          <div><span className="au-dot" /><strong>МГУ им. М. В. Ломоносова</strong><span>Кандидат наук</span></div>
          <div><span className="au-dot" /><strong>Harvard</strong><span>Обучение в Гарварде</span></div>
          <div><span className="au-dot" /><strong>15+ лет практики</strong><span>Своя методика и школа Advent Academy</span></div>
        </div>
      </section>

      <section className="au-platform">
        <div className="au-title-row">
          <h2>Эффективная среда<br />изучения английского</h2>
          <span className="au-script">english</span>
        </div>
        <div className="au-platform-grid">
          {PLATFORM.map((p) => (
            <div key={p.title}><strong>{p.title}</strong><span>{p.text}</span></div>
          ))}
        </div>
        <Link className="au-link" to="/">О платформе <Arrow /></Link>
      </section>

      <section className="au-reviews" id="reviews">
        <h2>У кого уже<br />получилось</h2>
        <div className="au-review-grid">
          {REVIEWS.map((r) => (
            <figure key={r.name}>
              <blockquote>{r.text}</blockquote>
              <figcaption><img src={r.photo} alt="" /><span>{r.name}</span></figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="au-contact">
        <div>
          <h2>Свяжитесь со мной</h2>
          <span className="au-script big">let's get started</span>
        </div>
        <div>
          <p>Напишите мне — отвечаю сама, без менеджеров. Подскажу формат, уровень и с чего начать.</p>
          <div className="au-socials">
            <a href="https://t.me/svirinagalina" target="_blank" rel="noopener noreferrer">Telegram</a>
            <a href="https://www.instagram.com/advent_academy_gram" target="_blank" rel="noopener noreferrer">Instagram</a>
            <a href="https://www.youtube.com/@adventacademy-l7d" target="_blank" rel="noopener noreferrer">YouTube</a>
            <a href={`${SITE}/free-lesson`} target="_blank" rel="noopener noreferrer">Пробный урок</a>
          </div>
          <Link className="au-link" to="/signup">Начать учиться на платформе <Arrow /></Link>
        </div>
      </section>

      <footer className="au-foot">
        <span>© {new Date().getFullYear()} Galina Svirina · Advent Academy</span>
        <a href={`${SITE}/courses`} target="_blank" rel="noopener noreferrer">Курсы</a>
        <a href={`${SITE}/test`} target="_blank" rel="noopener noreferrer">Тест уровня</a>
        <a href="/privacy.html">Политика конфиденциальности</a>
      </footer>
    </div>
  )
}
