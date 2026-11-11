import { useEffect, useRef, useState } from 'react'
import Nav from '../components/Nav'
import { api } from '../api'
import { speakAmerican, stopSpeaking } from '../utils/speech'
import '../styles/speaking.css'

// The platform's own speaking trainer (2026-11-11, replaces Maxim's iframe
// trainer, which hung on «Слушаю…», ignored the chosen microphone and went
// silent in Safari). A voice conversation with the AI: the student presses
// the mic and talks, the browser's own recogniser turns it into text, the
// server answers with the partner's next line and a correction, and the
// partner's line is read aloud in an American voice.

const TOPICS = [
  'Getting to know each other',
  'Free time and hobbies',
  'Travel and holidays',
  'Work and studies',
  'Food and cooking',
  'Films, books and series',
  'City life vs country life',
  'Technology in everyday life',
  'Shopping and money habits',
  'Health and sport',
  'A job interview',
  'At a hotel or restaurant',
]
const LEVELS = ['A2', 'B1', 'B2', 'C1']
const store = {
  get: (k, d) => { try { return localStorage.getItem(k) ?? d } catch { return d } },
  set: (k, v) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } },
}

const Recognition = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null

const MIC_ERRORS = {
  'not-allowed': 'Нет доступа к микрофону — разрешите его в браузере (значок слева от адреса) и нажмите ещё раз.',
  'service-not-allowed': 'Браузер не разрешает распознавание речи. Откройте страницу в Chrome или Safari.',
  'audio-capture': 'Микрофон не найден. Проверьте, что он подключён и выбран в системе.',
  network: 'Нет связи с сервисом распознавания речи. Проверьте интернет и попробуйте ещё раз.',
  'no-speech': 'Ничего не услышала — нажмите на микрофон и говорите чуть громче.',
}

// Reads the partner's line aloud and resolves when it ends. The browser's
// voice sometimes never reports the end; a guard by length finishes anyway,
// so the mic button is never left locked.
function say(text) {
  return new Promise((resolve) => {
    let done = false
    const finish = () => { if (!done) { done = true; clearTimeout(guard); resolve() } }
    const guard = setTimeout(finish, (text.split(/\s+/).length / 2.3 + 3) * 1500)
    speakAmerican(text, finish).then((ok) => { if (!ok) finish() }).catch(finish)
  })
}

export default function SpeakingTrainer() {
  const [status, setStatus] = useState(null) // { enabled, left }
  const [topic, setTopic] = useState(() => store.get('speaking.topic', TOPICS[0]))
  const [ownTopic, setOwnTopic] = useState('')
  const [level, setLevel] = useState(() => store.get('speaking.level', 'B1'))
  const [autoVoice, setAutoVoice] = useState(() => store.get('speaking.voice', '1') === '1')
  const [turns, setTurns] = useState(null) // null = setup; [{ role, text, ru?, correction? }]
  const [busy, setBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const [heard, setHeard] = useState('')
  const [typed, setTyped] = useState('')
  const [speaking, setSpeaking] = useState(false)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState(false)
  const recRef = useRef(null)
  const heardRef = useRef('')
  const boxRef = useRef(null)
  const turnsRef = useRef([])
  turnsRef.current = turns ?? []
  const chosenTopic = topic === '__own' ? ownTopic.trim() : topic

  useEffect(() => { api.speakingStatus().then(setStatus).catch(() => setStatus({ enabled: false })) }, [])
  // Leaving or finishing drops whatever was half-said instead of sending it.
  const cancelMic = () => { const rec = recRef.current; if (rec) { rec.cancelled = true; rec.abort() } }
  useEffect(() => () => { cancelMic(); stopSpeaking() }, [])
  useEffect(() => { boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight, behavior: 'smooth' }) }, [turns, heard, busy])

  const speak = async (text) => {
    setSpeaking(true)
    await say(text)
    setSpeaking(false)
  }

  const ask = async (history, message) => {
    setBusy(true)
    setError('')
    try {
      const out = await api.speakingTurn({ topic: chosenTopic, level, history: history.map(({ role, text }) => ({ role, text })), message })
      const next = history.map((t, i) => (i === history.length - 1 && t.role === 'student' ? { ...t, correction: out.correction } : t))
      next.push({ role: 'partner', text: out.reply, ru: out.replyRu })
      setTurns(next)
      setBusy(false)
      if (autoVoice) speak(out.reply)
    } catch (err) {
      setBusy(false)
      // The student's line stays; they can resend it by pressing the mic again.
      setError(err.status === 403 ? 'Сегодняшний лимит бесплатных ответов ИИ закончился — его снимает план Practice.' : 'ИИ не ответил — попробуйте ещё раз через минуту.')
      return false
    }
    return true
  }

  const start = async () => {
    if (!chosenTopic) return
    store.set('speaking.topic', topic)
    store.set('speaking.level', level)
    setSummary(false)
    setTurns([])
    const ok = await ask([], '')
    if (!ok) setTurns(null)
  }

  const send = (text) => {
    const message = text.trim()
    if (!message || busy) return
    const history = [...turnsRef.current, { role: 'student', text: message }]
    setTurns(history)
    setTyped('')
    ask(history, message)
  }

  // Tap to talk, tap to stop. The recogniser is created inside the tap (Safari
  // needs the gesture) and the partner's voice is stopped first, so it never
  // hears itself. When the browser ends on its own after a pause, what was
  // said is sent, like the end of a turn in a real conversation.
  const toggleMic = () => {
    if (listening) { recRef.current?.stop(); return }
    if (!Recognition || busy) return
    stopSpeaking()
    setSpeaking(false)
    setError('')
    setHeard('')
    heardRef.current = ''
    const rec = new Recognition()
    rec.lang = 'en-US'
    rec.continuous = true
    rec.interimResults = true
    rec.maxAlternatives = 1
    let finalText = ''
    let failed = false
    rec.onresult = (e) => {
      let interim = ''
      finalText = ''
      for (const r of e.results) { if (r.isFinal) finalText += `${r[0].transcript} `; else interim += r[0].transcript }
      heardRef.current = (finalText + interim).trim()
      setHeard(heardRef.current)
    }
    rec.onerror = (e) => {
      if (e.error === 'aborted') return
      failed = e.error !== 'no-speech'
      setError(MIC_ERRORS[e.error] ?? `Не удалось распознать речь (${e.error}).`)
    }
    rec.onend = () => {
      recRef.current = null
      setListening(false)
      // Words still marked as interim when the student pressed stop count too.
      const said = heardRef.current
      heardRef.current = ''
      setHeard('')
      if (!failed && !rec.cancelled) send(said)
    }
    try {
      rec.start()
      recRef.current = rec
      setListening(true)
    } catch {
      setError('Не удалось включить распознавание речи — обновите страницу и попробуйте ещё раз.')
    }
  }

  const finish = () => {
    cancelMic()
    setError('')
    stopSpeaking()
    setSpeaking(false)
    setSummary(true)
  }

  if (!status) return <div className="centered">Loading…</div>

  if (!status.enabled) {
    return (
      <div className="page">
        <Nav title="Speaking trainer" back="/practice" />
        <p className="muted">The speaking trainer needs the AI to be connected in Settings. Ask your teacher.</p>
      </div>
    )
  }

  // Setup: topic and level.
  if (turns === null) {
    return (
      <div className="page speaking-page">
        <Nav title="Speaking trainer" back="/practice" />
        <section className="speaking-setup">
          <h2>Talk in English with an AI partner</h2>
          <p className="muted">Press the microphone, say your answer, press it again (or just pause). The partner answers aloud and shows how to say your sentence better.</p>
          <label>Topic
            <select value={topic} onChange={(e) => setTopic(e.target.value)}>
              {TOPICS.map((t) => <option key={t} value={t}>{t}</option>)}
              <option value="__own">My own topic…</option>
            </select>
          </label>
          {topic === '__own' && <input value={ownTopic} onChange={(e) => setOwnTopic(e.target.value)} maxLength={200} placeholder="e.g. My last trip to Spain" autoFocus />}
          <label>Level
            <select value={level} onChange={(e) => setLevel(e.target.value)}>
              {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
          {!Recognition && <div className="notice">Этот браузер не распознаёт речь — можно писать ответы текстом. Для голоса откройте страницу в Chrome или Safari.</div>}
          {status.left != null && <p className="muted">Free answers left today: {status.left}</p>}
          {error && <div className="error">{error}</div>}
          <button type="button" onClick={start} disabled={busy || !chosenTopic}>{busy ? 'Starting…' : 'Start the conversation'}</button>
        </section>
      </div>
    )
  }

  const mistakes = turns.filter((t) => t.role === 'student' && t.correction && !t.correction.ok)
  const studentTurns = turns.filter((t) => t.role === 'student').length

  return (
    <div className="page speaking-page">
      <Nav title="Speaking trainer" back="/practice" />
      <div className="speaking-head">
        <span className="muted">{chosenTopic} · {level}</span>
        <label className="speaking-toggle">
          <input type="checkbox" checked={autoVoice} onChange={(e) => { setAutoVoice(e.target.checked); store.set('speaking.voice', e.target.checked ? '1' : '0'); if (!e.target.checked) { stopSpeaking(); setSpeaking(false) } }} />
          Read replies aloud
        </label>
      </div>

      <div className="speaking-chat" ref={boxRef}>
        {turns.map((t, i) => (t.role === 'partner'
          ? <PartnerLine key={i} turn={t} onReplay={() => speak(t.text)} />
          : <StudentLine key={i} turn={t} />))}
        {listening && <div className="speaking-bubble me live">{heard || 'Listening…'}</div>}
        {busy && <div className="speaking-bubble partner typing">…</div>}
      </div>

      {error && <div className="error">{error}</div>}

      {summary ? (
        <section className="speaking-summary">
          <h2>Well done!</h2>
          <p>You said {studentTurns} {studentTurns === 1 ? 'thing' : 'things'}; {mistakes.length ? `${mistakes.length} to say better:` : 'no mistakes to fix.'}</p>
          {mistakes.length > 0 && (
            <ul>
              {mistakes.map((t, i) => <li key={i}><s>{t.text}</s><br /><b>{t.correction.better}</b>{t.correction.note && <div className="muted">{t.correction.note}</div>}</li>)}
            </ul>
          )}
          <div className="speaking-actions">
            <button type="button" onClick={() => setSummary(false)} className="ghost">Back to the conversation</button>
            <button type="button" onClick={() => { setTurns(null); setSummary(false) }}>New conversation</button>
          </div>
        </section>
      ) : (
        <div className="speaking-controls">
          {Recognition && (
            <button type="button" className={`speaking-mic${listening ? ' on' : ''}`} onClick={toggleMic} disabled={busy && !listening} aria-label={listening ? 'Stop and send' : 'Speak'}>
              {listening ? '■' : '🎤'}
            </button>
          )}
          <div className="speaking-hint muted">
            {listening ? 'Говорите… нажмите ■ или сделайте паузу — ответ уйдёт сам.'
              : busy ? 'Партнёр думает…'
              : speaking ? 'Партнёр говорит — нажмите 🎤, чтобы ответить сразу.'
              : Recognition ? 'Нажмите 🎤 и отвечайте по-английски.' : 'Напишите ответ по-английски.'}
          </div>
          <form className="speaking-type" onSubmit={(e) => { e.preventDefault(); send(typed) }}>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="…or type your answer" maxLength={1500} disabled={listening} />
            <button type="submit" disabled={busy || listening || !typed.trim()}>Send</button>
          </form>
          <button type="button" className="ghost" onClick={finish} disabled={!studentTurns}>Finish</button>
        </div>
      )}
    </div>
  )
}

function PartnerLine({ turn, onReplay }) {
  const [ru, setRu] = useState(false)
  return (
    <div className="speaking-bubble partner">
      <div>{turn.text}</div>
      {ru && turn.ru && <div className="speaking-ru">{turn.ru}</div>}
      <div className="speaking-tools">
        <button type="button" className="ghost" onClick={onReplay}>🔊 Again</button>
        {turn.ru && <button type="button" className="ghost" onClick={() => setRu(!ru)}>{ru ? 'Hide translation' : 'Перевод'}</button>}
      </div>
    </div>
  )
}

function StudentLine({ turn }) {
  const c = turn.correction
  return (
    <div className="speaking-me">
      <div className="speaking-bubble me">{turn.text}</div>
      {c && (c.ok
        ? <div className="speaking-fix ok">✓ Good</div>
        : <div className="speaking-fix"><b>Better:</b> {c.better}{c.note && <div className="muted">{c.note}</div>}</div>)}
    </div>
  )
}
