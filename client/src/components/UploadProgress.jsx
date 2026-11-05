// What is going up and how far along, with a way to stop it.
export default function UploadProgress({ label, share, onCancel }) {
  const percent = Math.round(share * 100)
  return (
    <div className="upload-progress" onClick={(e) => e.stopPropagation()}>
      <div className="upload-progress-line">
        <strong>{label}</strong>
        <span className="muted">{percent}%</span>
        <button type="button" className="ghost" onClick={onCancel}>Cancel</button>
      </div>
      <div className="upload-progress-bar" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}
