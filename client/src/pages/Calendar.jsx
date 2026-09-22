import { useEffect, useState } from 'react'
import { api } from '../api'
import Nav from '../components/Nav'
import { SiteFooter } from '../components/Brand'
import Panel from '../components/Panel'

export default function Calendar() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    startTime: '',
    endTime: ''
  })
  const [editingId, setEditingId] = useState(null)

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
  }, [currentMonth])

  const handleAddEvent = async (e) => {
    e.preventDefault()
    if (!formData.title || !formData.startTime || !formData.endTime) {
      setError('Please fill in title and times')
      return
    }

    const startTime = new Date(formData.startTime)
    const endTime = new Date(formData.endTime)

    if (endTime <= startTime) {
      setError('End time must be after start time')
      return
    }

    try {
      if (editingId) {
        const { event } = await api.updateCalendarEvent(editingId, {
          ...formData,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString()
        })
        setEvents(events.map(e => e.id === editingId ? event : e))
        setEditingId(null)
      } else {
        const { event } = await api.createCalendarEvent({
          ...formData,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString()
        })
        setEvents([...events, event])
      }
      setFormData({ title: '', description: '', startTime: '', endTime: '' })
      setShowForm(false)
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDeleteEvent = async (id) => {
    try {
      await api.deleteCalendarEvent(id)
      setEvents(events.filter(e => e.id !== id))
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  const handleEditEvent = (event) => {
    const startDateTime = new Date(event.startTime).toISOString().slice(0, 16)
    const endDateTime = new Date(event.endTime).toISOString().slice(0, 16)
    setFormData({
      title: event.title,
      description: event.description || '',
      startTime: startDateTime,
      endTime: endDateTime
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
          <button onClick={() => { setShowForm(!showForm); setEditingId(null); setFormData({ title: '', description: '', startTime: '', endTime: '' }) }}>
            {showForm ? 'Cancel' : '+ Add event'}
          </button>
          <button className="ghost" onClick={nextMonth}>Next →</button>
        </div>

        {showForm && (
          <form onSubmit={handleAddEvent} style={{ marginBottom: 20, padding: 15, backgroundColor: '#f5f5f5', borderRadius: 8 }}>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', marginBottom: 5 }}>Title</label>
              <input
                type="text"
                placeholder="Event title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', marginBottom: 5 }}>Description (optional)</label>
              <textarea
                placeholder="Event description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                style={{ width: '100%', minHeight: 60 }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 5 }}>Start</label>
                <input
                  type="datetime-local"
                  value={formData.startTime}
                  onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 5 }}>End</label>
                <input
                  type="datetime-local"
                  value={formData.endTime}
                  onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                  style={{ width: '100%' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button type="submit">{editingId ? 'Update' : 'Create'} event</button>
              <button className="ghost" type="button" onClick={() => { setShowForm(false); setEditingId(null) }}>Cancel</button>
            </div>
          </form>
        )}
      </Panel>

      <Panel id="personal:calendar-events" title="Events" count={events.length} defaultOpen={events.length > 0}>
        {events.length === 0 ? (
          <p className="muted">No events this month. Add one to get started!</p>
        ) : (
          <div>
            {Object.entries(eventsByDate).sort().map(([date, dayEvents]) => (
              <div key={date} style={{ marginBottom: 20 }}>
                <strong style={{ fontSize: 16, marginBottom: 10, display: 'block' }}>
                  {new Date(date).toLocaleDateString('default', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                </strong>
                <div style={{ marginLeft: 15 }}>
                  {dayEvents.map(event => (
                    <div key={event.id} style={{ marginBottom: 15, paddingBottom: 15, borderBottom: '1px solid #e0e0e0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1 }}>
                          <strong>{event.title}</strong>
                          <div className="muted" style={{ fontSize: 14, marginTop: 5 }}>
                            {new Date(event.startTime).toLocaleTimeString('default', { hour: '2-digit', minute: '2-digit' })} – {new Date(event.endTime).toLocaleTimeString('default', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                          {event.description && (
                            <div style={{ fontSize: 14, marginTop: 8, color: '#666' }}>
                              {event.description}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 5 }}>
                          <button className="ghost" onClick={() => handleEditEvent(event)}>Edit</button>
                          <button className="ghost" onClick={() => handleDeleteEvent(event.id)}>Delete</button>
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

      <SiteFooter />
    </div>
  )
}
