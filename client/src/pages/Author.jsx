import { Link } from 'react-router-dom'

// "Автор курса и платформы" — built from Galina's Figma layout
// (GALINA SVIRINA, node 561:4155): Playfair Display + Manrope, accent
// #EC3C12 on #F5EFE1 / #F6F6F6, black-and-white photography, hand-lettered
// accents exported from the file (public/author/*.svg).

const SITE = 'https://advent-academy.online'
const TELEGRAM = 'https://t.me/svirinagalina'
const INSTAGRAM = 'https://www.instagram.com/advent_academy_gram'

const HELP = [
  { n: '01', text: 'планируете уехать зарубеж или недавно переехали' },
  { n: '02', text: 'преподаете английский и хотите повысить свой уровень' },
  { n: '03', text: 'хотите поступить в зарубежный вуз и учиться на английском языке' },
  { n: '04', text: 'хотите работать в международной компании или сотрудничать с иностранными клиентами' },
  { n: '05', text: 'хотите преодолеть языковой барьер и свободно заговорить на английском' }
]

const FORMATS = [
  { title: 'Курсы', href: `${SITE}/courses` },
  { title: 'Самоучитель English Time', href: SITE },
  { title: 'Литературный клуб', href: TELEGRAM },
  { title: 'Обучение для преподавателей', href: TELEGRAM }
]

const COURSES = [
  { icon: 'icon-ielts', href: '/ielts', title: <>Курс подготовки<br />к IELTS</>, text: 'Качественно подготовитесь к экзамену и сдадите его на нужный балл' },
  { icon: 'icon-essay', title: 'Курс «Навыки академического эссе»', text: 'Научитесь писать академические тексты, соответствующие стандартам в англоязычной среде' },
  { icon: 'icon-the', title: 'Курс «Английский без ошибок. Артикли, предлоги, словарный запас»', text: 'Избавитесь от ошибок в разговорном английском и научитесь использовать предлоги и артикли' }
]

const EDUCATION = [
  { year: '2009', text: 'Диплом специалиста. Филологический факультет им. Ломоносова' },
  { year: '2011', text: 'Курс “Academic writing in cross-cultural communication”, Harvard University, MA, USA' },
  { year: '2012', text: 'Степень кандидата филологических наук МГУ им. Ломоносова' }
]

const ENVIRONMENT = [
  { title: 'Практические навыки', text: 'Актуальный и «живой» английский, а не просто сухая теория' },
  { title: 'Легкая подача', text: 'Объясняю правила простым языком, чтобы сделать процесс обучения максимально понятным' },
  { title: 'Постоянная поддержка', text: 'Курирование на всех этапах обучения, чтобы вы смогли достигнуть поставленных целей' },
  { title: 'Онлайн-формат', text: 'Вы можете заниматься в максимально комфортной для вас обстановке и в удобное время' }
]

// Two columns, as in the layout: the long reviews with a photo, the short ones without.
const REVIEWS = [
  [
    {
      name: 'Ксения Снегирева', photo: 'ksenia', tint: true,
      lead: 'Галина — без преувеличения лучший преподаватель английского, который у меня был, даже с учетом нэйтив спикеров, с которыми я готовилась к CAE в Дубае.',
      text: 'Стоит начать с того, что мы за первый же час занятий подготовились к моему интервью для подкаста так, что мне было легко и весело его проходить, а не нервно и заикаясь. В целом же я обратилась к Галине за «расширением свободы» в английском. Уже имея уровень C1, я часто не могла сформулировать мысль так, как сказала бы на русском, и в работе, и в личной жизни. Не было вопроса, на который Галина бы не ответила или ответила непонятно. На занятиях мозг работал очень интенсивно, при этом Галина чутко и гибко подстраивала процесс под мои задачи и ощущения. В общем, суммирую: Галина огонь. Хайли рекоммендед'
    },
    { name: 'Ирина Буранова', text: 'Мне очень нравится этот курс! Очень удобно, что кроме видеоурока есть еще конспект лекции. А слушать ваши видеоуроки одно удовольствие! Они живые, полные эмоций и человечности!' },
    {
      name: 'Оксана Ярославская', photo: 'oksana', tint: true,
      lead: 'Хочу сказать огромное спасибо Галине Дмитриевне за помощь в подготовке к экзамену TOEFL. За ее правильный путь подготовки, и за постоянную поддержку. Я набрала 100/120 баллов, это очень высокий результат.',
      text: 'Именно она показала мне как правильно говорить на английском языке, как правильно нужно готовиться к этому экзамену. И в целом у меня пропал языковой барьер. Всем советую выбирать Галину Дмитриевну, она, действительно, классный специалист!'
    }
  ],
  [
    { name: 'Михаил Снегирев', text: 'С большой радостью пишу, что экзамен мы сдали успешно. Благодаря эффективным занятиям, даже с учетом моих провалов в тесте, все равно получилось набрать баллы. Еще раз спасибо вам огромное за вашу очень мощную помощь в подготовке.' },
    { name: 'Надежда Михайлова', text: 'Галина! Спасибо вам огромное ещё раз за ваш труд, за все ваши советы по тому, как сдавать IELTS (а там всяких подковырок очень много), за материалы для подготовки, которые дали мне. Да и вообще, за все!' },
    { name: 'Мария Агуреева', text: 'С каждым разом все лучше и лучше говорю! Уж не знаю, что происходит. Почти не торможу уже! Само все формируется в голове до того как рот открывается. Это случилось в последней поездке в феврале.' },
    {
      name: 'Михаил Снегирев', photo: 'mikhail', tint: true,
      lead: 'Прежде всего хочу сказать, что Галина замечательный преподаватель. Очень неформально относится к своим ученикам. Я занимался с Галиной целый год.',
      text: 'Результат колоссальный! Уровень английского поднялся с Ielts 5,5 до 7. Очень свободно себя чувствую в разговоре. Результат отличный. Я бы всем рекомендовал заниматься с Галиной если вы хотите реально научится английскому языку'
    }
  ]
]

const Arrow = ({ small }) => <img className={`gs-arrow${small ? ' small' : ''}`} src="/author/arrow.svg" alt="" aria-hidden="true" />
const Cta = ({ to = '/signup', children = 'Начать учиться', className = '' }) => (
  <Link className={`gs-cta ${className}`} to={to}>{children}<Arrow /></Link>
)

function Review({ r }) {
  return (
    <figure className={`gs-review${r.tint ? ' tint' : ''}`}>
      {r.photo ? (
        <div className="gs-review-head">
          <img src={`/author/${r.photo}.jpg`} alt="" />
          <p>{r.lead}</p>
        </div>
      ) : null}
      <blockquote>{r.text}</blockquote>
      <figcaption>{r.name}</figcaption>
    </figure>
  )
}

export default function Author() {
  return (
    <div className="gs">
      <section className="gs-hero gs-wrap">
        <div className="gs-hero-left">
          <nav className="gs-nav">
            <a href="#about">Обо мне</a>
            <a href="#formats">Форматы работы</a>
            <a href="#reviews">Отзывы</a>
          </nav>
          <div className="gs-hero-name">
            <h1>Galina<br />Svirina</h1>
            <p>Преподаватель английского языка, который знает как достичь уровня С2</p>
            <Cta className="big" />
          </div>
        </div>
        <div className="gs-hero-right">
          <Cta className="gs-top-cta" />
          <img className="gs-photo" src="/author/hero.jpg" alt="Галина Свирина" />
        </div>
      </section>

      <section className="gs-help gs-wrap">
        <div className="gs-title-row">
          <h2>Я помогу<br /><span className="gs-indent">вам, если вы</span></h2>
          <img className="gs-script study" src="/author/study.svg" alt="" aria-hidden="true" />
        </div>
        <ol>
          {HELP.map((h, i) => (
            <li key={h.n} className={i % 2 ? 'up' : 'down'}>
              <span className="gs-num">{h.n}</span>
              <span className="gs-help-text">{h.text}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="gs-quote gs-wrap">
        <span className="gs-quote-mark" aria-hidden="true">“</span>
        <p>Я верю, что английский лучше изучать с преподавателем, который говорит на вашем языке. Если человек смог дойти до С2, ему точно известно, с какими сложностями придется столкнуться на этом пути и как их преодолеть. Его собственный результат подтверждение того, что его метод изучения языка работает!</p>
      </section>

      <img className="gs-banner" src="/author/cafe.jpg" alt="" />

      <div className="gs-light">
        <section className="gs-formats gs-wrap" id="formats">
          <div className="gs-title-row">
            <h2>Начните обучение<br /><span className="gs-indent">в удобном формате</span></h2>
            <span className="gs-aside">С чем могу помочь</span>
          </div>
          <div className="gs-two">
            <ul className="gs-list">
              {FORMATS.map((f) => (
                <li key={f.title}><a href={f.href} target="_blank" rel="noopener noreferrer">{f.title}<Arrow /></a></li>
              ))}
            </ul>
            <img className="gs-photo" src="/author/exam.jpg" alt="" />
          </div>
        </section>

        <section className="gs-courses gs-wrap">
          <h2>Мои курсы</h2>
          <div className="gs-course-grid">
            {COURSES.map((c) => {
              const inner = (
                <>
                  <img className="gs-course-icon" src={`/author/${c.icon}.svg`} alt="" aria-hidden="true" />
                  <strong>{c.title}</strong>
                  <span>{c.text}</span>
                  <Arrow />
                </>
              )
              // The IELTS course has a page of its own; the others still lead to Telegram.
              return c.href
                ? <Link key={c.icon} className="gs-course" to={c.href}>{inner}</Link>
                : <a key={c.icon} className="gs-course" href={TELEGRAM} target="_blank" rel="noopener noreferrer">{inner}</a>
            })}
          </div>
        </section>
      </div>

      <section className="gs-about gs-wrap" id="about">
        <img className="gs-photo" src="/author/about.jpg" alt="Галина Свирина" />
        <div className="gs-about-text">
          <h2>Обо мне</h2>
          <div className="gs-hi"><img src="/author/hi.svg" alt="Hi," /><span>меня зовут Галина Свирина</span></div>
          <p>Я успешно преподаю английский язык уже больше 10 лет. Обучение — моя стихия, всю сознательную жизнь я учусь и обучаю других!</p>
          <p className="gs-shift">Я закончила филфак МГУ им. Ломоносова, получила там же степень кандидата наук, проходила курсы в Harvard University, а сейчас изучаю преподавание английского в университете Аликанте в Испании.</p>
          <p>Я умею и люблю учиться и точно смогу сделать этот процесс максимально эффективным и увлекательным для вас!</p>
        </div>
      </section>

      <section className="gs-edu gs-wrap">
        <h2>Мое образование</h2>
        <div className="gs-timeline">
          {EDUCATION.map((e) => (
            <div key={e.year}>
              <span className="gs-year">{e.year}</span>
              <span className="gs-tick" />
              <span className="gs-edu-text">{e.text}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="gs-env gs-wrap">
        <div className="gs-title-row">
          <h2>Эффективная среда<br /><span className="gs-indent">изучения английского</span></h2>
          <img className="gs-script english" src="/author/english.svg" alt="" aria-hidden="true" />
        </div>
        <div className="gs-two">
          <div className="gs-env-grid">
            {ENVIRONMENT.map((e) => (
              <div key={e.title}><strong>{e.title}</strong><span>{e.text}</span></div>
            ))}
          </div>
          <img className="gs-photo" src="/author/laptop.jpg" alt="" />
        </div>
        <Link className="gs-cta" to="/">Попробовать платформу<Arrow /></Link>
      </section>

      <section className="gs-reviews gs-wrap" id="reviews">
        <div className="gs-title-row">
          <h2>У кого уже<br /><span className="gs-indent">получилось</span></h2>
          <span className="gs-aside">Отзывы студентов</span>
        </div>
        <div className="gs-review-grid">
          {REVIEWS.map((column, i) => (
            <div key={i} className="gs-review-col">
              {column.map((r, j) => <Review key={j} r={r} />)}
            </div>
          ))}
        </div>
        <div className="gs-center"><Cta className="big" /></div>
      </section>

      <section className="gs-contact gs-wrap" id="contact">
        <div className="gs-title-row">
          <h2>Свяжитесь со мной</h2>
          <span className="gs-aside">Контакты</span>
        </div>
        <div className="gs-two top">
          <img className="gs-script lets" src="/author/lets-get-started.svg" alt="let's get started" />
          <div>
            <p>Вы можете написать мне в соцсети и в мессенджерах. Отвечу на все ваши вопросы и помогу подобрать наиболее комфортный формат обучения.</p>
            <div className="gs-socials">
              <a href={INSTAGRAM} target="_blank" rel="noopener noreferrer">та самая соцсеть</a>
              <a href={TELEGRAM} target="_blank" rel="noopener noreferrer">telegram</a>
            </div>
          </div>
        </div>
        <div className="gs-two gs-corporate">
          <img className="gs-photo" src="/author/team.jpg" alt="" />
          <div>
            <strong>Хотите провести корпоративное обучение английскому языку для сотрудников?</strong>
            <p>Оставьте заявку и я свяжусь с вами, чтобы обсудить детали</p>
            <a className="gs-cta" href={TELEGRAM} target="_blank" rel="noopener noreferrer">Оставить заявку<Arrow /></a>
          </div>
        </div>
      </section>

      <footer className="gs-foot">
        <div className="gs-wrap">
          <div className="gs-foot-grid">
            <div><span>Курс «Английский без ошибок»</span><span>Курс «Навыки академического эссе»</span><Link to="/ielts">Курс подготовки к IELTS</Link></div>
            <div><span>Обучение для преподавателей</span><span>Литературный клуб</span><span>Самоучитель “English Time”</span></div>
            <div><a href="#about">Обо мне</a><a href="#reviews">Отзывы студентов</a><a href="#contact">Контакты</a></div>
            <div><a href="/privacy.html">Политика конфиденциальности</a><Link to="/">Платформа Advent Academy</Link><span>{new Date().getFullYear()}</span></div>
          </div>
        </div>
      </footer>
    </div>
  )
}
