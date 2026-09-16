export default function Controls({
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
  onOpenBoard,
  onCloseBoard,
  onLeave,
  onCopyLink,
  copied,
  writingChoices = [],
  writingId,
  onOpenWriting,
  onCloseWriting
}) {
  return (
    <div className="controls">
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

      <button
        className={`round ${hasScreenStream ? 'on' : ''}`}
        onClick={onShareScreen}
        title="Share your screen"
      >
        Screen
      </button>

      {boards.length > 0 && (
        boardId ? (
          <button className="round on" onClick={onCloseBoard} title="Close the board for everyone">Board</button>
        ) : boards.length === 1 ? (
          <button className="round" onClick={() => onOpenBoard(boards[0].id)} title="Open the student's board for everyone in the call">Board</button>
        ) : (
          <select
            className="pill"
            value=""
            onChange={(e) => { if (e.target.value) onOpenBoard(e.target.value) }}
            title="Open a board for everyone in the call"
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

      <button
        className={`pill ${noiseSuppression ? 'on' : ''}`}
        onClick={onNoiseToggle}
        title="Filter out background noise from your microphone"
      >
        {noiseSuppression ? (onLeave ? 'Noise on' : 'Noise reduction on') : (onLeave ? 'Noise' : 'Add noise reduction')}
      </button>

      {writingChoices.length > 0 && (
        writingId ? (
          <button className="round on" onClick={onCloseWriting} title="Back to the board">Writing</button>
        ) : writingChoices.length === 1 ? (
          <button className="round" onClick={() => onOpenWriting(writingChoices[0].id)} title="Open the student's writing for everyone in the call">Writing</button>
        ) : (
          <select
            className="pill"
            value=""
            onChange={(e) => { if (e.target.value) onOpenWriting(e.target.value) }}
            title="Open a student's writing for everyone in the call"
          >
            <option value="">Writing…</option>
            {writingChoices.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        )
      )}

      {onCopyLink && (
        <button className="pill" onClick={onCopyLink} title="Copy the link to send to the student">
          {copied ? 'Link copied' : 'Copy link'}
        </button>
      )}
      {onLeave && (
        <button className="pill leave" onClick={onLeave} title="Leave the call">Leave</button>
      )}

      <div className="blur-control">
        <button className={`pill ${isBlurEnabled ? 'on' : ''}`} onClick={onBlurToggle}>
          {isBlurEnabled ? 'Blur on' : (onLeave ? 'Blur' : 'Add blur')}
        </button>
        {isBlurEnabled && (
          <input
            type="range"
            min="4"
            max="40"
            value={blurAmount}
            onChange={(e) => onBlurChange(Number(e.target.value))}
          />
        )}
      </div>
    </div>
  )
}
