import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { api } from '../api'
import Nav from '../components/Nav'

function PackageBadge({ progress }) {
  if (progress.lessonsPaid == null) {
    return <span className="muted">{progress.held} lessons held</span>
  }

  const left = progress.remaining
  const tone = left <= 0 ? 'paid-badge' : 'paid-badge active'

  return (
    <span className={tone}>
      {progress.held} of {progress.lessonsPaid} · {left > 0 ? `${left} left` : 'package finished'}
    </span>
  )
}

export default function Classrooms() {
  const { user } = useAuth()
  const [classrooms, setClassrooms] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.listClassrooms()
      .then(({ classrooms }) => setClassrooms(classrooms))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="centered">Loading…</div>

  const isStudent = user.role === 'STUDENT'

  return (
    <div className="page">
      <Nav title="Classroom" />

      {error && <div className="error">{error}</div>}

      {classrooms.length === 0 && (
        <p className="muted" style={{ marginTop: 24 }}>
          {isStudent
            ? 'You are not linked to a teacher yet.'
            : 'No students yet. Invite one in the People section — a classroom appears automatically.'}
        </p>
      )}

      <section>
        <div className="list">
          {classrooms.map((classroom) => (
            <Link key={classroom.id} className="row unit-row" to={`/classroom/${classroom.id}`}>
              <div className="unit-main">
                <strong>{isStudent ? classroom.teacher.name : classroom.student.name}</strong>
                <div className="muted">
                  {classroom.boards} {classroom.boards === 1 ? 'board' : 'boards'}
                  {classroom.lastSession &&
                    ` · last lesson ${new Date(classroom.lastSession).toLocaleDateString()}`}
                </div>
              </div>
              {!isStudent && <PackageBadge progress={classroom.progress} />}
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
