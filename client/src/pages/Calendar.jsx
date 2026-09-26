import { useEffect, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../AuthContext'
import Nav from '../components/Nav'
import { SiteFooter } from '../components/Brand'
import Panel from '../components/Panel'

export default function Calendar() {
  const { user } = useAuth()
  const [events, setEvents] = useState([])
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [currentMonth, setCurrentMonth] = useState(new Date())
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

  const refresh = async () => {
    try {
      const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).toISOString()
      const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0, 23, 59, 59).toISOString()
      const { events: data } = await api.listCalendarEvents(monthStart, monthEnd)
      setEvents(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    if (user.role !== 'STUDENT') {
      api.listClassrooms().then(({ classrooms }) => {
        const uniqueStudents = [...new Map(classrooms.map(c => [c.student?.id, c.student])).values()].filter(Boolean)
        setStudents(uniqueStudents)
      }).catch(() => setStudents([]))
    }
  }, [currentMonth])

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
      if (editingId) {
        const { event } = await api.updateCalendarEvent(editingId, {
          title,
          startTime: startTime.toISOString(),
          endTime: startTime.toISOString(),
          studentIds: formData.studentIds,
          recurrence: formData.recurrence || null,
          recurrenceEndDate: formData.recurrenceEndDate ? new Date(formData.recurrenceEndDate).toISOString() : null
        })
        setEvents(events.map(e => e.id === editingId ? event : e))
        setEditingId(null)
      } else {
        const { event } = await api.createCalendarEvent({
          title,
          startTime: startTime.toISOString(),
          endTime: startTime.toISOString(),
          studentIds: formData.studentIds,
          recurrence: formData.recurrence || null,
          recurrenceEndDate: formData.recurrenceEndDate ? new Date(formData.recurrenceEndDate).toISOString() : null
        })
        setEvents([...events, event])
      }
      setFormData({ startTime: '', studentIds: [], recurrence: '', recurrenceEndDate: '' })
      setShowForm(false)
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDeleteEvent = (event) => {
    setEventToDelete(event)
    if (event.recurrence) {
      setDeleteConfirm(true)
    } else {
      confirmDelete(event.id, false)
    }
  }

  const confirmDelete = async (id, deleteAll) => {
    try {
      await api.deleteCalendarEvent(id, deleteAll)
      setEvents(events.filter(e => e.id !== id))
      setError('')
      setDeleteConfirm(false)
      setEventToDelete(null)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleEditEvent = (event) => {
    const startDateTime = new Date(event.startTime).toISOString().slice(0, 16)
    const recurrenceEndDate = event.recurrenceEndDate ? new Date(event.recurrenceEndDate).toISOString().slice(0, 10) : ''
    setFormData({
      startTime: startDateTime,
      studentIds: event.studentIds || [],
      recurrence: event.recurrence || '',
      recurrenceEndDate
    })
    setEditingId(event.id)
    setShowForm(true)
  }

  if (loading) return <div className="centered">Loading…</div>

  const monthName = currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))
  }

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))
  }

  // Group events by date
  const eventsByDate = {}
  events.forEach(event => {
    const date = new Date(event.startTime).toDateString()
    if (!eventsByDate[date]) eventsByDate[date] = []
    eventsByDate[date].push(event)
  })

  return (
    <div className="page">
      <Nav title="Calendar" />

      {error && <div className="error">{error}</div>}

      <Panel id="personal:calendar-header" title={monthName} defaultOpen>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <button className="ghost" onClick={prevMonth}>← Previous</button>
          <button onClick={() => { setShowForm(!showForm); setEditingId(null); setFormData({ startTime: '', studentIds: [], recurrence: '', recurrenceEndDate: '' }) }}>
            {showForm ? 'Cancel' : '+ Add lesson'}
          </button>
          <button className="ghost" onClick={nextMonth}>Next →</button>
        </div>

        {showForm && (
          <form onSubmit={handleAddEvent} style={{ marginBottom: 20, padding: 15, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 15 }}>
              <div style={{ flex: 1 }}>
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

              <div style={{ flex: 1 }}>
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
              <button className="ghost" type="button" onClick={() => { setShowForm(false); setEditingId(null) }}>Cancel</button>
            </div>
          </form>
        )}
      </Panel>

      <Panel id="personal:calendar-events" title="Lessons" count={events.length} defaultOpen={events.length > 0}>
        {events.length === 0 ? (
          <p className="muted">No lessons this month. Add one to get started!</p>
        ) : (
          <div>
            {Object.entries(eventsByDate).sort().map(([date, dayEvents]) => (
              <div key={date} style={{ marginBottom: 20 }}>
                <strong style={{ fontSize: 16, marginBottom: 10, display: 'block' }}>
                  {new Date(date).toLocaleDateString('default', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                </strong>
                <div style={{ marginLeft: 15 }}>
                  {dayEvents.map(event => (
                    <div key={event.id} style={{ marginBottom: 15, paddingBottom: 15, borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1 }}>
                          <strong>{event.title}</strong>
                          {event.recurrence === 'WEEKLY' && (
                            <span style={{ fontSize: 12, marginLeft: 8, color: 'var(--muted)' }}>(Weekly)</span>
                          )}
                          <div className="muted" style={{ fontSize: 14, marginTop: 5 }}>
                            {new Date(event.startTime).toLocaleTimeString('default', { hour: '2-digit', minute: '2-digit' })}
                            {event.students && event.students.length > 0 && ` • ${event.students.map(s => s.name).join(', ')}`}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 5 }}>
                          <button className="ghost" onClick={() => handleEditEvent(event)}>Edit</button>
                          <button className="ghost" onClick={() => handleDeleteEvent(event)}>Delete</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
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
