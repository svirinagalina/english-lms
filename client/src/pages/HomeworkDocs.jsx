import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { io } from 'socket.io-client'
import { useAuth } from '../AuthContext'
import { api } from '../api'
import Writing from '../components/Writing'
import Nav from '../components/Nav'

// Homework documents of one cabinet: a list (/classroom/:id/homework) and
// each one full-page (/classroom/:id/homework/:docId), edited live like
// Writing — the teacher's edits are tracked suggestions there too.
export default function HomeworkDocs() {
  const { id, docId } = useParams()
  return docId ? <HomeworkDoc classroomId={id} docId={docId} /> : <HomeworkList classroomId={id} />
}

const day = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

function HomeworkList({ classroomId }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const isStaff = user.role !== 'STUDENT'
  const [classroom, setClassroom] = useState(null)
  const [docs, setDocs] = useState(null)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const refresh = () => api.homeworkDocs(classroomId).then(({ docs }) => setDocs(docs)).catch((e) => setError(e.message))
  useEffect(() => {
    api.getClassroom(classroomId).then(({ classroom }) => setClassroom(classroom)).catch(() => {})
    refresh()
  }, [classroomId])

  const create = async (event) => {
    event.preventDefault()
    if (!title.trim()) return
    setBusy(true)
    try {
      const { doc } = await api.createHomeworkDoc(classroomId, title.trim())
      navigate(`/classroom/${classroomId}/homework/${doc.id}`)
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  const rename = async (doc) => {
    const next = window.prompt('Homework title', doc.title)?.trim()
    if (!next || next === doc.title) return
    try { await api.renameHomeworkDoc(classroomId, doc.id, next); refresh() } catch (e) { setError(e.message) }
  }

  const remove = async (doc) => {
    if (!window.confirm(`Delete “${doc.title}”? The text in it is lost.`)) return
    try { await api.deleteHomeworkDoc(classroomId, doc.id); refresh() } catch (e) { setError(e.message) }
  }

  const partner = classroom ? (user.role === 'STUDENT' ? classroom.teacher?.name : classroom.student?.name) : null

  return (
    <div className="page">
      <Nav title="Homework" />
      <p><Link to={`/classroom/${classroomId}`}>← Back to the cabinet</Link>{partner && <span className="muted"> · {partner}</span>}</p>
      {error && <div className="error">{error}</div>}

      {isStaff && (
        <form className="homework-new" onSubmit={create}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New homework, e.g. Essay: My summer" maxLength={120} />
          <button type="submit" disabled={busy || !title.trim()}>New homework</button>
        </form>
      )}

      {docs === null ? (
        <p className="muted">Loading…</p>
      ) : docs.length === 0 ? (
        <p className="muted">{isStaff ? 'No homework documents yet — give one a title above.' : 'Your teacher hasn’t set any homework documents yet.'}</p>
      ) : (
        <ul className="homework-docs">
          {docs.map((doc) => (
            <li key={doc.id}>
              <Link to={`/classroom/${classroomId}/homework/${doc.id}`}>{doc.title}</Link>
              <span className="muted"> · {day(doc.createdAt)}</span>
              {isStaff && (
                <span className="homework-doc-actions">
                  <button className="ghost" onClick={() => rename(doc)}>Rename</button>
                  <button className="ghost" onClick={() => remove(doc)}>Delete</button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function HomeworkDoc({ classroomId, docId }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const socketRef = useRef(null)
  const [doc, setDoc] = useState(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.homeworkDoc(classroomId, docId).then(({ doc }) => setDoc(doc)).catch((e) => setError(e.message))
    const socket = io({ withCredentials: true })
    socketRef.current = socket
    socket.on('connect_error', (err) => setError(err.message))
    setReady(true)
    return () => { socket.disconnect(); socketRef.current = null; setReady(false) }
  }, [classroomId, docId])

  if (error) return <div className="page"><Nav title="Homework" /><div className="error">{error}</div></div>

  return (
    <div className="lesson-page">
      <div className="view-pane">
        {ready && (
          <Writing
            socketRef={socketRef}
            classroomId={classroomId}
            docKey={`hw:${docId}`}
            user={user}
            title={doc?.title ?? 'Homework'}
            subtitle="Homework"
            onClose={() => navigate(`/classroom/${classroomId}/homework`)}
            backLabel="← All homework"
            wordPicker={user.role === 'STUDENT'}
          />
        )}
      </div>
    </div>
  )
}
