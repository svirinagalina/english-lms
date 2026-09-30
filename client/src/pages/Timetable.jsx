import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../AuthContext'
import Nav from '../components/Nav'
import { SiteFooter } from '../components/Brand'
import Panel from '../components/Panel'

export default function Timetable() {
  const { user } = useAuth()
  const [lessons, setLessons] = useState([])
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState('week') // week or month
  const [currentDate, setCurrentDate] = useState(new Date())
  const navigate = useNavigate()
  const isStaff = user.role !== 'STUDENT'
  const [starting, setStarting] = useState(null) // the lesson whose call is being opened

  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    startTime: '',
    studentIds: [],
    recurrence: '',
    recurrenceEndDate: ''
  })
  const [showStudentPicker, setShowStudentPicker] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [eventToDelete, setEventToDelete] = useState(null)

  // Starts the lesson's call. One student: the call is theirs (it counts, and
  // "Join call" shows in their cabinet). Several: it goes on the board they
  // share, so every one of them gets "Join call".
  const startLesson = async (lesson) => {
    if (starting) return
    setStarting(lesson.id)
    setError('')
    try {
      const ids = (lesson.students ?? []).map((s) => s.id)
      const [{ classrooms }, { boards }] = await Promise.all([api.listClassrooms(), api.allBoards()])
      const mineFirst = (list) => [...list].sort((a, b) => (a.teacherId === user.id ? -1 : 0) - (b.teacherId === user.id ? -1 : 0))
      const rowsOf = (studentId) => mineFirst(boards.filter((b) => b.studentId === studentId))
      const shared = ids.length > 1
        ? rowsOf(ids[0]).find((row) => ids.every((sid) => boards.some((b) => b.id === row.id && b.studentId === sid)))
        : null
      const board = shared ?? (ids.length ? rowsOf(ids[0])[0] : null)
      const classroom = ids.length === 1
        ? [...classrooms].filter((c) => c.student?.id === ids[0]).sort((a, b) => (a.teacher?.id === user.id ? -1 : 0) - (b.teacher?.id === user.id ? -1 : 0))[0]
        : null
      const { call } = await api.createCall({
        ...(classroom ? { classroomId: classroom.id } : {}),
        ...(board ? { boardId: board.id } : {}),
        title: lesson.title
      })
      navigate(`/call/${call.token}${board ? `?board=${board.id}` : ''}`)
    } catch (err) {
      setError(err.message)
      setStarting(null)
    }
  }
  const namesOf = (lesson) => (lesson.students?.length ? lesson.students.map((s) => s.name).join(', ') : lesson.student?.name ?? '')

  const refresh = async () => {
    try {
      const start = new Date(currentDate)
      if (view === 'week') {
        start.setDate(start.getDate() - start.getDay())
      } else {
        start.setDate(1)
      }
      start.setHours(0, 0, 0, 0)

      const end = new Date(start)
      if (view === 'week') {
        end.setDate(end.getDate() + 7)
      } else {
        end.setMonth(end.getMonth() + 1)
      }
      end.setHours(23, 59, 59, 999)

      const { events } = await api.listCalendarEvents(start.toISOString(), end.toISOString())
      // For students, filter to show only lessons assigned to them
      // The server already gives a student only the lessons they're in.
      setLessons(events)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    if (isStaff) {
      api.listClassrooms().then(({ classrooms }) => {
        const uniqueStudents = [...new Map(classrooms.map(c => [c.student?.id, c.student])).values()].filter(Boolean)
        setStudents(uniqueStudents)
      }).catch(() => setStudents([]))
    }
  }, [currentDate, view])

  const closeForm = () => {
    setShowForm(false)
    setShowStudentPicker(false)
    setEditingId(null)
    setFormData({ startTime: '', studentIds: [], recurrence: '', recurrenceEndDate: '' })
  }

  const handleAddEvent = async (e) => {
    e.preventDefault()
    if (!formData.startTime) {
      setError('Please select a date and time')
      return
    }

    const startTime = new Date(formData.startTime)
    const title = formData.studentIds.length > 0
      ? `Lesson with ${formData.studentIds.map(id => students.find(s => s.id === id)?.name).filter(Boolean).join(', ')}`
      : 'Lesson'

    try {
      const body = {
        title,
        startTime: startTime.toISOString(),
        endTime: startTime.toISOString(),
        studentIds: formData.studentIds,
        recurrence: formData.recurrence || null,
        recurrenceEndDate: formData.recurrenceEndDate ? new Date(formData.recurrenceEndDate).toISOString() : null
      }
      if (editingId) await api.updateCalendarEvent(editingId, body)
      else await api.createCalendarEvent(body)
      closeForm()
      setError('')
      await refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  // A lesson booked on Advent is cancelled there too: Advent tells the
  // student. Editing or plain deleting it here would leave Advent out of step.
  const cancelAdvent = async (lesson) => {
    const reason = window.prompt('Отменить урок? Advent сообщит ученику.\nПричина:')
    if (reason === null) return
    if (!reason.trim()) { setError('Write the reason for cancelling'); return }
    try {
      await api.cancelAdventLesson(lesson.advent.id, reason.trim())
      setError('')
      await refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDeleteEvent = (lesson) => {
    setEventToDelete(lesson)
    if (lesson.recurrence) setDeleteConfirm(true)
    else confirmDelete(lesson.id, false)
  }

  const confirmDelete = async (id, deleteAll) => {
    try {
      await api.deleteCalendarEvent(id, deleteAll)
      setError('')
      setDeleteConfirm(false)
      setEventToDelete(null)
      await refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleEditEvent = (lesson) => {
    const startDateTime = new Date(lesson.startTime).toISOString().slice(0, 16)
    const recurrenceEndDate = lesson.recurrenceEndDate ? new Date(lesson.recurrenceEndDate).toISOString().slice(0, 10) : ''
    setFormData({
      startTime: startDateTime,
      studentIds: lesson.studentIds || [],
      recurrence: lesson.recurrence || '',
      recurrenceEndDate
    })
    setEditingId(lesson.id)
    setShowForm(true)
  }

  const editDeleteButtons = (lesson, small) => isStaff && (lesson.advent ? (
    <div style={{ display: 'flex', gap: small ? 4 : 6, marginTop: small ? 4 : 6 }}>
      <button type="button" className="timetable-edit" style={small ? { fontSize: 10 } : undefined} onClick={() => cancelAdvent(lesson)}
        title="Cancel this lesson here and on Advent; the student is told">
        Cancel lesson
      </button>
    </div>
  ) : (
    <div style={{ display: 'flex', gap: small ? 4 : 6, marginTop: small ? 4 : 6 }}>
      <button
        type="button"
        className="timetable-edit"
        style={small ? { fontSize: 10 } : undefined}
        onClick={() => handleEditEvent(lesson)}
      >
        Edit
      </button>
      <button
        type="button"
        className="timetable-edit"
        style={small ? { fontSize: 10 } : undefined}
        onClick={() => handleDeleteEvent(lesson)}
      >
        Delete
      </button>
    </div>
  ))

  const startButton = (lesson, small) => isStaff && (
    <button
      type="button"
      className="timetable-start"
      style={small ? { marginTop: 6, fontSize: 11, padding: '4px 8px' } : undefined}
      onClick={() => startLesson(lesson)}
      disabled={Boolean(starting)}
      title="Start this lesson's call now"
    >
      {starting === lesson.id ? 'Starting…' : 'Start lesson'}
    </button>
  )

  if (loading) return <div className="centered">Loading…</div>

  const isWeekView = view === 'week'
  const start = new Date(currentDate)
  if (isWeekView) {
    start.setDate(start.getDate() - start.getDay())
  } else {
    start.setDate(1)
  }

  const end = new Date(start)
  if (isWeekView) {
    end.setDate(end.getDate() + 6)
  } else {
    end.setMonth(end.getMonth() + 1)
    end.setDate(0)
  }

  const formatDateRange = () => {
    if (isWeekView) {
      return `${start.toLocaleDateString()} – ${end.toLocaleDateString()}`
    } else {
      return start.toLocaleString('default', { month: 'long', year: 'numeric' })
    }
  }

  const daysInView = []
  let current = new Date(start)
  while (current <= end) {
    daysInView.push(new Date(current))
    current.setDate(current.getDate() + 1)
  }

  const prevPeriod = () => {
    const newDate = new Date(currentDate)
    if (isWeekView) {
      newDate.setDate(newDate.getDate() - 7)
    } else {
      newDate.setMonth(newDate.getMonth() - 1)
    }
    setCurrentDate(newDate)
  }

  const nextPeriod = () => {
    const newDate = new Date(currentDate)
    if (isWeekView) {
      newDate.setDate(newDate.getDate() + 7)
    } else {
      newDate.setMonth(newDate.getMonth() + 1)
    }
    setCurrentDate(newDate)
  }

  const today = () => {
    setCurrentDate(new Date())
  }

  const getLessonsForDay = (date) => {
    return lessons.filter(lesson => {
      const lessonDate = new Date(lesson.startTime)
      return lessonDate.toDateString() === date.toDateString()
    })
  }

  return (
    <div className="page">
      <Nav title={user.role === 'STUDENT' ? 'My Schedule' : 'Timetable'} />

      {error && <div className="error">{error}</div>}

      <Panel id="timetable:header" title={formatDateRange()} defaultOpen>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 10, flexWrap: 'wrap' }}>
          <button className="ghost" onClick={prevPeriod}>← Previous</button>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              className={`ghost ${view === 'week' ? '' : ''}`}
              onClick={() => setView('week')}
              style={view === 'week' ? { background: 'var(--accent)', color: 'var(--accent-ink)' } : undefined}
            >
              Week
            </button>
            <button
              className={`ghost ${view === 'month' ? '' : ''}`}
              onClick={() => setView('month')}
              style={view === 'month' ? { background: 'var(--accent)', color: 'var(--accent-ink)' } : undefined}
            >
              Month
            </button>
            <button className="ghost" onClick={today}>Today</button>
            {isStaff && (
              <button onClick={() => (showForm ? closeForm() : setShowForm(true))}>
                {showForm ? 'Cancel' : '+ Add lesson'}
              </button>
            )}
          </div>

          <button className="ghost" onClick={nextPeriod}>Next →</button>
        </div>

        {showForm && (
          <form onSubmit={handleAddEvent} style={{ marginBottom: 20, padding: 15, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 15, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <label style={{ display: 'block', marginBottom: 5, fontWeight: 600, color: 'var(--text)' }}>Plan a lesson</label>
                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
                    onClick={() => setShowStudentPicker(!showStudentPicker)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      background: '#0f3731',
                      color: 'var(--text)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: 14
                    }}
                  >
                    {formData.studentIds.length === 0
                      ? '+ Select students'
                      : `${formData.studentIds.length} student${formData.studentIds.length !== 1 ? 's' : ''} selected`}
                  </button>
                  {showStudentPicker && (
                    // In the flow, not floating: it used to cover the Create button.
                    <div style={{
                      background: '#0f3731',
                      color: 'var(--text)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      marginTop: 4,
                      maxHeight: 260,
                      overflowY: 'auto'
                    }}>
                      {students.map(student => (
                        <label key={student.id} style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '8px 12px',
                          cursor: 'pointer',
                          borderBottom: '1px solid var(--border)'
                        }}>
                          <input
                            type="checkbox"
                            checked={formData.studentIds.includes(student.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormData({ ...formData, studentIds: [...formData.studentIds, student.id] })
                              } else {
                                setFormData({ ...formData, studentIds: formData.studentIds.filter(id => id !== student.id) })
                              }
                            }}
                            style={{ marginRight: 8 }}
                          />
                          <span style={{ fontSize: 14, color: 'var(--text)' }}>{student.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ flex: 1, minWidth: 180 }}>
                <label style={{ display: 'block', marginBottom: 5, fontWeight: 600, color: 'var(--text)' }}>When</label>
                <input
                  type="datetime-local"
                  value={formData.startTime}
                  onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                  style={{ width: '100%' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 5 }}>Repeat</label>
                <select
                  value={formData.recurrence}
                  onChange={(e) => setFormData({ ...formData, recurrence: e.target.value })}
                  style={{ width: '100%' }}
                >
                  <option value="">No repeat</option>
                  <option value="WEEKLY">Weekly</option>
                </select>
              </div>
              {formData.recurrence === 'WEEKLY' && (
                <div>
                  <label style={{ display: 'block', marginBottom: 5 }}>Repeat until</label>
                  <input
                    type="date"
                    value={formData.recurrenceEndDate}
                    onChange={(e) => setFormData({ ...formData, recurrenceEndDate: e.target.value })}
                    style={{ width: '100%' }}
                  />
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button type="submit">{editingId ? 'Update' : 'Create'} lesson</button>
              <button className="ghost" type="button" onClick={closeForm}>Cancel</button>
            </div>
          </form>
        )}

        {isWeekView ? (
          // Week view - calendar grid. On a narrow screen 7 equal columns
          // squeeze past reading width, so `.week-grid` switches this to a
          // horizontally-scrollable row of fixed-width columns instead
          // (see the phone media query in styles.css) rather than clipping
          // Thursday–Saturday with no way to reach them.
          <div className="week-grid" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: 8,
            marginBottom: 20
          }}>
            {daysInView.map(day => {
              const dayLessons = getLessonsForDay(day)
              const isToday = day.toDateString() === new Date().toDateString()
              return (
                <div
                  key={day.toDateString()}
                  className="week-day"
                  style={{
                    background: isToday ? '#f4b9d9' : '#ffd5ed',
                    border: isToday ? '2px solid #14453f' : '1px solid rgba(20, 69, 63, 0.15)',
                    color: '#14453f',
                    borderRadius: 8,
                    padding: 12,
                    minHeight: 150
                  }}
                >
                  <div style={{ fontWeight: 700, color: '#14453f', marginBottom: 8, fontSize: 14 }}>
                    {day.toLocaleDateString('default', { weekday: 'short', day: 'numeric' })}
                  </div>
                  <div>
                    {dayLessons.length === 0 ? (
                      <div style={{ fontSize: 12, color: 'rgba(20, 69, 63, 0.55)', fontStyle: 'italic' }}>No lessons</div>
                    ) : (
                      dayLessons.map(lesson => (
                        <div
                          key={lesson.id}
                          style={{
                            background: 'rgba(255, 255, 255, 0.7)',
                            padding: 6,
                            borderRadius: 6,
                            fontSize: 12,
                            marginBottom: 6,
                            borderLeft: '3px solid #14453f'
                          }}
                        >
                          <div style={{ fontWeight: 600, color: '#14453f' }}>
                            {new Date(lesson.startTime).toLocaleTimeString('default', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                          <div style={{ fontSize: 11, color: '#14453f' }}>{lesson.title}</div>
                          {namesOf(lesson) && !lesson.title.includes(namesOf(lesson)) && (
                            <div style={{ fontSize: 11, color: 'rgba(20, 69, 63, 0.75)', marginTop: 2 }}>👤 {namesOf(lesson)}</div>
                          )}
                          {/* A trial booked on Advent: the steps before it, in short (full text in the day list). */}
                          {/Пробный урок/.test(lesson.title) && /Advent/.test(lesson.title) && (
                            <div style={{ fontSize: 10, color: '#9d174d', marginTop: 4, lineHeight: 1.3 }}>Доска → Assign ученику → кнопка Trial lesson</div>
                          )}
                          {startButton(lesson, true)}
                          {editDeleteButtons(lesson, true)}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          // Month view - list
          <div style={{ maxHeight: 600, overflowY: 'auto' }}>
            {daysInView.length === 0 ? (
              <p className="muted">No lessons this month</p>
            ) : (
              daysInView.map(day => {
                const dayLessons = getLessonsForDay(day)
                if (dayLessons.length === 0) return null
                return (
                  <div key={day.toDateString()} style={{ marginBottom: 20 }}>
                    <strong style={{ fontSize: 15, color: 'var(--text)', display: 'block', marginBottom: 10 }}>
                      {day.toLocaleDateString('default', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </strong>
                    <div style={{ marginLeft: 15 }}>
                      {dayLessons.map(lesson => (
                        <div
                          key={lesson.id}
                          style={{
                            background: '#ffd5ed',
                            color: '#14453f',
                            padding: 12,
                            borderRadius: 8,
                            marginBottom: 8
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                              <div style={{ fontWeight: 700, color: '#14453f', minWidth: 50 }}>
                                {new Date(lesson.startTime).toLocaleTimeString('default', { hour: '2-digit', minute: '2-digit' })}
                              </div>
                              <div>
                                <strong style={{ color: '#14453f' }}>{lesson.title}</strong>
                                {lesson.recurrence === 'WEEKLY' && (
                                  <span style={{ fontSize: 12, marginLeft: 8, color: 'rgba(20, 69, 63, 0.75)' }}>(Weekly)</span>
                                )}
                                {namesOf(lesson) && !lesson.title.includes(namesOf(lesson)) && (
                                  <div style={{ fontSize: 13, color: 'rgba(20, 69, 63, 0.75)', marginTop: 4 }}>
                                    👤 {namesOf(lesson)}
                                  </div>
                                )}
                                {lesson.description && (
                                  <div style={{ fontSize: 13, color: '#14453f', marginTop: 6, whiteSpace: 'pre-line', lineHeight: 1.4 }}>{lesson.description}</div>
                                )}
                                {startButton(lesson)}
                              </div>
                            </div>
                            {editDeleteButtons(lesson)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}
      </Panel>

      {deleteConfirm && eventToDelete && eventToDelete.recurrence === 'WEEKLY' && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#0f3731', color: 'var(--text)', border: '1px solid var(--border)', padding: 30, borderRadius: 12, maxWidth: 400, boxShadow: '0 10px 30px rgba(0,0,0,0.4)' }}>
            <h3 style={{ marginTop: 0 }}>Delete recurring lesson</h3>
            <p>This lesson repeats weekly. What would you like to delete?</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="ghost" onClick={() => { setDeleteConfirm(false); setEventToDelete(null) }}>Cancel</button>
              <button onClick={() => confirmDelete(eventToDelete.id, false)} style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}>This lesson only</button>
              <button onClick={() => confirmDelete(eventToDelete.id, true)} style={{ backgroundColor: '#ff6b6b', color: 'white' }}>All lessons in series</button>
            </div>
          </div>
        </div>
      )}

      <SiteFooter />
    </div>
  )
}
