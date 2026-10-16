import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../AuthContext'
import Panel from './Panel'

// Who a student studies with, for the administrator: change a teacher (the
// board and Writing move to the new one), remove one, add another. Nothing is
// deleted — past lessons stay in the old cabinet. Used in People and in the
// student's cabinet; `onChanged(person)` gets the student as reloaded.
export function TeacherEditor({ person, teachers, onChanged }) {
  const { user } = useAuth()
  const [error, setError] = useState('')
  const [moved, setMoved] = useState(null)
  const nameOf = (id) => teachers.find((t) => t.id === id)?.name ?? 'the teacher'
  const others = teachers.filter((t) => !person.teachers?.some((x) => x.id === t.id))
  const current = new Set(person.teachers?.map((t) => t.id))
  const past = (person.classrooms ?? []).filter((c) => !current.has(c.teacherId))

  const run = async (action, to) => {
    setError('')
    setMoved(null)
    try {
      const result = await action()
      const what = [result?.moved?.boards?.length ? `board «${result.moved.boards.join('», «')}»` : null, result?.moved?.writing ? 'Writing' : null].filter(Boolean)
      if (what.length && to) setMoved(`${what.join(' and ')} moved to ${to}. Past lessons stay in the old cabinet.`)
      await onChanged?.()
    } catch (err) { setError(err.message) }
  }
  const change = (from, to) => {
    if (!to || !window.confirm(`${person.name}: ${nameOf(from)} → ${nameOf(to)}?\n\nThe board and Writing move to ${nameOf(to)}; past lessons stay in the old cabinet.`)) return
    run(() => api.changeTeacher(person.id, from, to), nameOf(to))
  }
  const remove = (teacherId) => {
    const rest = person.teachers.filter((t) => t.id !== teacherId)
    if (!window.confirm(`Remove ${nameOf(teacherId)} from ${person.name}?\n\nNothing is deleted: past lessons stay in the old cabinet.${rest.length ? ` The board and Writing go to ${rest.at(-1).name} if that cabinet has no board yet.` : ' The student keeps their board.'}`)) return
    run(() => api.unlinkStudent(teacherId, person.id), rest.at(-1)?.name)
  }
  const add = (teacherId) => run(() => api.linkStudent(teacherId, person.id))

  return (
    <div className="link-editor">
      {error && <div className="error">{error}</div>}
      {moved && <div className="notice">{moved}</div>}
      {!person.teachers?.length && <div className="muted">Not linked to a teacher.</div>}
      {person.teachers?.map((t) => (
        <div key={t.id} className="row-actions">
          <strong>{t.name}{t.id === user.id ? ' (me)' : ''}</strong>
          {others.length > 0 && (
            <select value="" onChange={(e) => change(t.id, e.target.value)} title="The board and Writing move to the new teacher">
              <option value="">Change to…</option>
              {others.map((o) => <option key={o.id} value={o.id}>{o.name}{o.id === user.id ? ' (me)' : ''}</option>)}
            </select>
          )}
          <button className="ghost" onClick={() => remove(t.id)}>Remove teacher</button>
        </div>
      ))}
      {others.length > 0 && (
        <div className="row-actions">
          <span className="muted">{person.teachers?.length ? 'Add another teacher:' : 'Link to a teacher:'}</span>
          {others.map((o) => (
            <button key={o.id} className="ghost" onClick={() => add(o.id)}>+ {o.name}{o.id === user.id ? ' (me)' : ''}</button>
          ))}
        </div>
      )}
      {past.length > 0 && (
        <div className="row-actions">
          <span className="muted">Past cabinets (history):</span>
          {past.map((c) => (
            <Link key={c.id} className="button-link" style={{ marginTop: 0 }} to={`/classroom/${c.id}`}>with {nameOf(c.teacherId)}</Link>
          ))}
        </div>
      )}
      <div className="muted">Changing a teacher moves the student's board and Writing to the new teacher; past lessons stay in the old cabinet. Nothing is deleted.</div>
    </div>
  )
}

// The same, as a panel in the student's cabinet (administrators only).
export default function StudentTeachers({ studentId, classroomId, teacherId, onMoved }) {
  const [person, setPerson] = useState(null)
  const [teachers, setTeachers] = useState([])
  const load = async () => {
    const [{ people }, { teachers }] = await Promise.all([api.listPeople(), api.listTeachers()])
    const found = people.find((p) => p.id === studentId) ?? null
    setPerson(found)
    setTeachers(teachers)
    return found
  }
  useEffect(() => { load().catch(() => setPerson(null)) }, [studentId])
  if (!person) return null
  const linked = person.teachers?.some((t) => t.id === teacherId)
  return (
    <Panel id={`room:teachers:${classroomId}`} title="Teachers" hint={person.teachers?.map((t) => t.name).join(', ') || 'none'}>
      {!linked && (
        <div className="notice" style={{ marginBottom: 8 }}>
          This cabinet is history: the student no longer studies with its teacher.
        </div>
      )}
      <TeacherEditor
        person={person}
        teachers={teachers}
        onChanged={async () => {
          const fresh = await load()
          // This cabinet's teacher is gone: go to the student's current one.
          if (fresh && !fresh.teachers?.some((t) => t.id === teacherId)) {
            const next = fresh.classrooms?.find((c) => fresh.teachers?.some((t) => t.id === c.teacherId))
            if (next && next.id !== classroomId) onMoved?.(next.id)
          }
        }}
      />
    </Panel>
  )
}
