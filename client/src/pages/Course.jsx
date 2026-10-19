import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import Panel from '../components/Panel'
import { api } from '../api'
import Nav from '../components/Nav'
import { SiteFooter } from '../components/Brand'
import WordCard from '../components/WordCard'
import { isEnglishWord, wordAt } from '../utils/dictionary'
import { speakDialogue, stopSpeaking } from '../utils/speech'
import { ToeflSetBlock, ToeflTestBlock } from '../toefl/ToeflBlocks'
import { RichText, ChoiceBlock, SelectTextBlock, DragWordsBlock, WordOrderBlock, GroupsBlock, WritingBlock } from '../components/CourseActivities'

const TYPE_LABEL = { theory: 'Theory', practice: 'Practice', supplementary: 'Extra', lesson: 'Lesson' }

// Dialogue scripts are written as "Speaker: line", one per line — used to
// give each speaker their own voice and to show the labelled transcript in
// "Show script". A line with no "Name: " prefix is treated as one speaker
// throughout (a monologue), never voiced with the label itself.
const parseDialogue = (script) =>
  script.split('\n').filter((line) => line.trim()).map((line) => {
    const match = line.match(/^([A-Za-z][A-Za-z\s]{0,24}):\s*(.*)$/)
    return match ? { speaker: match[1], text: match[2] } : { speaker: '_narrator', text: line }
  })

// Coordinates every TtsAudioBlock's playback across the page. Unlike
// speechSynthesis (one global player the browser itself serialises), each
// block here owns its own independent <audio> element — nothing stops two
// of them playing over each other unless something tells the previous one
// to stop first. Reported live as two scripts audibly overlapping on a
// lesson with more than one listening block (lesson 9).
let activeAudioStop = null

// Real generated audio: payload.lines is [{ speaker, text, url }], one MP3
// per line (a different voice per speaker) — played back to back like a
// playlist, since they're separate files rather than one recording.
function TtsAudioBlock({ payload }) {
  const [index, setIndex] = useState(-1) // -1 = not playing
  const [revealed, setRevealed] = useState(false)
  const audioRef = useRef(null)

  useEffect(() => () => audioRef.current?.pause(), [])

  const playFrom = (i) => {
    if (i >= payload.lines.length) { setIndex(-1); activeAudioStop = null; return }
    if (!audioRef.current) audioRef.current = new Audio()
    audioRef.current.src = payload.lines[i].url
    audioRef.current.onended = () => playFrom(i + 1)
    audioRef.current.onerror = () => playFrom(i + 1)
    audioRef.current.play().catch(() => setIndex(-1))
    setIndex(i)
  }
  const stop = () => { audioRef.current?.pause(); setIndex(-1); activeAudioStop = null }
  const start = () => { activeAudioStop?.(); activeAudioStop = stop; stopSpeaking(); playFrom(0) }
  const playing = index >= 0

  return (
    <div className="course-block">
      {payload.title && <strong>{payload.title}</strong>}
      <div className="row-actions">
        {playing ? <button onClick={stop}>■ Stop</button> : <button onClick={start}>▶ Play</button>}
        <button className="ghost" onClick={() => setRevealed((v) => !v)}>{revealed ? 'Hide script' : 'Show script'}</button>
      </div>
      {revealed && (
        <div className="course-text" style={{ marginTop: 8 }}>
          {payload.lines.map((line, i) => (
            <div key={i} className={i === index ? 'course-tts-active-line' : ''}>
              {line.speaker !== '_narrator' ? `${line.speaker}: ` : ''}{line.text}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Fallback for a script not yet converted to real audio: reads it aloud
// with the browser's own voice. See generate-tts-audio.js.
function TtsScriptBlock({ payload }) {
  const [playing, setPlaying] = useState(false)
  const [revealed, setRevealed] = useState(false)

  // Leaving this lesson (or this block disappearing for any other reason)
  // must not leave its script talking over whatever the student opens next
  // — speechSynthesis is a single global player, not scoped to this component.
  useEffect(() => stopSpeaking, [])

  const play = async () => {
    activeAudioStop?.() // don't overlap with a real-audio block elsewhere on the page
    setPlaying(true)
    const ok = await speakDialogue(parseDialogue(payload.script), () => setPlaying(false))
    if (!ok) { setPlaying(false); setRevealed(true) }
  }
  const stop = () => { stopSpeaking(); setPlaying(false) }

  return (
    <div className="course-block">
      {payload.title && <strong>{payload.title}</strong>}
      <div className="row-actions">
        {playing ? (
          <button onClick={stop}>■ Stop</button>
        ) : (
          <button onClick={play}>▶ Play</button>
        )}
        <button className="ghost" onClick={() => setRevealed((v) => !v)}>{revealed ? 'Hide script' : 'Show script'}</button>
      </div>
      {revealed && <div className="course-text" style={{ marginTop: 8 }}>{payload.script}</div>}
    </div>
  )
}

function Exercise({ exercise }) {
  const { payload } = exercise
  const [selected, setSelected] = useState(null)
  const [answer, setAnswer] = useState('')
  const [checked, setChecked] = useState(false)

  const norm = (s) => s.trim().toLowerCase()
  const correct = payload.options
    ? selected === payload.correctAnswer
    : norm(answer) === norm(payload.answer) || (payload.alternatives ?? []).some((a) => norm(a) === norm(answer))

  if (payload.options) {
    return (
      <div className="course-exercise">
        <div className="course-exercise-q">{exercise.question}</div>
        <div className="course-exercise-options">
          {payload.options.map((opt) => {
            const isCorrectOpt = checked && opt === payload.correctAnswer
            const isWrongPick = checked && selected === opt && opt !== payload.correctAnswer
            return (
              <button
                key={opt}
                className={`course-option ${selected === opt ? 'selected' : ''} ${isCorrectOpt ? 'correct' : ''} ${isWrongPick ? 'wrong' : ''}`}
                onClick={() => !checked && setSelected(opt)}
                disabled={checked}
              >
                {opt}
              </button>
            )
          })}
        </div>
        {!checked ? (
          <button className="ghost" disabled={!selected} onClick={() => setChecked(true)}>Check</button>
        ) : (
          <div className={`course-feedback ${correct ? 'ok' : 'bad'}`}>{correct ? 'Correct!' : `Correct answer: ${payload.correctAnswer}`}</div>
        )}
      </div>
    )
  }

  return (
    <div className="course-exercise">
      <div className="course-exercise-q" style={{ whiteSpace: 'pre-wrap' }}>{exercise.question}</div>
      <div className="row-actions">
        <input value={answer} onChange={(e) => setAnswer(e.target.value)} disabled={checked} placeholder="Your answer" />
        {!checked ? (
          <button className="ghost" disabled={!answer} onClick={() => setChecked(true)}>Check</button>
        ) : (
          <span className={`course-feedback ${correct ? 'ok' : 'bad'}`}>{correct ? 'Correct!' : `Answer: ${payload.answer}`}</span>
        )}
      </div>
    </div>
  )
}

function Block({ block }) {
  const { type, payload } = block
  if (type === 'text') {
    return (
      <div className="course-block">
        {payload.title && <strong>{payload.title}</strong>}
        <div className="course-text">{payload.content}</div>
      </div>
    )
  }
  if (type === 'html') {
    return (
      <div className="course-block">
        {payload.title && <strong>{payload.title}</strong>}
        <div className="course-text course-rich"><RichText text={payload.html} /></div>
      </div>
    )
  }
  if (type === 'choice') return <ChoiceBlock payload={payload} />
  if (type === 'select-text') return <SelectTextBlock payload={payload} />
  if (type === 'drag-words') return <DragWordsBlock payload={payload} />
  if (type === 'word-order') return <WordOrderBlock payload={payload} />
  if (type === 'groups') return <GroupsBlock payload={payload} />
  if (type === 'writing') return <WritingBlock block={block} />
  if (type === 'toefl') return <ToeflSetBlock block={block} />
  if (type === 'toefl-test') return <ToeflTestBlock block={block} />
  if (type === 'tts') return payload.lines ? <TtsAudioBlock payload={payload} /> : <TtsScriptBlock payload={payload} />
  if (type === 'video') {
    return (
      <div className="course-block">
        {payload.title && <strong>{payload.title}</strong>}
        {payload.youtubeId ? (
          <div className="course-video-wrap">
            <iframe
              src={`https://www.youtube.com/embed/${payload.youtubeId}`}
              title={payload.title ?? 'Video'}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : (
          <a href={payload.url} target="_blank" rel="noreferrer">Open video ↗</a>
        )}
      </div>
    )
  }
  if (type === 'image') {
    return (
      <div className="course-block">
        {payload.caption && <strong>{payload.caption}</strong>}
        <img src={payload.url} alt={payload.caption ?? ''} className="course-image" />
      </div>
    )
  }
  if (type === 'audio') {
    return (
      <div className="course-block">
        {payload.name && <strong>{payload.name}</strong>}
        <audio controls src={payload.url} style={{ width: '100%' }} />
      </div>
    )
  }
  if (type === 'file') {
    return (
      <div className="course-block">
        <a className="button ghost" href={payload.url} target="_blank" rel="noreferrer">📄 {payload.name ?? 'Open file'} ↗</a>
      </div>
    )
  }
  return null
}

// Admins: the price, what a purchase opens, transfers to confirm and who has it.
function CourseSales({ courseId }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [form, setForm] = useState({ priceRub: '', accessDays: '' })
  const [grant, setGrant] = useState({ name: '', email: '' })

  const load = () => api.courseSales(courseId).then((d) => {
    setData(d)
    setForm({ priceRub: d.priceRub ?? '', accessDays: d.accessDays })
  }).catch((err) => setError(err.message))
  useEffect(() => { load() }, [courseId])

  const act = async (fn, done) => {
    setError(''); setNote('')
    try {
      const result = await fn()
      setNote(done(result))
      load()
    } catch (err) { setError(err.message) }
  }
  const granted = (r) => `Открыто до ${new Date(r.until).toLocaleDateString('ru-RU')}. ${r.mailed ? 'Письмо отправлено.' : ''}${r.telegram ? ' Отправлено в Telegram.' : ''}${r.mailed || r.telegram ? '' : `Письмо не ушло${r.passwordLink ? ` — передайте ссылку: ${r.passwordLink}` : ''}`}`
  if (!data) return error ? <div className="error">{error}</div> : null
  const pending = data.orders.filter((o) => o.status === 'pending')
  const now = Date.now()

  return (
    <Panel id={`course-sales:${courseId}`} title="Продажи" count={pending.length || undefined} defaultOpen={pending.length > 0}>
      {error && <div className="error">{error}</div>}
      {note && <div className="notice">{note}</div>}
      <form className="row-actions" style={{ flexWrap: 'wrap', alignItems: 'end' }} onSubmit={(e) => { e.preventDefault(); act(() => api.saveCourseSale(courseId, { priceRub: form.priceRub === '' ? null : Number(form.priceRub), accessDays: Number(form.accessDays) }), () => 'Сохранено') }}>
        <label>Цена, ₽ <input type="number" min="1" value={form.priceRub} placeholder="не продаётся" onChange={(e) => setForm({ ...form, priceRub: e.target.value })} style={{ width: 120 }} /></label>
        <label>Доступ, дней <input type="number" min="1" value={form.accessDays} onChange={(e) => setForm({ ...form, accessDays: e.target.value })} style={{ width: 90 }} /></label>
        <button type="submit">Сохранить</button>
        <a className="button ghost" href="/ielts#tariffs" target="_blank" rel="noreferrer">Страница покупки ↗</a>
      </form>

      <h4>Переводы — проверить и открыть</h4>
      {pending.length === 0 && <p className="muted">Нет новых.</p>}
      <div className="list">
        {pending.map((o) => (
          <div key={o.id} className="row">
            <div>
              <strong>{o.name}</strong> · {o.email}{o.messenger ? ` · ${o.messenger}` : ''}
              <div className="muted">{o.rub.toLocaleString('ru-RU')} ₽ · {new Date(o.createdAt).toLocaleString('ru-RU')}{o.note ? ` · ${o.note}` : ''}</div>
            </div>
            <div className="row-actions">
              <button onClick={() => act(() => api.grantCourse(courseId, { orderId: o.id }), granted)}>Открыть доступ</button>
              <button className="ghost" onClick={() => act(() => api.dismissCourseOrder(courseId, o.id), () => 'Убрано')}>Не пришло</button>
            </div>
          </div>
        ))}
      </div>

      <h4>Открыть вручную</h4>
      <form className="row-actions" style={{ flexWrap: 'wrap' }} onSubmit={(e) => { e.preventDefault(); act(() => api.grantCourse(courseId, grant), (r) => { setGrant({ name: '', email: '' }); return granted(r) }) }}>
        <input placeholder="Имя" value={grant.name} onChange={(e) => setGrant({ ...grant, name: e.target.value })} />
        <input type="email" required placeholder="Почта" value={grant.email} onChange={(e) => setGrant({ ...grant, email: e.target.value })} />
        <button type="submit">Открыть</button>
      </form>

      <h4>У кого есть доступ ({data.accesses.length})</h4>
      <div className="list">
        {data.accesses.map((a) => (
          <div key={a.id} className="row">
            <div>
              <strong>{a.user.name}</strong> · {a.user.email}
              <div className="muted">{new Date(a.until).getTime() > now ? 'до' : 'закончился'} {new Date(a.until).toLocaleDateString('ru-RU')} · {{ stripe: 'Stripe', transfer: 'перевод', manual: 'вручную' }[a.source] ?? a.source}</div>
            </div>
            <button className="ghost" onClick={() => { if (window.confirm(`Закрыть курс для ${a.user.name}?`)) act(() => api.revokeCourse(courseId, a.user.id), () => 'Доступ закрыт') }}>Закрыть</button>
          </div>
        ))}
      </div>
      <p className="muted">Ученики с преподавателем видят все курсы бесплатно; покупка нужна только аккаунтам без преподавателя.</p>
    </Panel>
  )
}

export default function Course() {
  const { user } = useAuth()
  const admin = user?.role === 'OWNER' || user?.role === 'PARTNER'
  const { courseId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [course, setCourse] = useState(null)
  const [error, setError] = useState('')
  const contentRef = useRef(null)
  const [wordCard, setWordCard] = useState(null)

  useEffect(() => {
    api.getCourse(courseId).then(setCourse).catch((err) => setError(err.message))
  }, [courseId])

  const activePosition = Number.parseInt(searchParams.get('lesson'), 10) || course?.lessons?.[0]?.position
  const lesson = course?.lessons?.find((l) => l.position === activePosition)

  // Double-click any word in a passage, script or question — same "Add to
  // my words" card as the board and Writing — so a student building
  // vocabulary from a reading or listening exercise doesn't have to leave
  // the page and look it up separately.
  const handleDoubleClick = (event) => {
    const selection = window.getSelection()
    const node = selection?.anchorNode
    if (!node || node.nodeType !== Node.TEXT_NODE) return
    const found = wordAt(node.textContent, Math.min(selection.anchorOffset, node.textContent.length - 1))
    if (!found || !isEnglishWord(found.word)) return
    const host = contentRef.current.getBoundingClientRect()
    setWordCard({
      word: found.word.toLowerCase(),
      x: Math.max(8, Math.min(event.clientX - host.left, host.width - 300)),
      y: Math.max(8, Math.min(event.clientY - host.top + 14, host.height - 270)),
    })
  }

  if (error) return <div className="page"><Nav title="Courses" back="/courses" /><div className="error">{error}</div></div>
  if (!course) return <div className="centered">Loading…</div>

  // TOEFL tasks put a passage and its questions side by side: a wider page.
  const wide = course.skillset?.name === 'TOEFL'
  return (
    <div className={`page ${wide ? 'page-wide' : ''}`}>
      <Nav title={course.title} back="/courses" />
      {admin && <CourseSales courseId={course.id} />}
      {course.locked && (
        <div className="notice">
          Курс открывается после покупки — {course.priceRub?.toLocaleString('ru-RU')} ₽. <Link to="/ielts#tariffs">Купить</Link>
        </div>
      )}
      {course.skillset?.name === 'TOEFL' && !course.locked && <p><Link to="/toefl">{user?.role === 'STUDENT' ? 'Мои результаты TOEFL →' : 'Результаты и проверка работ TOEFL →'}</Link></p>}
      {course.accessUntil && <p className="muted">Доступ до {new Date(course.accessUntil).toLocaleDateString('ru-RU')}</p>}

      <div className="course-layout">
        <nav className="course-lessons">
          {course.lessons.map((l) => (
            <button
              key={l.id}
              className={`course-lesson-link ${l.position === activePosition ? 'active' : ''}`}
              onClick={() => setSearchParams({ lesson: String(l.position) })}
            >
              <span className="course-lesson-num">{l.position}</span>
              <span>
                <div>{l.title}</div>
                <span className="muted course-lesson-type">{TYPE_LABEL[l.type] ?? l.type}</span>
              </span>
            </button>
          ))}
        </nav>

        <section className="course-content" ref={contentRef} onDoubleClick={handleDoubleClick}>
          {course.locked ? (
            <p className="muted">После оплаты здесь откроются все {course.lessons.length} уроков: видео, материалы и задания.</p>
          ) : lesson ? (
            <>
              <h2>{lesson.position}. {lesson.title}</h2>
              <p className="muted" style={{ marginTop: -12 }}>Double-click any word to hear it and add it to your vocabulary.</p>
              {lesson.blocks.length === 0 && lesson.exercises.length === 0 && (
                <p className="muted">No material for this lesson yet.</p>
              )}
              {lesson.blocks.map((block) => <Block key={block.id} block={block} />)}
              {lesson.exercises.length > 0 && (
                <div className="course-block">
                  <strong>Practice</strong>
                  {lesson.exercises.map((ex) => <Exercise key={ex.id} exercise={ex} />)}
                </div>
              )}
            </>
          ) : (
            <p className="muted">Select a lesson.</p>
          )}
          {wordCard && <WordCard word={wordCard.word} x={wordCard.x} y={wordCard.y} onClose={() => setWordCard(null)} />}
        </section>
      </div>
      <SiteFooter />
    </div>
  )
}
