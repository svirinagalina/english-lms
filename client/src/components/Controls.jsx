import { useState } from 'react'

export default function Controls({
  onToggleCamera,
  onToggleMicrophone,
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
  onCloseBoard
}) {
  const [cameraOn, setCameraOn] = useState(true)
  const [micOn, setMicOn] = useState(true)

  return (
    <div className="controls">
      <button
        className={`round ${cameraOn ? 'on' : 'off'}`}
        onClick={() => { onToggleCamera(); setCameraOn((v) => !v) }}
        title={cameraOn ? 'Turn camera off' : 'Turn camera on'}
      >
        Cam
      </button>

      <button
        className={`round ${micOn ? 'on' : 'off'}`}
        onClick={() => { onToggleMicrophone(); setMicOn((v) => !v) }}
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
            {boards.map((board) => <option key={board.id} value={board.id}>{board.title}</option>)}
          </select>
        )
      )}

      <button
        className={`pill ${noiseSuppression ? 'on' : ''}`}
        onClick={onNoiseToggle}
        title="Filter out background noise from your microphone"
      >
        {noiseSuppression ? 'Noise reduction on' : 'Add noise reduction'}
      </button>

      <div className="blur-control">
        <button className={`pill ${isBlurEnabled ? 'on' : ''}`} onClick={onBlurToggle}>
          {isBlurEnabled ? 'Blur on' : 'Add blur'}
        </button>
        {isBlurEnabled && (
          <input
            type="range"
            min="6"
            max="70"
            value={blurAmount}
            onChange={(e) => onBlurChange(Number(e.target.value))}
          />
        )}
      </div>
    </div>
  )
}
