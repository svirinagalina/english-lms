import { useEffect, useState } from 'react'
import { api } from '../api'
import Nav from '../components/Nav'
import { SiteFooter } from '../components/Brand'
import Panel from '../components/Panel'

export default function Todo() {
  const [todos, setTodos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [newDueDate, setNewDueDate] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editData, setEditData] = useState({})

  const refresh = async () => {
    try {
      const { todos } = await api.listTodos()
      setTodos(todos)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const addTodo = async (e) => {
    e.preventDefault()
    if (!newTitle.trim()) return
    try {
      const { todo } = await api.createTodo({
        title: newTitle,
        dueDate: newDueDate ? new Date(newDueDate).toISOString() : null
      })
      setTodos([...todos, todo])
      setNewTitle('')
      setNewDueDate('')
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  const toggleComplete = async (todo) => {
    try {
      const { todo: updated } = await api.updateTodo(todo.id, {
        ...todo,
        completed: !todo.completed
      })
      setTodos(todos.map(t => t.id === todo.id ? updated : t))
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  const startEdit = (todo) => {
    setEditingId(todo.id)
    setEditData({ ...todo })
  }

  const saveEdit = async () => {
    if (!editData.title.trim()) return
    try {
      const { todo: updated } = await api.updateTodo(editingId, editData)
      setTodos(todos.map(t => t.id === editingId ? updated : t))
      setEditingId(null)
      setEditData({})
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  const deleteTodo = async (id) => {
    try {
      await api.deleteTodo(id)
      setTodos(todos.filter(t => t.id !== id))
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  const clearCompleted = async () => {
    const done = todos.filter(t => t.completed)
    if (!done.length || !window.confirm(`Delete all ${done.length} completed tasks?`)) return
    const results = await Promise.allSettled(done.map(t => api.deleteTodo(t.id)))
    const deleted = new Set(done.filter((_, i) => results[i].status === 'fulfilled').map(t => t.id))
    setTodos(todos.filter(t => !deleted.has(t.id)))
    setError(deleted.size < done.length ? 'Some completed tasks could not be deleted — try again' : '')
  }

  if (loading) return <div className="centered">Loading…</div>

  const activeTodos = todos.filter(t => !t.completed)
  const completedTodos = todos.filter(t => t.completed)

  return (
    <div className="page">
      <Nav title="Todo" />

      {error && <div className="error">{error}</div>}

      <Panel id="personal:todo-form" title="Add a new todo" defaultOpen>
        <form onSubmit={addTodo} style={{ display: 'flex', gap: 10, marginBottom: 15 }}>
          <input
            type="text"
            placeholder="What needs to be done?"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            style={{ flex: 1 }}
          />
          <input
            type="date"
            value={newDueDate}
            onChange={(e) => setNewDueDate(e.target.value)}
          />
          <button type="submit">Add</button>
        </form>
      </Panel>

      {activeTodos.length > 0 && (
        <Panel id="personal:active-todos" title="Active tasks" count={activeTodos.length} defaultOpen>
          <div className="list">
            {activeTodos.map(todo => (
              <div key={todo.id} className="row" style={{ alignItems: 'flex-start', paddingBottom: 15, borderBottom: '1px solid #e0e0e0' }}>
                {editingId === todo.id ? (
                  <div style={{ flex: 1 }}>
                    <input
                      autoFocus
                      type="text"
                      value={editData.title}
                      onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                      style={{ width: '100%', marginBottom: 10 }}
                    />
                    <input
                      type="date"
                      value={editData.dueDate ? new Date(editData.dueDate).toISOString().split('T')[0] : ''}
                      onChange={(e) => setEditData({ ...editData, dueDate: e.target.value ? new Date(e.target.value).toISOString() : null })}
                      style={{ width: '100%', marginBottom: 10 }}
                    />
                    <textarea
                      placeholder="Notes (optional)"
                      value={editData.notes || ''}
                      onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                      style={{ width: '100%', marginBottom: 10, minHeight: 60 }}
                    />
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button onClick={saveEdit}>Save</button>
                      <button className="ghost" onClick={() => setEditingId(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <input
                      type="checkbox"
                      checked={todo.completed}
                      onChange={() => toggleComplete(todo)}
                      style={{ marginRight: 10, marginTop: 5, cursor: 'pointer' }}
                    />
                    <div style={{ flex: 1 }}>
                      <strong>{todo.title}</strong>
                      {todo.dueDate && (
                        <div className="muted" style={{ fontSize: 14, marginTop: 5 }}>
                          Due: {new Date(todo.dueDate).toLocaleDateString()}
                        </div>
                      )}
                      {todo.notes && (
                        <div style={{ fontSize: 14, marginTop: 5, color: '#666' }}>
                          {todo.notes}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 5 }}>
                      <button className="ghost" onClick={() => startEdit(todo)}>Edit</button>
                      <button className="ghost" onClick={() => deleteTodo(todo.id)}>Delete</button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </Panel>
      )}

      {completedTodos.length > 0 && (
        <Panel id="personal:completed-todos" title="Completed" count={completedTodos.length}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
            <button className="ghost" onClick={clearCompleted}>Clear all</button>
          </div>
          <div className="list">
            {completedTodos.map(todo => (
              <div key={todo.id} className="row" style={{ alignItems: 'center', opacity: 0.6 }}>
                <input
                  type="checkbox"
                  checked={true}
                  onChange={() => toggleComplete(todo)}
                  style={{ marginRight: 10, cursor: 'pointer' }}
                />
                <div style={{ flex: 1 }}>
                  <del>{todo.title}</del>
                </div>
                <button className="ghost" onClick={() => deleteTodo(todo.id)}>Delete</button>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {todos.length === 0 && (
        <Panel id="personal:empty" title="No tasks yet" defaultOpen>
          <p className="muted">Add your first task above to get started.</p>
        </Panel>
      )}

      <SiteFooter />
    </div>
  )
}
