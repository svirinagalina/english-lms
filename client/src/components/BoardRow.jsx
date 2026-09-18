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
      const verb = { copy: 'Copied', move: 'Moved', share: 'Shared with', unshare: 'No longer shared with' }[mode]
      setNotice(`${verb} ${target?.label ?? 'the student'}`)
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
            {board.shared && ' · shared from another student'}
            {board.sharedWith?.length > 0 && ` · also with ${board.sharedWith.join(', ')}`}
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
          <div className="row-actions">
            <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              {targets.map((target) => (
                <option key={target.id} value={target.id}>{target.label}</option>
              ))}
            </select>
            <button onClick={() => assign('share')} disabled={busy}>Share there</button>
            <button className="ghost" onClick={() => assign('copy')} disabled={busy}>Copy there</button>
            <button className="ghost" onClick={() => assign('move')} disabled={busy}>Move there</button>
            {board.sharedWith?.length > 0 && (
              <button className="ghost" onClick={() => assign('unshare')} disabled={busy}>Stop sharing there</button>
            )}
          </div>
          <span className="muted">
            Share attaches this same board to another student too — one board, everyone sees the same content.
            Copy gives them their own copy; move takes it away from here.
          </span>
        </div>
      )}
    </div>
  )
}
