import { useEffect, useRef, useState } from 'react'
import { speakDialogue, stopSpeaking } from '../utils/speech'

// Building blocks shared by every TOEFL task: the timer, audio playback
// (generated MP3s, or the browser's voice until they exist), recording, bands.

export const TASK_INFO = {
  'complete-words': { section: 'Reading', name: 'Complete the Words' },
  'daily-life': { section: 'Reading', name: 'Read in Daily Life' },
  'academic-passage': { section: 'Reading', name: 'Read an Academic Passage' },
  'choose-response': { section: 'Listening', name: 'Listen and Choose a Response' },
  conversation: { section: 'Listening', name: 'Listen to a Conversation' },
  announcement: { section: 'Listening', name: 'Listen to an Announcement' },
  'academic-talk': { section: 'Listening', name: 'Listen to an Academic Talk' },
  'build-sentence': { section: 'Writing', name: 'Build a Sentence' },
  email: { section: 'Writing', name: 'Write an Email' },
  discussion: { section: 'Writing', name: 'Write for an Academic Discussion' },
  'listen-repeat': { section: 'Speaking', name: 'Listen and Repeat' },
  interview: { section: 'Speaking', name: 'Take an Interview' },
}

export const roundHalf = (n) => Math.round(n * 2) / 2
export const clampBand = (n) => Math.max(1, Math.min(6, roundHalf(n)))
// 0–5 rubric score → band, same as the server.
export const rawToBand = (raw) => clampBand(1 + raw)
// Share of right answers in one task → band (a single practice set).
export const shareToBand = (share) => clampBand(1 + share * 5)
// Approximate 0–120-scale section score for a band (ETS publishes a
// comparison table for the transition period; these are rounded guides).
const OLD_SCALE = { 1: 0, 1.5: 3, 2: 6, 2.5: 9, 3: 13, 3.5: 17, 4: 21, 4.5: 24, 5: 27, 5.5: 29, 6: 30 }
export const oldScale = (band) => OLD_SCALE[roundHalf(band)] ?? null

export const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`

// Counts down while `running`; calls onExpire once at zero.
export function useCountdown(seconds, running, onExpire) {
  const [left, setLeft] = useState(seconds)
  const expired = useRef(false)
  const cb = useRef(onExpire)
  cb.current = onExpire
  useEffect(() => { setLeft(seconds); expired.current = false }, [seconds])
  useEffect(() => {
    if (!running || !seconds) return undefined
    const t = setInterval(() => setLeft((v) => v - 1), 1000)
    return () => clearInterval(t)
  }, [running, seconds])
  useEffect(() => {
    if (running && seconds && left <= 0 && !expired.current) { expired.current = true; cb.current?.() }
  }, [left, running, seconds])
  return left
}

export function TimerBadge({ left, total }) {
  if (!total) return null
  return <span className={`toefl-timer ${left <= 30 ? 'low' : ''}`}>⏱ {fmtTime(Math.max(0, left))}</span>
}

const parseScript = (script) =>
  String(script ?? '').split('\n').filter((l) => l.trim()).map((line) => {
    const m = line.match(/^([A-Za-z][A-Za-z.\s]{0,24}):\s*(.*)$/)
    return m ? { speaker: m[1].trim(), text: m[2] } : { speaker: '_narrator', text: line }
  })
export const scriptLines = parseScript

// Plays a script: generated audio lines ({speaker, text, url}) if present,
// otherwise the browser's voices. `once` = the exam rule: one listening only.
let stopOther = null
export function Listen({ script, audio, once = false, label = 'Play', onEnded, showScript = false, autoPlay = false }) {
  const [state, setState] = useState('idle') // idle | playing | done
  const audioRef = useRef(null)
  const runRef = useRef(0) // a stopped or replaced playback must not finish later
  const guardRef = useRef(null)
  const lines = audio?.length ? audio : parseScript(script)
  useEffect(() => () => { runRef.current++; clearTimeout(guardRef.current); audioRef.current?.pause(); stopSpeaking() }, [])

  const finish = (run) => {
    if (run !== runRef.current) return
    runRef.current++
    clearTimeout(guardRef.current)
    setState('done'); stopOther = null; onEnded?.()
  }
  const stop = () => { runRef.current++; clearTimeout(guardRef.current); audioRef.current?.pause(); stopSpeaking(); setState('idle'); stopOther = null }
  const playFile = (run, i) => {
    if (run !== runRef.current) return
    if (i >= lines.length) { finish(run); return }
    if (!audioRef.current) audioRef.current = new Audio()
    const el = audioRef.current
    el.src = lines[i].url
    el.volume = 1
    // A short pause between speakers, like a real conversation.
    el.onended = () => setTimeout(() => playFile(run, i + 1), lines[i + 1]?.speaker !== lines[i].speaker ? 350 : 120)
    el.onerror = () => playFile(run, i + 1)
    el.play().catch(() => {
      // Autoplay refused before any sound: let the student press Play.
      if (i === 0) { runRef.current++; setState('idle'); stopOther = null } else playFile(run, i + 1)
    })
  }
  const play = async () => {
    stopOther?.()
    stopOther = stop
    const run = ++runRef.current
    setState('playing')
    if (audio?.length) { playFile(run, 0); return }
    // The browser's voice sometimes never reports the end; don't let that
    // keep the questions hidden — give up after ~1.5× the expected length.
    const words = lines.reduce((n, l) => n + l.text.split(/\s+/).length, 0)
    guardRef.current = setTimeout(() => finish(run), (words / 2.3 + 3) * 1500)
    const ok = await speakDialogue(lines, () => finish(run))
    if (!ok) finish(run)
  }
  // In the exam the next prompt starts by itself.
  useEffect(() => { if (autoPlay) play() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const used = once && state === 'done'
  return (
    <div className="toefl-listen">
      {state === 'playing'
        ? <button type="button" onClick={once ? undefined : stop} disabled={once} className="toefl-play playing">🔊 Playing…</button>
        : <button type="button" onClick={play} disabled={used} className="toefl-play">{used ? '✓ Played' : `▶ ${label}`}</button>}
      {once && state !== 'done' && <span className="muted">You can listen only once.</span>}
      {showScript && (
        <details className="toefl-script">
          <summary>Script</summary>
          {lines.map((l, i) => <div key={i}>{l.speaker !== '_narrator' ? <b>{l.speaker}: </b> : null}{l.text}</div>)}
        </details>
      )}
    </div>
  )
}

// Microphone recording with the browser's own speech recognition running
// alongside (free, Chrome/Edge/Safari), so the answer can be scored.
export function useRecorder() {
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState('')
  const rec = useRef(null)
  const stopRef = useRef(null)

  const start = async () => {
    setError('')
    let stream
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }) } catch {
      setError('Нет доступа к микрофону — разрешите его в браузере.')
      return false
    }
    const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg'].find((m) => window.MediaRecorder?.isTypeSupported?.(m)) ?? ''
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
    const chunks = []
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    let transcript = ''
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    let recog = null
    if (SR) {
      recog = new SR()
      recog.lang = 'en-US'
      recog.continuous = true
      recog.interimResults = false
      recog.onresult = (e) => {
        transcript = Array.from(e.results).filter((r) => r.isFinal).map((r) => r[0].transcript).join(' ')
      }
      recog.onerror = () => {}
      try { recog.start() } catch { recog = null }
    }
    const done = new Promise((resolve) => {
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        // Recognition delivers its last result a moment after stop.
        setTimeout(() => resolve({ blob: new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }), transcript: transcript.trim() }), 700)
      }
    })
    recorder.start()
    rec.current = { recorder, recog, done }
    stopRef.current = () => { try { recog?.stop() } catch { /* already stopped */ } if (recorder.state !== 'inactive') recorder.stop(); return done }
    setRecording(true)
    return true
  }
  const stop = async () => {
    if (!stopRef.current) return null
    const result = await stopRef.current()
    stopRef.current = null
    setRecording(false)
    return result
  }
  useEffect(() => () => { stopRef.current?.() }, [])
  return { recording, error, start, stop }
}

export function AiResult({ ai, aiOff }) {
  if (aiOff) return <div className="notice">Ответ сохранён. ИИ-проверка не настроена — работу проверит преподаватель.</div>
  if (!ai) return <div className="notice">Ответ сохранён. Оценка ИИ не пришла — работу проверит преподаватель.</div>
  return (
    <div className="toefl-ai">
      <div className="toefl-ai-head">Оценка: <b>{ai.score} / 5</b> · Band <b>{ai.band}</b></div>
      {ai.summary && <p>{ai.summary}</p>}
      {ai.strengths?.length > 0 && <><strong>Хорошо</strong><ul>{ai.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul></>}
      {ai.improve?.length > 0 && <><strong>Что улучшить</strong><ul>{ai.improve.map((s, i) => <li key={i}>{s}</li>)}</ul></>}
      {ai.corrected && <details><summary>Исправленный вариант</summary><div className="course-text">{ai.corrected}</div></details>}
      <p className="muted">Преподаватель тоже увидит ответ и сможет поставить свою оценку.</p>
    </div>
  )
}

// Deterministic shuffle (a re-render never reorders the chips).
export function shuffled(list, seed = 7) {
  const out = [...list]
  let s = seed
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280
    const j = Math.floor((s / 233280) * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
export const seedOf = (text) => [...String(text)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 233280, 11)
