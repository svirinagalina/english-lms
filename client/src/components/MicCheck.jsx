import { useEffect, useRef, useState } from 'react'

// The join screen's microphone check: a live level bar and a verdict, so a
// silent or very quiet microphone is found before the lesson rather than in
// it (October 2026: one person in nine spoke at -50..-70 dBFS and nobody
// heard them). "Find a working microphone" listens to every input for a
// moment while the person talks and picks the loudest.
const toDb = (v) => (v > 0 ? 20 * Math.log10(v) : -120)
const OK_DB = -40
const QUIET_DB = -55

function meter(stream) {
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx || !stream?.getAudioTracks().length) return null
  const ctx = new Ctx()
  const source = ctx.createMediaStreamSource(stream)
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 2048
  source.connect(analyser)
  const data = new Float32Array(analyser.fftSize)
  return {
    level() {
      analyser.getFloatTimeDomainData(data)
      let sum = 0
      for (const v of data) sum += v * v
      return Math.sqrt(sum / data.length)
    },
    resume: () => ctx.resume().catch(() => {}),
    close() { try { source.disconnect() } catch { /* gone */ } ctx.close().catch(() => {}) }
  }
}

export default function MicCheck({ stream, streamKey, currentId, onChoose, onResult }) {
  const [db, setDb] = useState(-120)
  const [verdict, setVerdict] = useState('listening') // listening | ok | quiet | unheard | dead
  const [mics, setMics] = useState([])
  const [scanning, setScanning] = useState('')
  const best = useRef(-120)

  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices().then((list) => {
      setMics(list.filter((d) => d.kind === 'audioinput' && d.deviceId !== 'default' && d.deviceId !== 'communications'))
    }).catch(() => {})
  }, [streamKey])

  useEffect(() => {
    const m = meter(stream)
    if (!m) return
    best.current = -120
    setVerdict('listening')
    let started = Date.now()
    let zeroSince = null
    let shown = -120
    const resume = () => m.resume()
    document.addEventListener('pointerdown', resume)
    const timer = setInterval(() => {
      const level = m.level()
      const now = Date.now()
      const d = toDb(level)
      shown = Math.max(d, shown - 3) // the bar falls back gently
      setDb(shown)
      if (level === 0) zeroSince ??= now
      else zeroSince = null
      if (d > best.current) best.current = d
      const muted = stream.getAudioTracks().every((t) => !t.enabled)
      let v
      if (muted) v = 'muted'
      else if (best.current >= OK_DB) v = 'ok'
      else if (zeroSince && now - zeroSince > 3000) v = 'dead'
      else if (best.current >= QUIET_DB) v = 'quiet'
      else v = now - started > 8000 ? 'unheard' : 'listening'
      setVerdict(v)
      onResult?.({ verdict: v, bestDb: Math.round(best.current) })
    }, 100)
    return () => { clearInterval(timer); document.removeEventListener('pointerdown', resume); m.close() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream, streamKey])

  // Each microphone in turn for 1.5 s; the loudest wins.
  const findWorking = async () => {
    const found = []
    for (const mic of mics) {
      setScanning(mic.label || 'microphone')
      let s = null
      try {
        s = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: mic.deviceId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
        const m = meter(s)
        await m?.resume()
        let peak = 0
        for (let i = 0; i < 15; i++) { await new Promise((r) => setTimeout(r, 100)); peak = Math.max(peak, m?.level() ?? 0) }
        m?.close()
        found.push({ id: mic.deviceId, db: toDb(peak) })
      } catch { /* busy or gone: skip it */ }
      s?.getTracks().forEach((t) => t.stop())
    }
    setScanning('')
    found.sort((a, b) => b.db - a.db)
    if (found[0] && found[0].db > -100 && found[0].id !== currentId) onChoose(found[0].id, 'scan')
  }

  const pct = Math.max(0, Math.min(100, ((db + 70) / 60) * 100))
  const text = {
    listening: 'Say a few words — the bar should move.',
    ok: 'Your microphone works.',
    quiet: 'You sound very quiet. The platform will raise your voice, but sit closer, pick another microphone or turn up the input volume (Mac: System Settings → Sound → Input).',
    unheard: 'We cannot hear you. Say something; if the bar does not move, pick another microphone below.',
    dead: 'The microphone sends no sound at all. Pick another one below, or allow the browser to use the microphone (Mac: System Settings → Privacy & Security → Microphone).',
    muted: 'Your microphone is muted.'
  }[verdict]

  return (
    <div className={`mic-check ${verdict}`}>
      <div className="mic-check-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
      <p className="mic-check-text">{scanning ? `Listening to “${scanning}”… keep talking.` : text}</p>
      {mics.length > 1 && (
        <div className="mic-check-row">
          <select value={currentId || ''} onChange={(e) => onChoose(e.target.value, 'pick')} disabled={Boolean(scanning)}>
            {!currentId && <option value="">Default microphone</option>}
            {mics.map((m) => <option key={m.deviceId} value={m.deviceId}>{m.label || 'Microphone'}</option>)}
          </select>
          {verdict !== 'ok' && verdict !== 'muted' && (
            <button type="button" className="ghost" onClick={findWorking} disabled={Boolean(scanning)}>Find a working microphone</button>
          )}
        </div>
      )}
    </div>
  )
}
