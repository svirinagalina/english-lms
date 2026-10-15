import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'
import Nav from '../components/Nav'
import Panel from '../components/Panel'

const monthKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
const monthLabel = (key) => {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}
const shiftMonth = (key, delta) => {
  const [y, m] = key.split('-').map(Number)
  return monthKey(new Date(y, m - 1 + delta, 1))
}
const hours = (minutes) => {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`
}
const time = (value) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const day = (value) => new Date(value).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })

// One teacher's lessons for the administrator: how many, with whom, on
// which dates, and the board each lesson was written on.
export default function TeacherLessons() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [month, setMonth] = useState(() => monthKey(new Date()))
  const [allTime, setAllTime] = useState(false)

  useEffect(() => {
    api.teacherLessons(id).then(setData).catch((err) => setError(err.message))
  }, [id])

  const lessons = useMemo(
    () => (data?.lessons ?? []).filter((l) => allTime || monthKey(new Date(l.startedAt)) === month),
    [data, month, allTime]
  )

  // Per student: counted lessons, time, the latest date.
  const byStudent = useMemo(() => {
    const map = new Map()
    for (const lesson of lessons) {
      const entry = map.get(lesson.student.id) ?? { ...lesson.student, classroomId: lesson.classroomId, counted: 0, other: 0, minutes: 0, last: lesson.startedAt }
      if (lesson.counted) { entry.counted += 1; entry.minutes += lesson.minutes } else entry.other += 1
      if (lesson.startedAt > entry.last) entry.last = lesson.startedAt
      map.set(lesson.student.id, entry)
    }
    return [...map.values()].sort((a, b) => b.counted - a.counted || a.name.localeCompare(b.name))
  }, [lessons])

  const byDay = useMemo(() => {
    const groups = []
    for (const lesson of lessons) {
      const label = day(lesson.startedAt)
      const last = groups[groups.length - 1]
      if (last?.label === label) last.lessons.push(lesson)
      else groups.push({ label, lessons: [lesson] })
    }
    return groups
  }, [lessons])

  if (error) return <div className="page"><Nav title="People" back="/people" /><div className="error">{error}</div></div>
  if (!data) return <div className="centered">Loading…</div>

  // A group lesson comes as one row per student of the group: the teacher
  // taught it once.
  const seenGroup = new Set()
  const counted = lessons.filter((l) => l.counted && (!l.groupId || (!seenGroup.has(l.groupId) && seenGroup.add(l.groupId))))
  const totalMinutes = counted.reduce((sum, l) => sum + l.minutes, 0)
  const notCounted = lessons.length - counted.length

  return (
    <div className="page">
      <Nav title={data.teacher.name} back="/people" />

      <div className="row" style={{ marginBottom: 16 }}>
        <div>
          <strong>{counted.length} {counted.length === 1 ? 'lesson' : 'lessons'}</strong>
          {counted.length > 0 && <span className="muted"> · {hours(totalMinutes)}</span>}
          {notCounted > 0 && <span className="muted"> · {notCounted} not counted (trial or excluded)</span>}
          <div className="muted">{allTime ? 'All time' : monthLabel(month)} · {data.teacher.email}</div>
        </div>
        <div className="row-actions">
          <button className="ghost" onClick={() => { setAllTime(false); setMonth(shiftMonth(month, -1)) }} title="Previous month" aria-label="Previous month">‹</button>
          <button className={allTime ? 'ghost' : ''} onClick={() => setAllTime(false)}>{monthLabel(month)}</button>
          <button className="ghost" onClick={() => { setAllTime(false); setMonth(shiftMonth(month, 1)) }} title="Next month" aria-label="Next month">›</button>
          <button className={allTime ? '' : 'ghost'} onClick={() => setAllTime(true)}>All time</button>
        </div>
      </div>

      <Panel id="teacher:students" title="By student" count={byStudent.length} defaultOpen>
        {byStudent.length === 0 && <p className="muted">No lessons in this period.</p>}
        <div className="list">
          {byStudent.map((s) => (
            <div key={s.id} className="row">
              <div>
                <Link to={`/classroom/${s.classroomId}`}><strong>{s.name}</strong></Link>
                <div className="muted">
                  {s.counted} {s.counted === 1 ? 'lesson' : 'lessons'}{s.counted > 0 && ` · ${hours(s.minutes)}`}
                  {s.other > 0 && ` · ${s.other} not counted`} · last {new Date(s.last).toLocaleDateString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel id="teacher:lessons" title="Lessons" count={lessons.length} defaultOpen>
        {byDay.length === 0 && <p className="muted">No lessons in this period.</p>}
        {byDay.map((group) => (
          <div key={group.label} style={{ marginBottom: 14 }}>
            <div className="muted" style={{ fontWeight: 600, margin: '4px 0 8px' }}>{group.label}</div>
            <div className="list">
              {group.lessons.map((lesson) => (
                <div key={lesson.id} className="row">
                  <div>
                    <strong>{lesson.student.name}</strong>
                    <div className="muted">
                      {time(lesson.startedAt)}–{lesson.endedAt ? time(lesson.endedAt) : '…'} · {hours(lesson.minutes)}
                      {lesson.groupSize > 1 && ` · группа, ${lesson.groupSize} уч.`}
                      {!lesson.counted && ' · not counted'}
                      {lesson.note && ` · ${lesson.note}`}
                    </div>
                  </div>
                  <div className="row-actions" style={{ flexWrap: 'wrap' }}>
                    {lesson.boards.length === 0 && <span className="muted">No board in this lesson</span>}
                    {lesson.boards.map((board) => (
                      <Link
                        key={board.id}
                        className="button-link"
                        style={{ marginTop: 0 }}
                        to={`/classroom/${board.classroomId}?board=${board.id}${board.focus ? `&focus=${board.focus}` : ''}`}
                        title={board.added ? `${board.added} ${board.added === 1 ? 'item' : 'items'} added during this lesson` : 'Open in the lesson; nothing new was added to it'}
                      >
                        Board: {board.title}{!board.added && ' (nothing added)'}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </Panel>
    </div>
  )
}
