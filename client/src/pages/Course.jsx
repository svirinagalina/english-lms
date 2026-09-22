import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import Nav from '../components/Nav'
import { SiteFooter } from '../components/Brand'
import { speakDialogue, stopSpeaking } from '../utils/speech'

const TYPE_LABEL = { theory: 'Theory', practice: 'Practice', supplementary: 'Extra' }

// Dialogue scripts are written as "Speaker: line", one per line — used to
// give each speaker their own voice and to show the labelled transcript in
// "Show script". A line with no "Name: " prefix is treated as one speaker
// throughout (a monologue), never voiced with the label itself.
const parseDialogue = (script) =>
  script.split('\n').filter((line) => line.trim()).map((line) => {
    const match = line.match(/^([A-Za-z][A-Za-z\s]{0,24}):\s*(.*)$/)
    return match ? { speaker: match[1], text: match[2] } : { speaker: '_narrator', text: line }
  })

function TtsBlock({ payload }) {
  const [playing, setPlaying] = useState(false)
  const [revealed, setRevealed] = useState(false)

  // Leaving this lesson (or this block disappearing for any other reason)
  // must not leave its script talking over whatever the student opens next
  // — speechSynthesis is a single global player, not scoped to this component.
  useEffect(() => stopSpeaking, [])

  const play = async () => {
    setPlaying(true)
    const ok = await speakDialogue(parseDialogue(payload.script), () => setPlaying(false))
    if (!ok) { setPlaying(false); setRevealed(true) }
  }

  return (
    <div className="course-block">
      {payload.title && <strong>{payload.title}</strong>}
      <div className="row-actions">
        <button onClick={play} disabled={playing}>{playing ? '▶ Playing…' : '▶ Play'}</button>
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
  if (type === 'tts') return <TtsBlock payload={payload} />
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

export default function Course() {
  const { courseId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [course, setCourse] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getCourse(courseId).then(setCourse).catch((err) => setError(err.message))
  }, [courseId])

  const activePosition = Number.parseInt(searchParams.get('lesson'), 10) || course?.lessons?.[0]?.position
  const lesson = course?.lessons?.find((l) => l.position === activePosition)

  if (error) return <div className="page"><Nav title="Courses" back="/courses" /><div className="error">{error}</div></div>
  if (!course) return <div className="centered">Loading…</div>

  return (
    <div className="page">
      <Nav title={course.title} back="/courses" />

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

        <section className="course-content">
          {lesson ? (
            <>
              <h2>{lesson.position}. {lesson.title}</h2>
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
        </section>
      </div>
      <SiteFooter />
    </div>
  )
}
