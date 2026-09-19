import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'

// The notebook: every mistake noted in lessons, newest lesson first, with
// the topics they add up to. Teachers can fix or drop an entry.
export default function MistakeNotebook({ classroomId, canEdit = false, boardLink = null, student = false }) {
  const [mistakes, setMistakes] = useState(null)
  const [editing, setEditing] = useState(null) // { id, said, correct }

  const refresh = () => api.listMistakes(classroomId).then(({ mistakes }) => setMistakes(mistakes)).catch(() => setMistakes([]))
  useEffect(() => { refresh() }, [classroomId])

  if (!mistakes) return null

  // Topic totals, most frequent first.
  const topics = new Map()
  for (const m of mistakes) for (const label of m.labels) topics.set(label, (topics.get(label) ?? 0) + 1)
  const topTopics = [...topics.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)

  // Grouped by day (a lesson is a day, near enough).
  const byDay = new Map()
  for (const m of mistakes) {
    const day = new Date(m.createdAt).toLocaleDateString()
    if (!byDay.has(day)) byDay.set(day, [])
    byDay.get(day).push(m)
  }

  const save = async () => {
    try {
      await api.updateMistake(editing.id, { said: editing.said, correct: editing.correct })
      setEditing(null)
      await refresh()
    } catch (err) {
      alert(err.message)
    }
  }
  const remove = async (m) => {
    if (!window.confirm('Remove this entry from the notebook?')) return
    await api.deleteMistake(m.id)
    await refresh()
  }

  return (
    <section>
      <h2>Mistake notebook</h2>
      {mistakes.length === 0 ? (
        <p className="muted">
          {student
            ? 'Mistakes your teacher notes during lessons appear here, with the correct version — and you can drill them in Practice.'
            : 'Nothing noted yet. On the board, use the Mistake tool (X): what the student said, and how it should be.'}
        </p>
      ) : (
        <>
          <p className="muted" style={{ marginBottom: 8 }}>
            {mistakes.length} {mistakes.length === 1 ? 'entry' : 'entries'}
            {topTopics.length > 0 && ' · most often:'}
          </p>
          {topTopics.length > 0 && (
            <div className="mistake-tags" style={{ marginBottom: 12 }}>
              {topTopics.map(([label, n]) => <span key={label} className="mistake-tag">{label} · {n}</span>)}
            </div>
          )}
          {student && (
            <Link className="button-link" to="/practice/mistakes" style={{ marginTop: 0, marginBottom: 14 }}>Drill my mistakes</Link>
          )}
          <div className="notebook">
            {[...byDay.entries()].map(([day, items]) => (
              <div key={day} className="notebook-day">
                <div className="muted notebook-date">{day}</div>
                {items.map((m) => (
                  <div key={m.id} className="notebook-entry">
                    {editing?.id === m.id ? (
                      <div className="notebook-edit">
                        <input value={editing.said} onChange={(e) => setEditing({ ...editing, said: e.target.value })} />
                        <input value={editing.correct} onChange={(e) => setEditing({ ...editing, correct: e.target.value })} />
                        <div className="row-actions">
                          <button onClick={save}>Save</button>
                          <button className="ghost" onClick={() => setEditing(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="said">✗ {m.said}</div>
                        <div className="correct">✓ {m.correct}</div>
                        <div className="notebook-meta">
                          {m.labels.map((l) => <span key={l} className="mistake-tag">{l}</span>)}
                          {m.practicedCorrect > 0 && <span className="muted">drilled right {m.practicedCorrect}×</span>}
                          {m.units?.length > 0 && (
                            <span className="muted">practise: {m.units.map((u, i) => <span key={u.id}>{i > 0 && ', '}<Link to={`/practice/${u.id}`}>{u.title}</Link></span>)}</span>
                          )}
                          {boardLink && m.boardId && m.elementId && (
                            <Link className="muted" to={boardLink(m)}>on the board</Link>
                          )}
                          {canEdit && (
                            <>
                              <button className="link-button" onClick={() => setEditing({ id: m.id, said: m.said, correct: m.correct })}>edit</button>
                              <button className="link-button" onClick={() => remove(m)}>remove</button>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
