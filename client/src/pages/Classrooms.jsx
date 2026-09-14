import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { api } from '../api'
import Nav from '../components/Nav'

function PackageBadge({ progress }) {
  if (progress.lessonsPaid == null) {
    return <span className="muted">{progress.held} lessons held</span>
  }
  const left = progress.remaining
  return (
    <span className={left <= 0 ? 'paid-badge' : 'paid-badge active'}>
      {progress.held} of {progress.lessonsPaid} · {left > 0 ? `${left} left` : 'package finished'}
    </span>
  )
}

export default function Classrooms() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [classrooms, setClassrooms] = useState([])
  const [calls, setCalls] = useState([])
  const [mine, setMine] = useState(null)
  const [boardTitle, setBoardTitle] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [copied, setCopied] = useState(null)

  const isStaff = user.role === 'OWNER' || user.role === 'TEACHER'

  const refresh = async () => {
    const { classrooms } = await api.listClassrooms()
    setClassrooms(classrooms)
    if (isStaff) {
      const [{ calls }, { classroom }] = await Promise.all([api.listCalls(), api.myBoards()])
      setCalls(calls)
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

  const copyLink = async (call) => {
    try {
      await navigator.clipboard.writeText(call.link)
      setCopied(call.id)
      setTimeout(() => setCopied(null), 2500)
    } catch {
      window.prompt('Copy this link:', call.link)
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

  const deleteBoard = async (board) => {
    if (!window.confirm(`Delete "${board.title}"?`)) return
    await api.deleteBoard(mine.id, board.id)
    await refresh()
  }

  const endCall = async (call) => {
    await api.endCall(call.id)
    await refresh()
  }

  if (loading) return <div className="centered">Loading…</div>

  return (
    <div className="page">
      <Nav title="Classroom" />

      {error && <div className="error">{error}</div>}

      {isStaff && (
        <section>
          <div className="call-launch">
            <div>
              <h2 style={{ marginBottom: 4 }}>Video call</h2>
              <p className="muted">
                Starts a call and gives you a link. Anyone with the link can join — they do not need an account.
              </p>
            </div>
            <button onClick={startCall} disabled={starting}>
              {starting ? 'Starting…' : 'Start a call'}
            </button>
          </div>

          {calls.length > 0 && (
            <div className="list" style={{ marginTop: 12 }}>
              {calls.map((call) => (
                <div key={call.id} className="row">
                  <div>
                    <strong>{call.title ?? 'Open call'}</strong>
                    <div className="muted">started {new Date(call.createdAt).toLocaleString()}</div>
                  </div>
                  <div className="row-actions">
                    <button className="ghost" onClick={() => copyLink(call)}>
                      {copied === call.id ? 'Copied' : 'Copy link'}
                    </button>
                    <Link className="button" to={`/call/${call.token}`}>Rejoin</Link>
                    <button className="ghost" onClick={() => endCall(call)}>End</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {isStaff && mine && (
        <section>
          <h2>My boards</h2>
          <p className="muted" style={{ marginBottom: 10 }}>
            Your own whiteboards — screenshots, notes, materials. Open any time; a board opened during a call is shared with everyone in it.
          </p>
          <form className="inline-form" onSubmit={addBoard}>
            <input
              placeholder="Board title"
              value={boardTitle}
              onChange={(e) => setBoardTitle(e.target.value)}
            />
            <button type="submit">New board</button>
          </form>

          {mine.boards.length === 0 && <p className="muted">No boards yet.</p>}

          <div className="list">
            {mine.boards.map((board) => (
              <div key={board.id} className="row">
                <div>
                  <strong>{board.title}</strong>
                  <div className="muted">Updated {new Date(board.updatedAt).toLocaleString()}</div>
                </div>
                <div className="row-actions">
                  <Link className="button" to={`/classroom/${mine.id}?board=${board.id}`}>Open</Link>
                  <button className="ghost" onClick={() => deleteBoard(board)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2>{user.role === 'STUDENT' ? 'My teachers' : 'Students'}</h2>
        <p className="muted" style={{ marginBottom: 10 }}>
          {user.role === 'STUDENT'
            ? 'Boards and materials from your lessons.'
            : 'Each student has a space with boards, materials and the lesson count.'}
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
            <Link key={classroom.id} className="row unit-row" to={`/classroom/${classroom.id}`}>
              <div className="unit-main">
                <strong>{user.role === 'STUDENT' ? classroom.teacher.name : classroom.student.name}</strong>
                <div className="muted">
                  {classroom.boards} {classroom.boards === 1 ? 'board' : 'boards'}
                  {classroom.lastSession &&
                    ` · last lesson ${new Date(classroom.lastSession).toLocaleDateString()}`}
                </div>
              </div>
              {isStaff && classroom.progress && <PackageBadge progress={classroom.progress} />}
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
