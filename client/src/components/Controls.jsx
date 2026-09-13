import { useState } from 'react'

export default function Controls({
  onToggleCamera,
  onToggleMicrophone,
  onShareScreen,
  hasScreenStream,
  isBlurEnabled,
  onBlurToggle,
  blurAmount,
  onBlurChange
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

      <div className="blur-control">
        <button className={`pill ${isBlurEnabled ? 'on' : ''}`} onClick={onBlurToggle}>
          {isBlurEnabled ? 'Blur on' : 'Add blur'}
        </button>
        {isBlurEnabled && (
          <input
            type="range"
            min="2"
            max="30"
            value={blurAmount}
            onChange={(e) => onBlurChange(Number(e.target.value))}
          />
        )}
      </div>
    </div>
  )
}
