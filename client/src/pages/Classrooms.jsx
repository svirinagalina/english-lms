import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { api } from '../api'
import { matchesSearch } from '../utils/search'
import Nav from '../components/Nav'
import { SiteFooter } from '../components/Brand'
import BoardRow from '../components/BoardRow'
import { PackageBadge } from '../components/PackageBadge'
import StudentHome from '../components/StudentHome'
import FreeHome from '../components/FreeHome'
import Panel from '../components/Panel'
import Textbooks from '../components/Textbooks'
import PersonLink from '../components/PersonLink'

export default function Classrooms() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [classrooms, setClassrooms] = useState([])
  const [mine, setMine] = useState(null)
  const [boardTitle, setBoardTitle] = useState('')
  const [query, setQuery] = useState('')
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

  const startTrial = async (classroom) => {
    setStartingFor(classroom.id)
    try {
      const { call, boardId } = await api.startTrial(classroom.id)
      navigate(`/call/${call.token}?board=${boardId}`)
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

  // An administrator gets every classroom of the school: their own students
  // first, the other teachers' in a separate panel. A teacher only ever
  // receives their own from the server.
  const isAdmin = user.role === 'OWNER' || user.role === 'PARTNER'
  // Staff search: a student by name, a board by its title or who it's with.
  const q = query.trim().toLowerCase()
  const nameMatches = (c) => matchesSearch(q, c.student?.name)
  const boardMatches = (b) => matchesSearch(q, b.title, b.sharedWith?.map((c) => c.name) ?? [])
  const own = classrooms.filter((c) => user.role === 'STUDENT' || (c.teacher?.id === user.id && nameMatches(c)))
  const others = isAdmin ? classrooms.filter((c) => c.teacher?.id !== user.id && nameMatches(c)) : []
  const myBoards = mine ? mine.boards.filter(boardMatches) : []
  const otherTeachers = [...new Map(others.map((c) => [c.teacher.id, c.teacher])).values()]

  const studentList = (items) => (
    <div className="list">
      {items.map((classroom) => (
        <div key={classroom.id} className="row student-row">
          <Link className="unit-main student-link" to={`/classroom/${classroom.id}`}>
            {user.role === 'STUDENT' ? <strong>{classroom.teacher.name}</strong> : <PersonLink id={classroom.student.id} name={classroom.student.name} />}
            <div className="muted">
              {classroom.lastSession
                ? `last lesson ${new Date(classroom.lastSession).toLocaleDateString()}`
                : 'no lessons yet'}
              {classroom.boards > 1 && ` · ${classroom.boards} boards`}
              {classroom.former && ' · moved to another teacher — history only'}
            </div>
            {isStaff && classroom.progress && (
              <PackageBadge pkg={{ lessonsPaid: classroom.progress.lessonsPaid, held: classroom.progress.held, remaining: classroom.progress.remaining }} />
            )}
          </Link>
          {isStaff && (
            <div className="row-actions">
              <button className="ghost" onClick={() => navigate(`/classroom/${classroom.id}`)}>Open</button>
              {classroom.teacher?.id === user.id && (
                <>
                  <button className="ghost" onClick={() => startTrial(classroom)} disabled={startingFor === classroom.id} title="A call with the placement test on the board; not counted as a paid lesson">Trial lesson</button>
                  <button onClick={() => startLesson(classroom)} disabled={startingFor === classroom.id}>
                    {startingFor === classroom.id ? 'Starting…' : 'Start lesson'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )

  return (
    <div className="page">
      <Nav title="Classroom" />

      {error && <div className="error">{error}</div>}

      {user.free && <FreeHome />}
      {!isStaff && !user.free && <StudentHome classrooms={classrooms} />}

      {isStaff && (
        <input className="home-search" type="search" placeholder="Search students and boards" value={query}
          onChange={(e) => setQuery(e.target.value)} />
      )}

      {!user.free && <Panel id="home:students" title={user.role === 'STUDENT' ? 'My teachers' : 'My students'} count={own.length} defaultOpen={user.role === 'STUDENT'} forceOpen={Boolean(q)}>
        <p className="muted" style={{ marginBottom: 10 }}>
          {user.role === 'STUDENT'
            ? 'Boards and materials from your lessons.'
            : 'Start lesson opens a call on the student\'s board; the student joins from their cabinet or the link.'}
        </p>

        {own.length === 0 && (
          <p className="muted">
            {user.role === 'STUDENT'
              ? 'You are not linked to a teacher yet.'
              : q ? 'No student matches.' : 'No students yet. Invite one in the People section.'}
          </p>
        )}

        {studentList(own)}
      </Panel>}

      {isAdmin && others.length > 0 && (
        <Panel id="home:others" title="Other teachers’ students" count={others.length} hint="as administrator" forceOpen={Boolean(q)}>
          <p className="muted" style={{ marginBottom: 10 }}>
            Students linked to other teachers. Only the administrator sees this list; each teacher sees their own students only.
          </p>
          {otherTeachers.map((teacher) => (
            <div key={teacher.id} style={{ marginBottom: 14 }}>
              <h3 className="group-title"><PersonLink id={teacher.id} name={teacher.name}>{teacher.name}</PersonLink></h3>
              {studentList(others.filter((c) => c.teacher.id === teacher.id))}
            </div>
          ))}
        </Panel>
      )}

      {isStaff && mine && (
        <Panel id="home:boards" title="My boards" count={myBoards.length} forceOpen={Boolean(q)}>
          <p className="muted" style={{ marginBottom: 10 }}>
            Boards that belong to you rather than to a student — drafts, screenshots, reusable material.
            Use <strong>Assign</strong> to give one of these to a student (or several, for a pair or group lesson) — it becomes their one board, replacing whatever they had before.
          </p>
          <form className="inline-form" onSubmit={addBoard}>
            <input
              placeholder="Board title"
              value={boardTitle}
              onChange={(e) => setBoardTitle(e.target.value)}
            />
            <button type="submit">New board</button>
          </form>

          {myBoards.length === 0 && <p className="muted">{q ? 'No board matches.' : 'No boards of your own yet — most work happens on the students\' boards above.'}</p>}

          <div className="list">
            {myBoards.map((board) => (
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
        </Panel>
      )}

      {isStaff && <Textbooks />}

      {isStaff && (
        <section className="panel-like">
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

      {isStaff && (
        <div style={{ textAlign: 'center', padding: '20px 0', color: '#666' }}>
          <p style={{ fontSize: 13, margin: 0 }}>
            Need help?{' '}
            <a href="/teacher-guide.html" target="_blank" rel="noopener noreferrer" style={{ color: '#b5539a', textDecoration: 'none' }}>
              Read the teacher guide
            </a>
          </p>
        </div>
      )}

      <SiteFooter />
    </div>
  )
}
