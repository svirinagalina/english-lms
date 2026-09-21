import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { io } from 'socket.io-client'
import { useAuth } from '../AuthContext'
import { api } from '../api'
import Whiteboard from '../components/Whiteboard'
import Writing from '../components/Writing'
import Nav from '../components/Nav'
import Panel from '../components/Panel'
import LiveLesson from '../components/LiveLesson'
import { SiteFooter } from '../components/Brand'
import BoardRow from '../components/BoardRow'
import MistakeNotebook from '../components/MistakeNotebook'
import LessonSummaries from '../components/LessonSummaries'
import TrialReports from '../components/TrialReports'
import ActivityHeatmap from '../components/ActivityHeatmap'

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
    <Panel id={`room:package:${classroom.id}`} title="Lesson package" hint={classroom.progress?.lessonsPaid == null ? `${classroom.progress?.held ?? 0} held` : `${Math.max(0, classroom.progress?.remaining ?? 0)} left`}>
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
    </Panel>
  )
}

export default function Classroom() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [classroom, setClassroom] = useState(null)
  // My students, for mistakes and words written on one of my own boards.
  const [myStudents, setMyStudents] = useState([])
  const [error, setError] = useState('')
  const [openBoardId, setOpenBoardId] = useState(searchParams.get('board'))
  // Links within the page (a lesson summary, the homework tile) change ?board=.
  useEffect(() => { const b = searchParams.get('board'); if (b) setOpenBoardId(b) }, [searchParams])
  // ?summary=<id>: the lesson summary whose questions go onto the board.
  const [insertBlock, setInsertBlock] = useState(null)
  useEffect(() => {
    const summaryId = searchParams.get('summary')
    if (!summaryId) { setInsertBlock(null); return }
    api.lessonSummaries(id).then(({ summaries }) => {
      const s = summaries.find((x) => x.id === summaryId)
      if (!s || !s.questions.length) return
      const date = new Date(s.startedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })
      setInsertBlock({ key: s.id, title: `— Speaking · lesson of ${date} —`, lines: s.questions })
    }).catch(() => {})
  }, [id, searchParams])
  const [writingOpen, setWritingOpen] = useState(searchParams.get('writing') === '1')
  const [title, setTitle] = useState('')
  const [starting, setStarting] = useState(false)
  const [assistEnabled, setAssistEnabled] = useState(false)

  const [targets, setTargets] = useState([])
  const socketRef = useRef(null)

  const isStaff = user.role !== 'STUDENT'

  // The student's weak spots, for a glance before the lesson.
  const [report, setReport] = useState(null)
  const studentId = classroom?.student?.id ?? null
  useEffect(() => {
    if (!studentId || !isStaff) { setReport(null); return }
    api.statsStudent(studentId).then(setReport).catch(() => setReport(null))
  }, [studentId, isStaff])

  const refresh = async () => {
    const { classroom } = await api.getClassroom(id)
    setClassroom(classroom)
  }

  // The socket only serves the whiteboard here; nothing about it counts as a lesson.
  useEffect(() => {
    refresh().catch((err) => setError(err.message))
    if (isStaff) {
      api.assistStatus().then(({ enabled }) => setAssistEnabled(enabled)).catch(() => {})

      // Which students a board from here can be assigned to.
      api.listClassrooms()
        .then(({ classrooms }) => {
          setTargets(classrooms.map((c) => ({ id: c.id, label: c.student.name })).filter((t) => t.id !== id))
          setMyStudents(classrooms.filter((c) => c.student && !c.former && c.teacher?.id === user.id).map((c) => ({ classroomId: c.id, name: c.student.name })))
        })
        .catch(() => {})
    }

    const socket = io({ withCredentials: true })
    socketRef.current = socket
    socket.on('connect_error', (err) => setError(err.message))
    // On the first connection and after every reconnect.
    socket.on('connect', () => {
      socket.emit('join-classroom', id, {}, (response) => {
        if (response?.error) setError(response.error)
      })
    })

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

  const startTrial = async () => {
    setStarting(true)
    try {
      const { call, boardId, focusId } = await api.startTrial(id)
      navigate(`/call/${call.token}?board=${boardId}&focus=${focusId}`)
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
  const openBoard = classroom.boards.find((b) => b.id === openBoardId) ?? (openBoardId === 'default' ? classroom.boards.find((b) => !b.shared) : undefined)

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
            wordPicker={!isStaff}
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
            boardId={openBoard.id}
            title={openBoard.title}
            subtitle={partner}
            // On your own shelf, closing a board used to land on this
            // classroom's own list view — just the Boards panel again,
            // duplicating what the main Classroom page already shows, and
            // reads as everything else (students, textbooks…) having
            // vanished. Skip straight to the real dashboard there; a
            // student's classroom still has its own sessions/progress to
            // come back to, so that one stays as is.
            onClose={() => (isPersonal ? navigate('/classroom') : setOpenBoardId(null))}
            onStartCall={isStaff ? () => startCallOnBoard(openBoard.id) : undefined}
            onOpenWriting={!isPersonal ? () => setWritingOpen(true) : undefined}
            canSpotlight={isStaff}
            wordPicker={!isStaff}
            focusElementId={searchParams.get('focus')}
            insertBlock={insertBlock}
            onInserted={() => { setInsertBlock(null); setSearchParams((p) => { p.delete('summary'); p.set('board', openBoard.id); return p }, { replace: true }) }}
            onMistake={isStaff && (!isPersonal || myStudents.length) ? (body, chosen) => api.addMistake(isPersonal ? chosen : id, { ...body, boardId: openBoard.id }) : undefined}
            onMistakeRemoved={isStaff && !isPersonal ? (elementId) => api.deleteMistakeByElement(elementId).catch(() => {}) : undefined}
            onUploadImage={isStaff
              ? async (dataUrl) => {
                  try {
                    const { src } = await api.uploadBoardImage(id, openBoard.id, dataUrl)
                    return src
                  } catch (err) {
                    setError(err.message)
                    return null
                  }
                }
              : undefined}
            onAddWords={!isPersonal || myStudents.length ? (words, chosen) => api.addBoardWords(words, isPersonal ? chosen : id) : undefined}
            students={isPersonal && myStudents.length ? myStudents : null}
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
      <Nav title={partner} back="/classroom" />

      <div className="row-main subheader">
        <div className="row-actions">
          {isStaff && classroom.progress && (
            <span className="muted">
              {classroom.progress.held}
              {classroom.progress.lessonsPaid != null && ` / ${classroom.progress.lessonsPaid}`} lessons
            </span>
          )}
        </div>
        {isStaff && !isPersonal && (
          <div className="row-actions">
            <button className="ghost" onClick={startTrial} disabled={starting} title="A call with the placement test on the board; not counted as a paid lesson">Trial lesson</button>
            <button onClick={startCall} disabled={starting}>
              {starting ? 'Starting…' : 'Start a call'}
            </button>
          </div>
        )}
      </div>

      {error && <div className="error">{error}</div>}

      {!isStaff && <LiveLesson classroomId={id} />}

      <Panel id={`room:boards:${id}`} title={isPersonal ? 'Boards' : 'Board'} count={classroom.boards.length} defaultOpen>
        <p className="muted" style={{ marginBottom: 10 }}>
          {isPersonal
            ? 'Your own boards. Open any time.'
            : `One board for all lessons with ${user.role === 'STUDENT' ? 'your teacher' : 'the student'}: every lesson and its materials stay here. Open any time, not just during a call.`}
        </p>

        {isStaff && isPersonal && (
          <form className="inline-form" onSubmit={addBoard}>
            <input
              placeholder="Board title, e.g. Present Perfect — 14 Sep"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <button type="submit">New board</button>
          </form>
        )}

        {classroom.boards.length === 0 && <p className="muted">{isPersonal ? 'No boards yet — create one above.' : 'No board yet — it appears the first time the cabinet is opened.'}</p>}

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
      </Panel>

      {!isPersonal && (
        <Panel id={`room:writing:${id}`} title="Writing">
          <p className="muted" style={{ marginBottom: 10 }}>
            {user.role === 'STUDENT'
              ? 'Write your essays and texts here; your teacher corrects them with tracked changes you can accept or reject.'
              : 'The student writes here; your corrections show as tracked changes, like suggestions in Google Docs. Also opens inside a call.'}
          </p>
          <button onClick={() => setWritingOpen(true)}>Open writing</button>
        </Panel>
      )}

      {!isPersonal && (
        <MistakeNotebook
          classroomId={id}
          canEdit={isStaff}
          student={!isStaff}
          boardLink={(m) => `/classroom/${id}?board=${m.boardId}&focus=${m.elementId}`}
        />
      )}

      {!isPersonal && <TrialReports classroomId={id} canEdit={isStaff} />}

      {!isPersonal && <LessonSummaries classroomId={id} canEdit={isStaff} student={!isStaff} />}

      {!isPersonal && (
        <Panel id={`room:activity:${id}`} title="Activity">
          <ActivityHeatmap studentId={isStaff ? classroom.student.id : null} />
        </Panel>
      )}

      {isStaff && !isPersonal && report && (
        <Panel id={`room:worth:${id}`} title="Worth practising" count={report.weakTopics?.length ?? 0}>
          {report.total === 0 ? (
            <p className="muted">No practice attempts yet.</p>
          ) : (
            <>
              <p className="muted" style={{ marginBottom: 10 }}>
                {report.total} attempts · {report.accuracy}% correct
                {report.weakTopics?.length ? ' · the topics that keep going wrong:' : ' · no recurring mistakes.'}
              </p>
              {report.weakTopics?.length > 0 && (
                <div className="mistake-tags">
                  {report.weakTopics.map((t) => (
                    <span key={t.topic} className="mistake-tag" title={`${t.count} mistakes, ${t.errorRate}% of the exercises on it`}>
                      {t.label} · {t.count}
                    </span>
                  ))}
                </div>
              )}
              {report.suggestions?.length > 0 && (
                <p className="muted" style={{ marginTop: 8 }}>
                  Chapters to revisit: {report.suggestions.flatMap((s) => s.units.map((u) => u.title)).filter((v, i, arr) => arr.indexOf(v) === i).slice(0, 4).join(' · ')}
                </p>
              )}
              <Link className="ghost button-link" to={`/progress/${classroom.student.id}`}>Full report</Link>
            </>
          )}
        </Panel>
      )}

      {isStaff && classroom.progress && <PackagePanel classroom={classroom} onChanged={refresh} />}

      {!isPersonal && !isStaff && classroom.progress && (
        <Panel id={`room:package:${id}`} title="Lesson package" hint={classroom.progress.lessonsPaid == null ? `${classroom.progress.held} held` : `${Math.max(0, classroom.progress.remaining ?? 0)} left`}>
          <p>
            <strong>{classroom.progress.held}</strong>{' '}
            {classroom.progress.lessonsPaid == null
              ? 'lessons held'
              : `of ${classroom.progress.lessonsPaid} paid lessons held`}
            {classroom.progress.remaining != null && (
              <span className={`paid-badge ${classroom.progress.remaining > 0 ? 'active' : ''}`} style={{ marginLeft: 10 }}>
                {classroom.progress.remaining > 0 ? `${classroom.progress.remaining} left` : 'package finished'}
              </span>
            )}
          </p>
        </Panel>
      )}

      {!isPersonal && (
      <Panel id={`room:sessions:${id}`} title="Lessons held" count={classroom.sessions.length}>
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
      </Panel>
      )}
      <SiteFooter />
    </div>
  )
}
