import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { api } from '../api'
import Nav from '../components/Nav'
import { SiteFooter } from '../components/Brand'
import BoardRow from '../components/BoardRow'
import { PackageBadge } from '../components/PackageBadge'
import StudentHome from '../components/StudentHome'

export default function Classrooms() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [classrooms, setClassrooms] = useState([])
  const [mine, setMine] = useState(null)
  const [boardTitle, setBoardTitle] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [startingFor, setStartingFor] = useState(null)

  const isStaff = user.role !== 'STUDENT'

  const refresh = async () => {
    const { classrooms } = await api.listClassrooms()
    setClassrooms(classrooms)
    if (isStaff) {
      const { classroom } = await api.myBoards()
      setMine(classroom)
    }
  }

  useEffect(() => {
    refresh().catch((err) => setError(err.message)).finally(() => setLoading(false))
  }, [])

  const startCall = async () => {
    setStarting(true)
    try {
      const { call } = await api.createCall({})
      navigate(`/call/${call.token}`)
    } catch (err) {
      setError(err.message)
      setStarting(false)
    }
  }

  // One click from the list: a call tied to the student, opening on their board.
  const startLesson = async (classroom) => {
    setStartingFor(classroom.id)
    try {
      const { call } = await api.createCall({ classroomId: classroom.id, title: `Lesson with ${classroom.student.name}` })
      navigate(`/call/${call.token}`)
    } catch (err) {
      setError(err.message)
      setStartingFor(null)
    }
  }

  const addBoard = async (event) => {
    event.preventDefault()
    try {
      const { board } = await api.createBoard(mine.id, boardTitle || `Board ${new Date().toLocaleDateString()}`)
      setBoardTitle('')
      navigate(`/classroom/${mine.id}?board=${board.id}`)
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) return <div className="centered">Loading…</div>

  return (
    <div className="page">
      <Nav title="Classroom" />

      {error && <div className="error">{error}</div>}

      {!isStaff && <StudentHome classrooms={classrooms} />}

      <section>
        <h2>{user.role === 'STUDENT' ? 'My teachers' : 'Students'}</h2>
        <p className="muted" style={{ marginBottom: 10 }}>
          {user.role === 'STUDENT'
            ? 'Boards and materials from your lessons.'
            : 'Start lesson opens a call on the student\'s board; the student joins from their cabinet or the link.'}
        </p>

        {classrooms.length === 0 && (
          <p className="muted">
            {user.role === 'STUDENT'
              ? 'You are not linked to a teacher yet.'
              : 'No students yet. Invite one in the People section.'}
          </p>
        )}

        <div className="list">
          {classrooms.map((classroom) => (
            <div key={classroom.id} className="row student-row">
              <Link className="unit-main student-link" to={`/classroom/${classroom.id}`}>
                <strong>{user.role === 'STUDENT' ? classroom.teacher.name : classroom.student.name}</strong>
                <div className="muted">
                  {classroom.lastSession
                    ? `last lesson ${new Date(classroom.lastSession).toLocaleDateString()}`
                    : 'no lessons yet'}
                  {classroom.boards > 1 && ` · ${classroom.boards} boards`}
                </div>
                {isStaff && classroom.progress && (
                  <PackageBadge pkg={{ lessonsPaid: classroom.progress.lessonsPaid, held: classroom.progress.held, remaining: classroom.progress.remaining }} />
                )}
              </Link>
              {isStaff && (
                <div className="row-actions">
                  <button className="ghost" onClick={() => navigate(`/classroom/${classroom.id}`)}>Open</button>
                  <button onClick={() => startLesson(classroom)} disabled={startingFor === classroom.id}>
                    {startingFor === classroom.id ? 'Starting…' : 'Start lesson'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {isStaff && mine && (
        <section>
          <h2>My boards</h2>
          <p className="muted" style={{ marginBottom: 10 }}>
            Boards that belong to you rather than to a student — drafts, screenshots, reusable material.
            A student's lessons live on the board in their cabinet; use <strong>Assign</strong> to move, copy or share one of these to a student.
          </p>
          <form className="inline-form" onSubmit={addBoard}>
            <input
              placeholder="Board title"
              value={boardTitle}
              onChange={(e) => setBoardTitle(e.target.value)}
            />
            <button type="submit">New board</button>
          </form>

          {mine.boards.length === 0 && <p className="muted">No boards of your own yet — most work happens on the students' boards above.</p>}

          <div className="list">
            {mine.boards.map((board) => (
              <BoardRow
                key={board.id}
                board={board}
                classroomId={mine.id}
                canEdit
                targets={classrooms.map((c) => ({ id: c.id, label: c.student.name }))}
                onOpen={() => navigate(`/classroom/${mine.id}?board=${board.id}`)}
                onChanged={refresh}
              />
            ))}
          </div>
        </section>
      )}

      {isStaff && (
        <section>
          <div className="call-launch">
            <div>
              <h2 style={{ marginBottom: 4 }}>Call without a student</h2>
              <p className="muted">
                A group lesson or a call with a colleague: starts a call not tied to any student and gives you a link to send. Only people with an account can join.
              </p>
            </div>
            <button className="ghost" onClick={startCall} disabled={starting}>
              {starting ? 'Starting…' : 'Start a call'}
            </button>
          </div>
        </section>
      )}

      <SiteFooter />
    </div>
  )
}
