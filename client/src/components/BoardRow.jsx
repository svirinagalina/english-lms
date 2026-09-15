import { useState } from 'react'
import { api } from '../api'

// One board in a list, with open/delete and an "assign to student" panel.
// `targets` are the other classrooms the board can be copied or moved into.
export default function BoardRow({ board, classroomId, targets, canEdit, onOpen, onChanged }) {
  const [assigning, setAssigning] = useState(false)
  const [targetId, setTargetId] = useState(targets[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  const assign = async (mode) => {
    if (!targetId) return
    setBusy(true)
    setNotice('')
    try {
      await api.assignBoard(classroomId, board.id, targetId, mode)
      const target = targets.find((t) => t.id === targetId)
      setNotice(`${mode === 'copy' ? 'Copied' : 'Moved'} to ${target?.label ?? 'the student'}`)
      setAssigning(false)
      await onChanged()
      setTimeout(() => setNotice(''), 3000)
    } catch (err) {
      setNotice(err.message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!window.confirm(`Delete "${board.title}"?`)) return
    await api.deleteBoard(classroomId, board.id)
    await onChanged()
  }

  return (
    <div className="row column">
      <div className="row-main">
        <div>
          <strong>{board.title}</strong>
          <div className="muted">Updated {new Date(board.updatedAt).toLocaleString()}</div>
          {notice && <div className="muted" style={{ color: '#a5b4fc' }}>{notice}</div>}
        </div>
        <div className="row-actions">
          <button onClick={onOpen}>Open</button>
          {canEdit && targets.length > 0 && (
            <button className="ghost" onClick={() => setAssigning((v) => !v)}>
              {assigning ? 'Close' : 'Assign'}
            </button>
          )}
          {canEdit && <button className="ghost" onClick={remove}>Delete</button>}
        </div>
      </div>

      {assigning && (
        <div className="link-editor">
          <div className="row-actions">
            <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              {targets.map((target) => (
                <option key={target.id} value={target.id}>{target.label}</option>
              ))}
            </select>
            <button onClick={() => assign('copy')} disabled={busy}>Copy there</button>
            <button className="ghost" onClick={() => assign('move')} disabled={busy}>Move there</button>
          </div>
          <span className="muted">
            Copy keeps this board and gives the student their own; move takes it away from here.
          </span>
        </div>
      )}
    </div>
  )
}
