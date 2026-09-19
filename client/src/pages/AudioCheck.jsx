import { useEffect, useRef, useState } from 'react'
import Nav from '../components/Nav'
import { denoiseTrack, primeDenoiser, isDenoiserSupported } from '../utils/noiseSuppressor'

// The same microphone path a call uses, laid bare: the level before and
// after noise removal, the engine's state, and a way to hear the result.
const AUDIO_CONSTRAINTS = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: { ideal: 1 } }

const db = (rms) => (rms > 0 ? 20 * Math.log10(rms) : -100)

export default function AudioCheck() {
  const [phase, setPhase] = useState('idle') // idle | mic | loading | running | failed
  const [error, setError] = useState('')
  const [info, setInfo] = useState(null)
  const [levels, setLevels] = useState({ raw: 0, clean: 0 })
  const [peak, setPeak] = useState({ raw: 0, clean: 0 })
  const [listen, setListen] = useState(false)
  const cleanedRef = useRef(null)
  const rawRef = useRef(null)
  const monitorRef = useRef(null)

  const stop = () => {
    cleanedRef.current?.stop(); cleanedRef.current = null
    rawRef.current?.getTracks().forEach((t) => t.stop()); rawRef.current = null
    if (monitorRef.current) { monitorRef.current.srcObject = null }
    setListen(false)
    setPhase('idle')
  }
  useEffect(() => () => stop(), [])

  const start = async () => {
    setError(''); setInfo(null); setPeak({ raw: 0, clean: 0 })
    primeDenoiser()
    setPhase('mic')
    let raw
    try {
      raw = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS })
    } catch (err) {
      setError(`The microphone could not be opened: ${err?.name ?? ''} ${err?.message ?? err}`); setPhase('failed'); return
    }
    rawRef.current = raw
    const track = raw.getAudioTracks()[0]
    setPhase('loading')
    const t0 = performance.now()
    try {
      const cleaned = await denoiseTrack(track)
      cleanedRef.current = cleaned
      setInfo({
        engine: cleaned.engine,
        loadMs: Math.round(performance.now() - t0),
        settings: track.getSettings(),
        supported: isDenoiserSupported(),
        browser: navigator.userAgent
      })
      setPhase('running')
    } catch (err) {
      setError(`Noise removal could not start: ${err?.message ?? err}`)
      setInfo({ engine: null, loadMs: Math.round(performance.now() - t0), settings: track.getSettings(), supported: isDenoiserSupported(), browser: navigator.userAgent })
      setPhase('failed')
    }
  }

  useEffect(() => {
    if (phase !== 'running') return
    const timer = setInterval(() => {
      const cleaned = cleanedRef.current
      if (!cleaned) return
      const { raw, clean } = cleaned.levels()
      setLevels({ raw, clean })
      setPeak((p) => ({ raw: Math.max(p.raw * 0.97, raw), clean: Math.max(p.clean * 0.97, clean) }))
    }, 100)
    return () => clearInterval(timer)
  }, [phase])

  useEffect(() => {
    const video = monitorRef.current
    if (!video) return
    if (listen && cleanedRef.current) {
      video.srcObject = new MediaStream([cleanedRef.current.track])
      video.play().catch(() => {})
    } else {
      video.srcObject = null
    }
  }, [listen, phase])

  const bar = (rms) => `${Math.max(2, Math.min(100, (db(rms) + 60) / 60 * 100))}%`
  const reduction = peak.raw > 0.001 && peak.clean >= 0 ? Math.max(0, db(peak.raw) - db(Math.max(peak.clean, 1e-6))) : null

  return (
    <div className="page">
      <Nav title="Microphone check" back="/classroom" />
      <section className="audio-check">
        <p className="muted">
          This runs exactly what a call runs on your microphone. Sit quietly first: the top bar shows the room (fan, street, keyboard), the bottom bar what the others would hear. Then say a few words.
        </p>

        {phase === 'idle' || phase === 'failed' ? (
          <button onClick={start}>Start the check</button>
        ) : (
          <button className="ghost" onClick={stop}>Stop</button>
        )}

        {phase === 'mic' && <p className="muted">Allow the microphone in the browser prompt…</p>}
        {phase === 'loading' && <p className="muted">Loading the noise removal engine… (its files are small, but a slow link can take a while)</p>}
        {error && <div className="error">{error}</div>}

        {phase === 'running' && (
          <div className="meters">
            <div className="meter">
              <div className="meter-label"><span>Microphone</span><span className="mono">{db(levels.raw).toFixed(0)} dB</span></div>
              <div className="meter-track"><div className="meter-fill raw" style={{ width: bar(levels.raw) }} /></div>
            </div>
            <div className="meter">
              <div className="meter-label"><span>After noise removal — what the others hear</span><span className="mono">{db(levels.clean).toFixed(0)} dB</span></div>
              <div className="meter-track"><div className="meter-fill clean" style={{ width: bar(levels.clean) }} /></div>
            </div>
            {reduction !== null && (
              <p className="check-verdict">
                Steady noise is cut by about <strong>{reduction.toFixed(0)} dB</strong>
                {reduction >= 15 ? ' — the engine is working.' : reduction >= 5 ? ' — working, the room is fairly quiet.' : ' — little to remove right now, or the engine is not doing its job; keep quiet for a few seconds and watch the bars.'}
              </p>
            )}
            <label className="check-listen">
              <input type="checkbox" checked={listen} onChange={(e) => setListen(e.target.checked)} />
              Play the cleaned sound back to me (use headphones, or it will howl)
            </label>
            <video ref={monitorRef} autoPlay playsInline hidden />
          </div>
        )}

        {info && (
          <div className="check-info">
            <div><span className="muted">Noise removal</span><span>{info.engine ? 'on' : 'not running'}{info.engine ? ` (loaded in ${(info.loadMs / 1000).toFixed(1)} s)` : ''}</span></div>
            <div><span className="muted">Microphone</span><span>{info.settings?.sampleRate ?? '?'} Hz · {info.settings?.channelCount ?? '?'} ch · browser filter {info.settings?.noiseSuppression ? 'on' : 'off'} · echo cancel {info.settings?.echoCancellation ? 'on' : 'off'}</span></div>
            <div><span className="muted">Browser</span><span className="small">{info.browser}</span></div>
          </div>
        )}
      </section>
    </div>
  )
}
