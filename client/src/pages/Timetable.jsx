import { useEffect, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../AuthContext'
import Nav from '../components/Nav'
import { SiteFooter } from '../components/Brand'
import Panel from '../components/Panel'

export default function Timetable() {
  const { user } = useAuth()
  const [lessons, setLessons] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState('week') // week or month
  const [currentDate, setCurrentDate] = useState(new Date())

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
      const filtered = user.role === 'STUDENT'
        ? events.filter(e => e.studentId === user.id)
        : events
      setLessons(filtered)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [currentDate, view])

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

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className={`ghost ${view === 'week' ? '' : ''}`}
              onClick={() => setView('week')}
              style={{ background: view === 'week' ? '#2d5a4e' : '#f0f0f0', color: view === 'week' ? 'white' : '#333' }}
            >
              Week
            </button>
            <button
              className={`ghost ${view === 'month' ? '' : ''}`}
              onClick={() => setView('month')}
              style={{ background: view === 'month' ? '#2d5a4e' : '#f0f0f0', color: view === 'month' ? 'white' : '#333' }}
            >
              Month
            </button>
            <button className="ghost" onClick={today}>Today</button>
          </div>

          <button className="ghost" onClick={nextPeriod}>Next →</button>
        </div>

        {isWeekView ? (
          // Week view - calendar grid
          <div style={{
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
                  style={{
                    background: isToday ? '#e8f4f0' : 'white',
                    border: isToday ? '2px solid #2d5a4e' : '1px solid #e0e0e0',
                    borderRadius: 8,
                    padding: 12,
                    minHeight: 150
                  }}
                >
                  <div style={{ fontWeight: 600, color: '#2d5a4e', marginBottom: 8, fontSize: 14 }}>
                    {day.toLocaleDateString('default', { weekday: 'short', day: 'numeric' })}
                  </div>
                  <div>
                    {dayLessons.length === 0 ? (
                      <div style={{ fontSize: 12, color: '#aaa', fontStyle: 'italic' }}>No lessons</div>
                    ) : (
                      dayLessons.map(lesson => (
                        <div
                          key={lesson.id}
                          style={{
                            background: '#f9f9f9',
                            padding: 6,
                            borderRadius: 4,
                            fontSize: 12,
                            marginBottom: 6,
                            borderLeft: '3px solid #2d5a4e'
                          }}
                        >
                          <div style={{ fontWeight: 500, color: '#2d5a4e' }}>
                            {new Date(lesson.startTime).toLocaleTimeString('default', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                          <div style={{ fontSize: 11, color: '#666' }}>{lesson.title}</div>
                          {lesson.student && (
                            <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>👤 {lesson.student.name}</div>
                          )}
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
                    <strong style={{ fontSize: 15, color: '#2d5a4e', display: 'block', marginBottom: 10 }}>
                      {day.toLocaleDateString('default', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </strong>
                    <div style={{ marginLeft: 15 }}>
                      {dayLessons.map(lesson => (
                        <div
                          key={lesson.id}
                          style={{
                            background: 'white',
                            border: '1px solid #e0e0e0',
                            padding: 12,
                            borderRadius: 6,
                            marginBottom: 8
                          }}
                        >
                          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                            <div style={{ fontWeight: 600, color: '#2d5a4e', minWidth: 50 }}>
                              {new Date(lesson.startTime).toLocaleTimeString('default', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                            <div>
                              <strong style={{ color: '#2d5a4e' }}>{lesson.title}</strong>
                              {lesson.student && (
                                <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>
                                  👤 {lesson.student.name}
                                </div>
                              )}
                            </div>
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

      <SiteFooter />
    </div>
  )
}
