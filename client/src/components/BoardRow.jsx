import { useState } from 'react'
import { api } from '../api'

// One board in a list, with open/delete and who it belongs to.
// `targets` are the students this board could be assigned to.
export default function BoardRow({ board, classroomId, targets, canEdit, onOpen, onChanged }) {
  const [assigning, setAssigning] = useState(false)
  const [busy, setBusy] = useState(null) // the target id currently toggling
  const [notice, setNotice] = useState('')

  const currentIds = new Set([board.classroomId, ...(board.sharedWith?.map((c) => c.id) ?? [])].filter(Boolean))

  const toggle = async (target, checked) => {
    setBusy(target.id)
    setNotice('')
    try {
      const { displaced } = await api.assignBoard(classroomId, board.id, target.id, checked)
      setNotice(
        checked
          ? displaced?.length ? `Assigned to ${target.label} · replaced “${displaced.join(', ')}”` : `Assigned to ${target.label}`
          : `No longer with ${target.label}`
      )
      await onChanged()
      setTimeout(() => setNotice(''), 4000)
    } catch (err) {
      setNotice(err.message)
    } finally {
      setBusy(null)
    }
  }

  const remove = async () => {
    if (!window.confirm(board.shared ? `Remove "${board.title}" from this student? The board itself stays.` : `Delete "${board.title}"?`)) return
    await api.deleteBoard(classroomId, board.id)
    await onChanged()
  }

  return (
    <div className="row column">
      <div className="row-main">
        <div>
          <strong>{board.title}</strong>
          <div className="muted">
            Updated {new Date(board.updatedAt).toLocaleString()}
            {board.shared && (board.ownerName ? ` · shared from ${board.ownerName}'s board` : ' · from your own boards')}
            {board.sharedWith?.length > 0 && ` · also with ${board.sharedWith.map((c) => c.name).join(', ')}`}
          </div>
          {notice && <div className="muted" style={{ color: '#a5b4fc' }}>{notice}</div>}
        </div>
        <div className="row-actions">
          <button onClick={onOpen}>Open</button>
          {canEdit && targets.length > 0 && (
            <button className="ghost" onClick={() => setAssigning((v) => !v)}>
              {assigning ? 'Close' : 'Assign'}
            </button>
          )}
          {canEdit && <button className="ghost" onClick={remove}>{board.shared ? 'Remove from here' : 'Delete'}</button>}
        </div>
      </div>

      {assigning && (
        <div className="link-editor">
          <span className="muted" style={{ display: 'block', marginBottom: 8 }}>
            Who this board belongs to. Checking a student gives them this board and takes away whatever they had before — a student is only ever on one board.
          </span>
          <div className="assign-list">
            {targets.map((target) => {
              const checked = currentIds.has(target.id)
              return (
                <label key={target.id} className="assign-item">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={busy === target.id}
                    onChange={(e) => toggle(target, e.target.checked)}
                  />
                  {target.label}
                </label>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
