import { forwardRef, useEffect, useRef, useState } from 'react'
import { REACTIONS } from './Reactions'

// Stickers for the board: emoji, and a few phrases as coloured notes.
export const STICKERS = [
  { text: '⭐' }, { text: '🏆' }, { text: '👍' }, { text: '🎉' }, { text: '✅' }, { text: '💡' },
  { text: '🔥' }, { text: '🎯' }, { text: '🧠' }, { text: '📌' }, { text: '❓' }, { text: '❗' },
  { text: 'Well done!', phrase: true, fill: '#bbf7d0' }, { text: 'Great job', phrase: true, fill: '#fef08a' },
  { text: 'New word', phrase: true, fill: '#bfdbfe' }, { text: 'Remember!', phrase: true, fill: '#fed7aa' },
  { text: 'Homework', phrase: true, fill: '#e9d5ff' }, { text: 'Say it again', phrase: true, fill: '#fecaca' }
]

const Controls = forwardRef(function Controls({
  onToggleCamera,
  onToggleMicrophone,
  cameraOn,
  micOn,
  onShareScreen,
  hasScreenStream,
  isBlurEnabled,
  onBlurToggle,
  blurAmount,
  onBlurChange,
  noiseSuppression,
  onNoiseToggle,
  boards = [],
  boardId,
  // The board to go back to with one click (the last one opened, or the student's).
  preferredBoardId,
  onOpenBoard,
  onCloseBoard,
  onLeave,
  chatOpen,
  unread = 0,
  onToggleChat,
  onCopyLink,
  copied,
  writingChoices = [],
  writingId,
  onOpenWriting,
  onCloseWriting,
  // Board mode: only Cam, Mic, More and Leave stay in the row; the rest is under More.
  compact = false,
  onReact,
  onSticker
}, ref) {
  // The rarely used controls live behind "More": noise reduction, blur, the link.
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef(null)
  useEffect(() => {
    if (!moreOpen) return
    const close = (e) => { if (!moreRef.current?.contains(e.target)) setMoreOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [moreOpen])
  const moreActive = noiseSuppression || isBlurEnabled || (compact && (hasScreenStream || (unread > 0 && !chatOpen)))

  // Writing: in the row in both layouts (next to Cam and Mic when compact).
  const writing = (
    <>
      {writingChoices.length > 0 && (
        writingId ? (
          <button className="round on" onClick={onCloseWriting} title="Close writing">Writing</button>
        ) : writingChoices.length === 1 ? (
          <button className="round" onClick={() => onOpenWriting(writingChoices[0].id)} title="Open the student's writing">Writing</button>
        ) : (
          <select
            className="pill"
            value=""
            onChange={(e) => { if (e.target.value) onOpenWriting(e.target.value) }}
            title="Open a student's writing"
          >
            <option value="">Writing…</option>
            {writingChoices.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        )
      )}

    </>
  )

  // Screen, board, chat — in the row, or under More when compact.
  const tools = (
    <>
      <button
        className={`round ${hasScreenStream ? 'on' : ''}`}
        onClick={onShareScreen}
        title={hasScreenStream ? 'Stop sharing your screen' : 'Share your screen'}
      >
        {hasScreenStream ? 'Stop screen' : 'Screen'}
      </button>

      {boards.length > 0 && (
        boardId && writingId ? (
          <button className="round" onClick={() => onOpenBoard(boardId)} title="Back to the board">Board</button>
        ) : boardId ? (
          <button className="round on" onClick={onCloseBoard} title="Close the board (only for you)">Board</button>
        ) : boards.length === 1 || (preferredBoardId && boards.some((b) => b.id === preferredBoardId)) ? (
          <button className="round" onClick={() => onOpenBoard(boards.length === 1 ? boards[0].id : preferredBoardId)} title="Open the board">Board</button>
        ) : (
          <select
            className="pill"
            value=""
            onChange={(e) => { if (e.target.value) onOpenBoard(e.target.value) }}
            title="Open a board"
          >
            <option value="">Board…</option>
            {boards.map((board) => (
              <option key={board.id} value={board.id}>
                {board.student ? `${board.student} — ${board.title}` : board.title}
              </option>
            ))}
          </select>
        )
      )}

      {!compact && writing}

      {onToggleChat && (
        <button className={`round ${chatOpen ? 'on' : ''}`} onClick={onToggleChat} title="Text chat">
          Chat{unread > 0 && !chatOpen ? ` (${unread})` : ''}
        </button>
      )}
    </>
  )

  return (
    <div className="controls" ref={ref}>
      <button
        className={`round ${cameraOn ? 'on' : 'off'}`}
        onClick={onToggleCamera}
        title={cameraOn ? 'Turn camera off' : 'Turn camera on'}
      >
        Cam
      </button>

      <button
        className={`round ${micOn ? 'on' : 'off'}`}
        onClick={onToggleMicrophone}
        title={micOn ? 'Mute microphone' : 'Unmute microphone'}
      >
        Mic
      </button>

      {compact && (
        writingId ? (
          // On Writing the button reads "Board": one click back to the board.
          <button
            className="round"
            onClick={() => onOpenBoard(boardId ?? preferredBoardId ?? boards[0]?.id)}
            disabled={!boardId && !preferredBoardId && !boards.length}
            title="Back to the board"
          >
            Board
          </button>
        ) : writing
      )}
      {!compact && tools}
      <div className="more-wrap" ref={moreRef}>
        <button className={`round ${moreOpen ? 'on' : ''}`} onClick={() => setMoreOpen((v) => !v)} title={compact ? 'Screen, board, chat, noise reduction, blur, invite link' : 'Noise reduction, blur, invite link'}>
          More{compact && unread > 0 && !chatOpen ? ` (${unread})` : moreActive && !moreOpen ? ' •' : ''}
        </button>
        {moreOpen && (
          <div className="more-menu">
            {compact && <div className="more-tools" onClick={(e) => { if (e.target.tagName === 'BUTTON') setMoreOpen(false) }}>{tools}</div>}
            {onReact && (
              <>
                <div className="more-label">React</div>
                <div className="more-emoji">
                  {REACTIONS.map((emoji) => (
                    <button key={emoji} type="button" onClick={() => onReact(emoji)} title="Send to everyone in the call">{emoji}</button>
                  ))}
                </div>
              </>
            )}
            {onSticker && (
              <>
                <div className="more-label">Stickers for the board</div>
                <div className="more-emoji">
                  {STICKERS.map((sticker) => (
                    <button
                      key={sticker.text}
                      type="button"
                      className={sticker.phrase ? 'phrase' : ''}
                      style={sticker.phrase ? { background: sticker.fill } : undefined}
                      onClick={() => { onSticker(sticker); setMoreOpen(false) }}
                      title="Put on the board"
                    >
                      {sticker.text}
                    </button>
                  ))}
                </div>
              </>
            )}
            <button
              className={`pill ${noiseSuppression ? 'on' : ''}`}
              onClick={onNoiseToggle}
              title="Filter out background noise from your microphone"
            >
              {noiseSuppression ? 'Noise reduction: ON' : 'Noise reduction: OFF'}
            </button>
            <div className="blur-control">
              <button className={`pill ${isBlurEnabled ? 'on' : ''}`} onClick={onBlurToggle}>
                {isBlurEnabled ? 'Background blur: ON' : 'Background blur: OFF'}
              </button>
              {isBlurEnabled && (
                <input
                  type="range"
                  min="4"
                  max="40"
                  value={blurAmount}
                  onChange={(e) => onBlurChange(Number(e.target.value))}
                  title="How strong the blur is"
                />
              )}
            </div>
            {onCopyLink && (
              <button className="pill" onClick={onCopyLink} title="Copy the link to send to the student">
                {copied ? 'Link copied' : 'Copy invite link'}
              </button>
            )}
          </div>
        )}
      </div>

      {onLeave && (
        <button className="pill leave" onClick={onLeave} title="Leave the call">Leave</button>
      )}
    </div>
  )
})

export default Controls
