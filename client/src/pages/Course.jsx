import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import Nav from '../components/Nav'
import { SiteFooter } from '../components/Brand'

const TYPE_LABEL = { theory: 'Theory', practice: 'Practice', supplementary: 'Extra' }

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
                  <strong>Exercises</strong>
                  <p className="muted">{lesson.exercises.length} exercise(s) — not shown here yet.</p>
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
