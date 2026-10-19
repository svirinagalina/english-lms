import { Fragment, useEffect, useRef, useState } from 'react'
import '../styles/landing-demo.css'

// «Попробуй прямо сейчас» on the IELTS / TOEFL landing: four small, real
// tasks per exam that a visitor can do without signing up — a reading task,
// a listening task with a real voice, a before/after review of writing and,
// for TOEFL, the adaptive test played out with a slider (for IELTS, a
// Speaking Part 2 card with the exam's timers). All content is our own.

const img = (name) => `/ielts/${name}`

// ---- Reading -------------------------------------------------------------

// "{{word}}" keeps its first half; the visitor types the rest.
function CompleteWords({ text }) {
  const parts = text.split(/(\{\{[^}]+\}\})/)
  const gaps = parts.filter((p) => p.startsWith('{{')).map((p) => p.slice(2, -2))
  const [typed, setTyped] = useState({})
  const [checked, setChecked] = useState(false)
  let n = -1
  const right = gaps.filter((w, i) => (typed[i] ?? '').trim().toLowerCase() === w.slice(Math.floor(w.length / 2)).toLowerCase()).length
  return (
    <>
      <p className="ty-task">Допишите недостающие буквы в словах.</p>
      <p className="ty-text ty-cw">
        {parts.map((p, pi) => {
          if (!p.startsWith('{{')) return <Fragment key={pi}>{p}</Fragment>
          const i = ++n
          const word = p.slice(2, -2)
          const shown = word.slice(0, Math.floor(word.length / 2))
          const rest = word.slice(shown.length)
          const ok = (typed[i] ?? '').trim().toLowerCase() === rest.toLowerCase()
          return (
            <span key={pi} className={`ty-gap ${checked ? (ok ? 'ok' : 'bad') : ''}`}>
              {shown}
              <input aria-label={`Слово ${i + 1}`} value={typed[i] ?? ''} disabled={checked} autoCapitalize="off" autoCorrect="off" spellCheck={false}
                style={{ width: `${rest.length + 0.8}ch` }} onChange={(e) => setTyped({ ...typed, [i]: e.target.value.replace(/\s/g, '') })} />
              {checked && !ok && <small>{word}</small>}
            </span>
          )
        })}
      </p>
      <Result checked={checked} text={`${right} из ${gaps.length}`} good={right === gaps.length}
        onCheck={() => setChecked(true)} onReset={() => { setTyped({}); setChecked(false) }} />
    </>
  )
}

function Choices({ items }) {
  const [picked, setPicked] = useState({})
  const [checked, setChecked] = useState(false)
  const right = items.filter((q, i) => picked[i] === q.answer).length
  return (
    <>
      {items.map((q, qi) => (
        <div key={qi} className="ty-q">
          <p className="ty-q-text">{q.text}</p>
          <div className="ty-options">
            {q.options.map((o) => {
              const state = checked ? (o === q.answer ? 'ok' : picked[qi] === o ? 'bad' : '') : ''
              return (
                <button key={o} type="button" disabled={checked} className={`ty-option ${picked[qi] === o ? 'on' : ''} ${state}`}
                  onClick={() => setPicked({ ...picked, [qi]: o })}>{o}</button>
              )
            })}
          </div>
          {checked && q.why && <p className="ty-why">{q.why}</p>}
        </div>
      ))}
      <Result checked={checked} text={`${right} из ${items.length}`} good={right === items.length} disabled={!Object.keys(picked).length}
        onCheck={() => setChecked(true)} onReset={() => { setPicked({}); setChecked(false) }} />
    </>
  )
}

function Result({ checked, text, good, onCheck, onReset, disabled }) {
  return (
    <div className="ty-result">
      {!checked
        ? <button type="button" className="iel-btn pink" disabled={disabled} onClick={onCheck}>Проверить</button>
        : <>
          <span className={`ty-score ${good ? 'good' : ''}`}>{good ? 'Отлично! ' : ''}{text}</span>
          <button type="button" className="iel-btn iel-ghost small" onClick={onReset}>Ещё раз</button>
        </>}
    </div>
  )
}

// ---- Listening -----------------------------------------------------------

// A real recording with a moving wave while it plays.
function Player({ src, label, once }) {
  const ref = useRef(null)
  const [state, setState] = useState('idle')
  useEffect(() => () => ref.current?.pause(), [])
  const play = () => {
    if (!ref.current) {
      ref.current = new Audio(src)
      ref.current.onended = () => setState('done')
    }
    ref.current.currentTime = 0
    ref.current.play().then(() => setState('playing')).catch(() => setState('idle'))
  }
  const stop = () => { ref.current?.pause(); setState('idle') }
  return (
    <div className={`ty-player ${state}`}>
      <button type="button" className="ty-play" aria-label={state === 'playing' ? 'Пауза' : 'Слушать'} onClick={state === 'playing' ? stop : play}>
        {state === 'playing' ? <span className="ty-pause" /> : <span className="ty-tri" />}
      </button>
      <div className="ty-wave" aria-hidden="true">{Array.from({ length: 28 }, (_, i) => <i key={i} style={{ "--i": i, height: `${22 + ((i * 37) % 70)}%` }} />)}</div>
      <span className="ty-player-label">{state === 'done' && once ? '✓ Прослушано' : label}</span>
    </div>
  )
}

function FormCompletion() {
  const fields = [
    { label: 'Фамилия', answer: ['harper'], hint: 'Harper' },
    { label: 'Время начала занятия', answer: ['7.15', '7:15', '715', 'seven fifteen', '19.15', '19:15'], hint: '7.15' },
    { label: 'Стоимость в месяц, £', answer: ['42', '£42', 'forty-two', 'forty two'], hint: '42' },
  ]
  const [typed, setTyped] = useState({})
  const [checked, setChecked] = useState(false)
  const ok = (f, i) => f.answer.includes((typed[i] ?? '').trim().toLowerCase())
  const right = fields.filter(ok).length
  return (
    <>
      <p className="ty-task">Послушайте звонок в спортивный центр и заполните форму. Как в IELTS Listening, Part 1: имена диктуют по буквам.</p>
      <Player src={img('demo-ielts-listening.mp3')} label="Звонок в Riverside Sports Centre" />
      <div className="ty-form">
        <div className="ty-form-title">Riverside Sports Centre — booking</div>
        {fields.map((f, i) => (
          <label key={f.label} className={checked ? (ok(f, i) ? 'ok' : 'bad') : ''}>
            <span>{f.label}</span>
            <input value={typed[i] ?? ''} disabled={checked} onChange={(e) => setTyped({ ...typed, [i]: e.target.value })} />
            {checked && !ok(f, i) && <small>{f.hint}</small>}
          </label>
        ))}
      </div>
      <Result checked={checked} text={`${right} из ${fields.length}`} good={right === fields.length} disabled={!Object.keys(typed).length}
        onCheck={() => setChecked(true)} onReset={() => { setTyped({}); setChecked(false) }} />
    </>
  )
}

function ChooseResponse() {
  return (
    <>
      <p className="ty-task">Новое задание TOEFL 2026: услышьте реплику и выберите самый уместный ответ. Запись звучит один раз — как на экзамене.</p>
      <Player src={img('demo-toefl-response.mp3')} label="Реплика студента" once />
      <Choices items={[{
        text: 'Выберите лучший ответ:',
        options: ['Because I was hungry.', 'Sure, that works better for me.', 'I had pasta.', 'We met last week.'],
        answer: 'Sure, that works better for me.',
        why: '«Why don\'t we…?» — это не вопрос «почему», а предложение. Поэтому ответ — согласие. Because — ловушка, на которую попадаются чаще всего.'
      }]} />
    </>
  )
}

// ---- Writing: before / after ---------------------------------------------

// Segments: plain strings, or [wrong, right] pairs shown struck / added.
function Review({ title, task, segments, scoreBefore, scoreAfter, scale, notes }) {
  const [after, setAfter] = useState(false)
  return (
    <>
      <p className="ty-task">{task}</p>
      <div className="ty-switch" role="tablist">
        <button type="button" role="tab" aria-selected={!after} className={!after ? 'on' : ''} onClick={() => setAfter(false)}>Текст ученика</button>
        <button type="button" role="tab" aria-selected={after} className={after ? 'on' : ''} onClick={() => setAfter(true)}>После проверки</button>
      </div>
      <div className={`ty-paper ${after ? 'after' : ''}`}>
        <div className="ty-paper-head">
          <span>{title}</span>
          <span className="ty-badge">{after ? scoreAfter : scoreBefore} <small>{scale}</small></span>
        </div>
        <p className="ty-text">
          {segments.map((s, i) => (typeof s === 'string' ? <Fragment key={i}>{s}</Fragment>
            : after ? <Fragment key={i}><del>{s[0]}</del><ins>{s[1]}</ins></Fragment>
              : <mark key={i}>{s[0]}</mark>))}
        </p>
      </div>
      {after && (
        <ul className="ty-notes">
          {notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
      )}
      {!after && <p className="ty-hint">Розовым — то, что исправит проверка. Нажмите «После проверки».</p>}
    </>
  )
}

// ---- TOEFL: the adaptive test --------------------------------------------

function Adaptive() {
  const [right, setRight] = useState(7)
  const upper = right >= 6
  const band = upper ? ['4.5', '6'] : ['1', '4.5']
  return (
    <>
      <p className="ty-task">В новом TOEFL Reading и Listening адаптивные: от первого модуля зависит, каким будет второй — и какой максимальный балл вам доступен. Подвигайте ползунок.</p>
      <label className="ty-slider">
        <span>Правильных ответов в модуле 1: <b>{right} из 10</b></span>
        <input type="range" min="0" max="10" value={right} style={{ "--v": right * 10 }} onChange={(e) => setRight(Number(e.target.value))} />
      </label>
      <div className="ty-path">
        <div className="ty-node on">Модуль 1<small>одинаковый для всех</small></div>
        <svg className="ty-arrows" viewBox="0 0 120 120" aria-hidden="true">
          <path d="M5 60 C 50 60, 60 18, 115 18" className={upper ? 'on' : ''} />
          <path d="M5 60 C 50 60, 60 102, 115 102" className={!upper ? 'on' : ''} />
        </svg>
        <div className="ty-branches">
          <div className={`ty-node ${upper ? 'on' : 'off'}`}>Модуль 2 — сложнее<small>балл до 6</small></div>
          <div className={`ty-node ${!upper ? 'on' : 'off'}`}>Модуль 2 — легче<small>балл до 4.5</small></div>
        </div>
      </div>
      <p className="ty-verdict">Ваш возможный диапазон в разделе: <b>{band[0]}–{band[1]}</b> из 6. {upper
        ? 'Сильный первый модуль открывает максимальный балл.'
        : 'Даже идеальный второй модуль не даст больше 4.5 — поэтому первый модуль решаем особенно внимательно.'}</p>
    </>
  )
}

// ---- IELTS: Speaking Part 2 -----------------------------------------------

function CueCard() {
  const [phase, setPhase] = useState('idle') // idle | prep | talk | done
  const [left, setLeft] = useState(60)
  useEffect(() => {
    if (phase !== 'prep' && phase !== 'talk') return undefined
    const t = setInterval(() => setLeft((v) => v - 1), 1000)
    return () => clearInterval(t)
  }, [phase])
  useEffect(() => {
    if (left > 0) return
    if (phase === 'prep') { setPhase('talk'); setLeft(120) } else if (phase === 'talk') setPhase('done')
  }, [left, phase])
  const total = phase === 'talk' ? 120 : 60
  const share = phase === 'prep' || phase === 'talk' ? left / total : phase === 'done' ? 0 : 1
  return (
    <>
      <p className="ty-task">IELTS Speaking, Part 2: минута на подготовку и до двух минут монолога. Попробуйте уложиться — таймер как на экзамене.</p>
      <div className="ty-cue">
        <div className="ty-cue-card">
          <b>Describe a skill you learned that took a long time.</b>
          <span>You should say:</span>
          <ul><li>what the skill was</li><li>why you decided to learn it</li><li>how you learned it</li></ul>
          <span>and explain how you felt when you finally mastered it.</span>
        </div>
        <div className="ty-ring" style={{ '--share': share }}>
          <svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44" /><circle cx="50" cy="50" r="44" className="ty-ring-fg" /></svg>
          <div className="ty-ring-text">
            {phase === 'idle' && <>1:00<small>подготовка</small></>}
            {(phase === 'prep' || phase === 'talk') && <>{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}<small>{phase === 'prep' ? 'подготовка' : 'говорите'}</small></>}
            {phase === 'done' && <>✓<small>время вышло</small></>}
          </div>
        </div>
      </div>
      <div className="ty-result">
        {phase === 'idle' && <button type="button" className="iel-btn pink" onClick={() => { setLeft(60); setPhase('prep') }}>Начать подготовку</button>}
        {phase === 'prep' && <button type="button" className="iel-btn iel-ghost small" onClick={() => { setPhase('talk'); setLeft(120) }}>Я готов(а) говорить</button>}
        {phase === 'talk' && <button type="button" className="iel-btn iel-ghost small" onClick={() => setPhase('done')}>Закончить</button>}
        {phase === 'done' && <><span className="ty-score">На курсе ответ записывается и проверяется по критериям IELTS</span><button type="button" className="iel-btn iel-ghost small" onClick={() => setPhase('idle')}>Ещё раз</button></>}
      </div>
    </>
  )
}

// ---- The block -------------------------------------------------------------

const TABS = {
  toefl: [
    { id: 'r', kicker: 'Reading', title: 'Complete the Words', body: () => <CompleteWords text="Honeybees communicate the location of food through a movement known as the waggle dance. When a forager returns {{to}} the hive, {{she}} moves in a figure-eight {{pattern}} on the comb. The {{angle}} of the straight run {{shows}} the direction of the flowers." /> },
    { id: 'l', kicker: 'Listening', title: 'Choose a Response', body: () => <ChooseResponse /> },
    {
      id: 'w', kicker: 'Writing', title: 'Разбор письма', body: () => (
        <Review title="Write an Email · 7 минут" scale="/ 5" scoreBefore="3.5" scoreAfter="5"
          task="ИИ проверяет письмо за секунды: балл по критериям TOEFL, ошибки и исправленный вариант. Потом работу смотрит преподаватель."
          segments={['Dear Ms. Carter, I signed up for the photography workshop, but I just found out I have ', ['a important', 'an important'], ' exam on Saturday morning, so I ', ['can not come', 'won\'t be able to attend'], '. ', ['Could I join a later session, or get a refund?', 'Would it be possible to join a later session or, if not, to get a refund?'], ' I was really looking forward to the lesson about light and portraits.']}
          notes={['an перед гласным звуком: an important exam', 'can not → won\'t be able to attend: точнее и вежливее', 'Просьба к организатору — через «Would it be possible…»', 'Добавьте детали: письмо 100–150 слов набирает больше']} />
      )
    },
    { id: 'a', kicker: 'Новое в 2026', title: 'Адаптивный тест', body: () => <Adaptive /> },
  ],
  ielts: [
    {
      id: 'r', kicker: 'Reading', title: 'True / False / Not Given', body: () => (
        <>
          <p className="ty-task">Прочитайте отрывок и решите, что говорит о каждом утверждении текст.</p>
          <p className="ty-text ty-quote">Cities are often several degrees warmer than the countryside around them. The difference is usually greatest at night: during the day, asphalt and concrete absorb solar energy, and after sunset they release it slowly. Many cities are now experimenting with reflective "cool roofs" and more street trees.</p>
          <Choices items={[
            { text: '1. Cities are usually warmest compared with the countryside during the day.', options: ['TRUE', 'FALSE', 'NOT GIVEN'], answer: 'FALSE', why: 'В тексте: разница больше всего ночью («greatest at night») — утверждение противоречит.' },
            { text: '2. Cool roofs reflect sunlight.', options: ['TRUE', 'FALSE', 'NOT GIVEN'], answer: 'TRUE', why: '«reflective cool roofs» — перефраз: reflective = отражающие.' },
            { text: '3. Street trees are cheaper than cool roofs.', options: ['TRUE', 'FALSE', 'NOT GIVEN'], answer: 'NOT GIVEN', why: 'О цене ничего не сказано. Самая частая ошибка — додумать то, чего в тексте нет.' },
          ]} />
        </>
      )
    },
    { id: 'l', kicker: 'Listening', title: 'Form completion', body: () => <FormCompletion /> },
    {
      id: 'w', kicker: 'Writing', title: 'Разбор эссе', body: () => (
        <Review title="Writing Task 2 · фрагмент" scale="band" scoreBefore="6.0" scoreAfter="7.5"
          task="Так выглядит проверка эссе на курсе: ошибки, более сильная лексика и комментарий по критериям IELTS."
          segments={['', ['Nowadays many people thinks', 'It is often argued'], ' that university education should be free. ', ['In my opinion it is good idea', 'I largely agree with this view'], ', because ', ['it give more chances to everybody', 'it gives talented students from low-income families the same opportunities as their wealthier peers'], '. ', ['But', 'However,'], ' governments have limited budgets, ', ['so it is a big problem', 'which makes funding a genuine challenge'], '.']}
          notes={['Grammar: people think / it gives — согласование подлежащего и глагола', 'Lexical Resource: «more chances to everybody» → конкретная, академичная формулировка', 'Coherence: However в начале предложения вместо разговорного But', 'Task Response: позиция сформулирована ясно — плюс к баллу']} />
      )
    },
    { id: 's', kicker: 'Speaking', title: 'Part 2 · cue card', body: () => <CueCard /> },
  ]
}

export default function LandingDemo({ exam }) {
  const tabs = TABS[exam]
  const [active, setActive] = useState(0)
  useEffect(() => { setActive(0) }, [exam])
  const tab = tabs[active] ?? tabs[0]
  return (
    <section className="ty" id="try">
      <div className="iel-wrap">
        <div className="ty-head">
          <div>
            <span className="ty-kicker">Без регистрации</span>
            <h2>Попробуй прямо сейчас</h2>
          </div>
          <p>Настоящие задания из курса {exam === 'toefl' ? 'TOEFL iBT 2026' : 'IELTS'} — с проверкой, разбором ошибок и живыми голосами.</p>
          <img className="ty-star" src={img('sparkles.svg')} alt="" aria-hidden="true" />
        </div>
        <div className="ty-board">
          <div className="ty-tabs" role="tablist">
            {tabs.map((t, i) => (
              <button key={t.id} type="button" role="tab" aria-selected={i === active} className={i === active ? 'on' : ''} onClick={() => setActive(i)}>
                <small>{String(i + 1).padStart(2, '0')} · {t.kicker}</small>
                <span>{t.title}</span>
              </button>
            ))}
          </div>
          <div className="ty-card" key={`${exam}-${tab.id}`}>
            {tab.body()}
          </div>
        </div>
      </div>
    </section>
  )
}
