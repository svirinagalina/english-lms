import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { io } from 'socket.io-client'
import { useAuth } from '../AuthContext'
import { api } from '../api'
import Whiteboard from '../components/Whiteboard'
import Writing from '../components/Writing'
import Nav from '../components/Nav'
import BoardRow from '../components/BoardRow'

function PackagePanel({ classroom, onChanged }) {
  const [paid, setPaid] = useState(classroom.progress?.lessonsPaid ?? '')
  const [error, setError] = useState('')
  const { progress } = classroom

  const save = async (resetCounter) => {
    setError('')
    try {
      await api.updatePackage(classroom.id, { lessonsPaid: paid === '' ? null : Number(paid), resetCounter })
      await onChanged()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <section>
      <h2>Lesson package</h2>
      {error && <div className="error">{error}</div>}
      <div className="package-box">
        <div className="package-count">
          <strong>{progress.held}</strong>
          <span className="muted">
            {progress.lessonsPaid == null ? 'lessons held' : `of ${progress.lessonsPaid} paid`}
          </span>
          {progress.remaining != null && (
            <span className={progress.remaining > 0 ? 'paid-badge active' : 'paid-badge'}>
              {progress.remaining > 0 ? `${progress.remaining} left` : 'package finished'}
            </span>
          )}
        </div>
        <div className="package-controls">
          <input
            type="number" min="0" placeholder="Lessons paid"
            value={paid} onChange={(e) => setPaid(e.target.value)} style={{ width: 130 }}
          />
          <button onClick={() => save(false)}>Save</button>
          <button className="ghost" onClick={() => save(true)}>Save and start new package</button>
        </div>
      </div>
      {progress.packageStartedAt && (
        <p className="muted">Counting from {new Date(progress.packageStartedAt).toLocaleDateString()}</p>
      )}
    </section>
  )
}

export default function Classroom() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [classroom, setClassroom] = useState(null)
  const [error, setError] = useState('')
  const [openBoardId, setOpenBoardId] = useState(searchParams.get('board'))
  const [writingOpen, setWritingOpen] = useState(searchParams.get('writing') === '1')
  const [title, setTitle] = useState('')
  const [starting, setStarting] = useState(false)
  const [assistEnabled, setAssistEnabled] = useState(false)
  const [targets, setTargets] = useState([])
  const socketRef = useRef(null)

  const isStaff = user.role !== 'STUDENT'

  const refresh = async () => {
    const { classroom } = await api.getClassroom(id)
    setClassroom(classroom)
  }

  // The socket only serves the whiteboard here; nothing about it counts as a lesson.
  useEffect(() => {
    refresh().catch((err) => setError(err.message))
    if (isStaff) {
      api.assistStatus().then(({ enabled }) => setAssistEnabled(enabled)).catch(() => {})
      // Where a board from here can go: my own boards, or another student.
      Promise.all([api.myBoards(), api.listClassrooms()])
        .then(([{ classroom: mine }, { classrooms }]) =>
          setTargets([
            { id: mine.id, label: 'My boards' },
            ...classrooms.map((c) => ({ id: c.id, label: c.student.name }))
          ].filter((t) => t.id !== id))
        )
        .catch(() => {})
    }

    const socket = io({ withCredentials: true })
    socketRef.current = socket
    socket.on('connect_error', (err) => setError(err.message))
    socket.emit('join-classroom', id, {}, (response) => {
      if (response?.error) setError(response.error)
    })
    socket.on('board:switched', (boardId) => setOpenBoardId(boardId))

    return () => socket.disconnect()
  }, [id])

  // A call that opens straight on this board; the link in the call is what
  // you send to the student.
  const startCallOnBoard = async (boardId) => {
    try {
      const { call } = await api.createCall({
        ...(isPersonal ? {} : { classroomId: id }),
        title: isPersonal ? openBoard.title : `Lesson with ${classroom.student.name}`
      })
      navigate(`/call/${call.token}?board=${boardId}`)
    } catch (err) {
      setError(err.message)
    }
  }

  const startCall = async () => {
    setStarting(true)
    try {
      const { call } = await api.createCall({
        classroomId: id,
        title: `Lesson with ${classroom.student.name}`
      })
      navigate(`/call/${call.token}`)
    } catch (err) {
      setError(err.message)
      setStarting(false)
    }
  }

  const addBoard = async (event) => {
    event.preventDefault()
    try {
      const { board } = await api.createBoard(id, title || `Board ${new Date().toLocaleDateString()}`)
      setTitle('')
      await refresh()
      setOpenBoardId(board.id)
    } catch (err) {
      setError(err.message)
    }
  }

  const toggleCounted = async (session) => {
    await api.updateSession(id, session.id, { counted: !session.counted })
    await refresh()
  }

  const removeSession = async (session) => {
    if (!window.confirm('Remove this lesson from the record?')) return
    await api.deleteSession(id, session.id)
    await refresh()
  }

  if (error && !classroom) {
    return (
      <div className="centered">
        <div className="card">
          <h2>Cannot open</h2>
          <p className="error">{error}</p>
          <Link className="button" to="/classroom">Back</Link>
        </div>
      </div>
    )
  }

  if (!classroom) return <div className="centered">Loading…</div>

  const isPersonal = classroom.isTestRoom
  const partner = isPersonal
    ? 'My boards'
    : user.role === 'STUDENT' ? classroom.teacher.name : classroom.student.name
  const openBoard = classroom.boards.find((b) => b.id === openBoardId)

  if (writingOpen && !isPersonal) {
    return (
      <div className="lesson-page">
        <div className="view-pane">
          <Writing
            socketRef={socketRef}
            classroomId={id}
            user={user}
            title="Writing"
            subtitle={partner}
            onClose={() => setWritingOpen(false)}
          />
        </div>
      </div>
    )
  }

  if (openBoard) {
    return (
      <div className="lesson-page">
        <div className="view-pane">
          <Whiteboard
            socketRef={socketRef}
            boardId={openBoardId}
            title={openBoard.title}
            subtitle={partner}
            onClose={() => setOpenBoardId(null)}
            onStartCall={isStaff ? () => startCallOnBoard(openBoard.id) : undefined}
            onOpenWriting={!isPersonal ? () => setWritingOpen(true) : undefined}
            canSpotlight={isStaff}
            onUploadImage={isStaff
              ? async (dataUrl) => {
                  try {
                    const { src } = await api.uploadBoardImage(id, openBoardId, dataUrl)
                    return src
                  } catch (err) {
                    setError(err.message)
                    return null
                  }
                }
              : undefined}
            assistEnabled={assistEnabled}
            onAssist={isStaff
              ? async (mode, words) => {
                  try {
                    const { items } = await api.assist(mode, words)
                    return items
                  } catch (err) {
                    setError(err.message)
                    return null
                  }
                }
              : undefined}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <Nav title={partner} />

      <div className="row-main subheader">
        <div className="row-actions">
          <Link className="ghost back-link" to="/classroom">← Back</Link>
          {isStaff && classroom.progress && (
            <span className="muted">
              {classroom.progress.held}
              {classroom.progress.lessonsPaid != null && ` / ${classroom.progress.lessonsPaid}`} lessons
            </span>
          )}
        </div>
        {isStaff && !isPersonal && (
          <button onClick={startCall} disabled={starting}>
            {starting ? 'Starting…' : 'Start a call'}
          </button>
        )}
      </div>

      {error && <div className="error">{error}</div>}

      <section>
        <h2>{isPersonal ? 'Boards' : 'Board'}</h2>
        <p className="muted" style={{ marginBottom: 10 }}>
          {isPersonal
            ? 'Your own boards. Open any time.'
            : `One board for all lessons with ${user.role === 'STUDENT' ? 'your teacher' : 'the student'}: every lesson and its materials stay here. Open any time, not just during a call.`}
        </p>

        {isStaff && (
          <form className="inline-form" onSubmit={addBoard}>
            <input
              placeholder="Board title, e.g. Present Perfect — 14 Sep"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <button type="submit" className={isPersonal ? '' : 'ghost'}>{isPersonal ? 'New board' : 'Extra board'}</button>
          </form>
        )}

        {classroom.boards.length === 0 && <p className="muted">No boards yet.</p>}

        <div className="list">
          {classroom.boards.map((board) => (
            <BoardRow
              key={board.id}
              board={board}
              classroomId={id}
              canEdit={isStaff}
              targets={targets}
              onOpen={() => setOpenBoardId(board.id)}
              onChanged={async () => {
                await refresh()
                if (openBoardId === board.id) setOpenBoardId(null)
              }}
            />
          ))}
        </div>
      </section>

      {!isPersonal && (
        <section>
          <h2>Writing</h2>
          <p className="muted" style={{ marginBottom: 10 }}>
            {user.role === 'STUDENT'
              ? 'Write your essays and texts here; your teacher corrects them with tracked changes you can accept or reject.'
              : 'The student writes here; your corrections show as tracked changes, like suggestions in Google Docs. Also opens inside a call.'}
          </p>
          <button onClick={() => setWritingOpen(true)}>Open writing</button>
        </section>
      )}

      {isStaff && classroom.progress && <PackagePanel classroom={classroom} onChanged={refresh} />}

      {!isPersonal && (
      <section>
        <h2>Lessons held</h2>
        {classroom.sessions.length === 0 && <p className="muted">No lessons yet.</p>}
        <div className="list">
          {classroom.sessions.map((session) => (
            <div key={session.id} className="row">
              <div>
                <strong>{new Date(session.startedAt).toLocaleString()}</strong>
                <div className="muted">
                  {session.endedAt ? `${session.minutes} min` : 'in progress'}
                  {!session.counted && ' · not counted'}
                </div>
              </div>
              {isStaff && (
                <div className="row-actions">
                  <button className="ghost" onClick={() => toggleCounted(session)}>
                    {session.counted ? 'Do not count' : 'Count'}
                  </button>
                  <button className="ghost" onClick={() => removeSession(session)}>Remove</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
      )}
    </div>
  )
}
