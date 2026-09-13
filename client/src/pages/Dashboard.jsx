import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { api } from '../api'
import Nav from '../components/Nav'

export default function Dashboard() {
  const { user } = useAuth()
  const [lessons, setLessons] = useState([])
  const [people, setPeople] = useState([])
  const [title, setTitle] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const canTeach = user.role === 'OWNER' || user.role === 'TEACHER'

  const refresh = async () => {
    const [lessonsResult, peopleResult] = await Promise.all([
      api.listLessons(),
      api.listPeople()
    ])
    setLessons(lessonsResult.lessons)
    setPeople(peopleResult.people)
  }

  useEffect(() => {
    refresh().catch((err) => setError(err.message)).finally(() => setLoading(false))
  }, [])

  const handleCreate = async (event) => {
    event.preventDefault()
    setError('')
    try {
      await api.createLesson({ title })
      setTitle('')
      await refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this lesson?')) return
    try {
      await api.deleteLesson(id)
      await refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) return <div className="centered">Loading…</div>

  return (
    <div className="page">
      <Nav />

      {error && <div className="error">{error}</div>}

      <section>
        <h2>{canTeach ? 'My lessons' : 'Lessons'}</h2>

        {canTeach && (
          <form className="inline-form" onSubmit={handleCreate}>
            <input
              placeholder="Lesson title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
            <button type="submit">Create lesson</button>
          </form>
        )}

        {lessons.length === 0 && (
          <p className="muted">
            {canTeach
              ? 'No lessons yet. Create one above.'
              : 'Your teacher has not created any lessons yet.'}
          </p>
        )}

        <div className="list">
          {lessons.map((lesson) => (
            <div key={lesson.id} className="row">
              <div>
                <strong>{lesson.title}</strong>
                <div className="muted">Teacher: {lesson.teacher?.name}</div>
              </div>
              <div className="row-actions">
                {lesson.teacher?.id === user.id && (
                  <button className="ghost" onClick={() => handleDelete(lesson.id)}>Delete</button>
                )}
                <Link className="button" to={`/lesson/${lesson.id}`}>Join call</Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>{user.role === 'STUDENT' ? 'My teachers' : 'My students'}</h2>

        {people.length === 0 && (
          <p className="muted">
            {user.role === 'STUDENT'
              ? 'You are not linked to a teacher yet.'
              : 'No students yet. The administrator can invite them in the People section.'}
          </p>
        )}

        <div className="list">
          {people.map((person) => (
            <div key={person.id} className="row">
              <div>
                <strong>{person.name}</strong>
                <div className="muted">{person.email}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
