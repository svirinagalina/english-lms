import { Fragment, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { RichText } from '../components/CourseActivities'
import { AiResult, Listen, TimerBadge, useCountdown, useRecorder, shuffled, seedOf, fmtTime } from './shared'

// The TOEFL 2026 task types. Every task takes:
//   p     — the task payload (from the course data)
//   ctx   — { blockId, path } so the server can find the task again
//   mode  — 'test' (timer, one listening, results at the end) | 'study'
//   onDone(result) — { correct, total } for scored tasks, { raw } (0–5 or
//                    null) for written/spoken ones.

function Nav({ index, count, setIndex, onSubmit, submitLabel = 'Submit answers' }) {
  return (
    <div className="toefl-nav">
      <button type="button" className="ghost" disabled={index === 0} onClick={() => setIndex(index - 1)}>← Back</button>
      <span className="muted">{index + 1} / {count}</span>
      {index < count - 1
        ? <button type="button" onClick={() => setIndex(index + 1)}>Next →</button>
        : onSubmit && <button type="button" onClick={onSubmit}>{submitLabel}</button>}
    </div>
  )
}

function Options({ q, picked, onPick, reveal }) {
  return (
    <div className="course-exercise-options">
      {q.options.map((opt, oi) => {
        const right = reveal && oi === q.answer
        const wrong = reveal && picked === oi && oi !== q.answer
        return (
          <button key={oi} type="button" disabled={reveal}
            className={`course-option ${picked === oi ? 'selected' : ''} ${right ? 'correct' : ''} ${wrong ? 'wrong' : ''}`}
            onClick={() => onPick(oi)}>{String.fromCharCode(65 + oi)}. {opt}</button>
        )
      })}
    </div>
  )
}

function Explain({ q }) {
  return q.explain ? <div className="toefl-explain"><RichText text={q.explain} /></div> : null
}

// Reading in daily life / academic passage, and the three listening tasks
// with questions (conversation, announcement, academic talk).
export function QuestionSet({ p, mode, onDone }) {
  const listening = Boolean(p.script || p.audio)
  const test = mode === 'test'
  const [heard, setHeard] = useState(!listening || !test)
  const [index, setIndex] = useState(0)
  const [picked, setPicked] = useState({})
  const [checked, setChecked] = useState({}) // study: per-question reveal
  const [finished, setFinished] = useState(false)
  const qs = p.questions
  const submit = () => {
    if (finished) return
    setFinished(true)
    onDone?.({ correct: qs.filter((q, i) => picked[i] === q.answer).length, total: qs.length })
  }
  const left = useCountdown(test ? p.timeSec ?? 0 : 0, test && heard && !finished, submit)
  const q = qs[index]
  const reveal = finished || checked[index]

  return (
    <div className="toefl-task">
      <div className="toefl-task-bar">
        <span className="muted">{p.instructions ?? (listening ? 'Listen, then answer the questions.' : 'Read the text and answer the questions.')}</span>
        <TimerBadge left={left} total={test ? p.timeSec : 0} />
      </div>
      <div className={listening ? 'toefl-listening' : 'toefl-split'}>
        {listening ? (
          <div className="toefl-stimulus">
            {p.context && <p className="muted">{p.context}</p>}
            <Listen script={p.script} audio={p.audio} once={test} onEnded={() => setHeard(true)} showScript={!test || finished} />
          </div>
        ) : (
          <div className="toefl-passage">
            {p.passageTitle && <h4>{p.passageTitle}</h4>}
            {String(p.passage).split('\n\n').map((para, i) => <p key={i}><RichText text={para} /></p>)}
          </div>
        )}
        <div className="toefl-questions">
          {!heard ? <p className="muted">The questions appear after the audio.</p> : (
            <>
              <div className="course-exercise-q">{index + 1}. {q.question}</div>
              <Options q={q} picked={picked[index]} reveal={reveal} onPick={(oi) => setPicked({ ...picked, [index]: oi })} />
              {!test && !reveal && <button type="button" className="ghost" disabled={picked[index] == null} onClick={() => setChecked({ ...checked, [index]: true })}>Check</button>}
              {reveal && <Explain q={q} />}
              <Nav index={index} count={qs.length} setIndex={setIndex} onSubmit={finished ? null : submit} submitLabel={test ? 'Submit answers' : 'Finish'} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// "Coral reefs are {{one}} of the…" — each {{word}} shows its first half;
// the student types the rest.
const GAP = /\{\{([^}]+)\}\}/g
export function CompleteWords({ p, mode, onDone }) {
  const test = mode === 'test'
  const parts = useMemo(() => {
    const out = []
    let last = 0
    let m
    let n = 0
    const text = String(p.text)
    GAP.lastIndex = 0
    while ((m = GAP.exec(text))) {
      out.push(text.slice(last, m.index))
      const word = m[1]
      const shown = word.slice(0, Math.floor(word.length / 2))
      out.push({ n: n++, word, shown, rest: word.slice(shown.length) })
      last = m.index + m[0].length
    }
    out.push(text.slice(last))
    return out
  }, [p.text])
  const gaps = parts.filter((x) => typeof x !== 'string')
  const [typed, setTyped] = useState({})
  const [finished, setFinished] = useState(false)
  const isRight = (g) => (typed[g.n] ?? '').trim().toLowerCase() === g.rest.toLowerCase()
  const submit = () => {
    if (finished) return
    setFinished(true)
    onDone?.({ correct: gaps.filter(isRight).length, total: gaps.length })
  }
  const left = useCountdown(test ? p.timeSec ?? 0 : 0, test && !finished, submit)
  return (
    <div className="toefl-task">
      <div className="toefl-task-bar">
        <span className="muted">Fill in the missing letters in the paragraph.</span>
        <TimerBadge left={left} total={test ? p.timeSec : 0} />
      </div>
      <div className="toefl-passage toefl-cw">
        {parts.map((x, i) => typeof x === 'string' ? <Fragment key={i}>{x}</Fragment> : (
          <span key={i} className={`toefl-cw-word ${finished ? (isRight(x) ? 'ok' : 'bad') : ''}`}>
            {x.shown}
            <input value={typed[x.n] ?? ''} disabled={finished} maxLength={x.rest.length + 2} style={{ width: `${Math.max(2, x.rest.length) + 0.6}ch` }}
              autoCapitalize="off" autoCorrect="off" spellCheck={false}
              onChange={(e) => setTyped({ ...typed, [x.n]: e.target.value.replace(/\s/g, '') })} />
            {finished && !isRight(x) && <small className="toefl-cw-key">{x.word}</small>}
          </span>
        ))}
      </div>
      {!finished && <div className="row-actions"><button type="button" onClick={submit}>{test ? 'Submit answers' : 'Check'}</button></div>}
    </div>
  )
}

// Hear a line, pick the best reply.
export function ChooseResponse({ p, mode, onDone }) {
  const test = mode === 'test'
  const [index, setIndex] = useState(0)
  const [heard, setHeard] = useState({})
  const [picked, setPicked] = useState({})
  const [checked, setChecked] = useState({})
  const [finished, setFinished] = useState(false)
  const items = p.items
  const submit = () => {
    if (finished) return
    setFinished(true)
    onDone?.({ correct: items.filter((q, i) => picked[i] === q.answer).length, total: items.length })
  }
  const left = useCountdown(test ? p.timeSec ?? 0 : 0, test && !finished, submit)
  const q = items[index]
  const reveal = finished || checked[index]
  return (
    <div className="toefl-task">
      <div className="toefl-task-bar">
        <span className="muted">Listen to the speaker and choose the best response.</span>
        <TimerBadge left={left} total={test ? p.timeSec : 0} />
      </div>
      <div className="toefl-questions">
        <div className="course-exercise-q">{index + 1}.</div>
        <Listen key={index} audio={q.audio} script={q.prompt} once={test} label="Play the speaker" onEnded={() => setHeard({ ...heard, [index]: true })} />
        {(reveal || !test) && <p className="muted">“{q.prompt}”</p>}
        {(heard[index] || !test || reveal) && (
          <Options q={q} picked={picked[index]} reveal={reveal} onPick={(oi) => setPicked({ ...picked, [index]: oi })} />
        )}
        {!test && !reveal && <button type="button" className="ghost" disabled={picked[index] == null} onClick={() => setChecked({ ...checked, [index]: true })}>Check</button>}
        {reveal && <Explain q={q} />}
        <Nav index={index} count={items.length} setIndex={setIndex} onSubmit={finished ? null : submit} submitLabel={test ? 'Submit answers' : 'Finish'} />
      </div>
    </div>
  )
}

// Put the chunks of a reply in order. `chunks` are in the right order;
// `distractor` (optional) is an extra chunk that does not belong.
export function BuildSentence({ p, mode, onDone }) {
  const test = mode === 'test'
  const items = p.items
  const [index, setIndex] = useState(0)
  const [built, setBuilt] = useState(() => items.map(() => []))
  const [checked, setChecked] = useState({})
  const [finished, setFinished] = useState(false)
  const bank = useMemo(() => items.map((it) => {
    const all = [...it.chunks, ...(it.distractor ? [it.distractor] : [])]
    const out = shuffled(all, seedOf(it.chunks.join(' ')))
    // Never hand over the answer ready-made.
    return out.slice(0, it.chunks.length).join(' ') === it.chunks.join(' ') ? [...out.slice(1), out[0]] : out
  }), [items])
  const isRight = (i) => {
    const said = built[i].map((k) => bank[i][k]).join(' ')
    const want = [items[i].chunks.join(' '), ...(items[i].alt ?? [])]
    return want.some((w) => w.toLowerCase() === said.toLowerCase())
  }
  const submit = () => {
    if (finished) return
    setFinished(true)
    onDone?.({ correct: items.filter((_, i) => isRight(i)).length, total: items.length })
  }
  const left = useCountdown(test ? p.timeSec ?? 0 : 0, test && !finished, submit)
  const it = items[index]
  const reveal = finished || checked[index]
  const update = (fn) => setBuilt((all) => all.map((b, j) => (j === index ? fn(b) : b)))
  return (
    <div className="toefl-task">
      <div className="toefl-task-bar">
        <span className="muted">Make an appropriate sentence: put the words in order.</span>
        <TimerBadge left={left} total={test ? p.timeSec : 0} />
      </div>
      <div className="toefl-questions">
        <div className="toefl-bs-context"><b>{it.speakerA ?? 'A'}:</b> {it.context}</div>
        <div className={`course-sentence ${reveal ? (isRight(index) ? 'correct' : 'wrong') : ''}`}>
          <b>{it.speakerB ?? 'B'}:</b>&nbsp;{it.prefix && <span>{it.prefix}&nbsp;</span>}
          {built[index].map((k, pos) => (
            <button key={pos} type="button" className="course-chip" disabled={reveal} onClick={() => update((b) => b.filter((_, x) => x !== pos))}>{bank[index][k]}</button>
          ))}
          {built[index].length === 0 && <span className="muted">tap the words…</span>}
          <span>{it.end ?? '.'}</span>
        </div>
        <div className="course-word-bank">
          {bank[index].map((w, k) => (
            <button key={k} type="button" className="course-chip" disabled={reveal || built[index].includes(k)} onClick={() => update((b) => [...b, k])}>{w}</button>
          ))}
        </div>
        {!test && !reveal && <button type="button" className="ghost" disabled={!built[index].length} onClick={() => setChecked({ ...checked, [index]: true })}>Check</button>}
        {reveal && !isRight(index) && <div className="muted">Answer: {it.prefix ? `${it.prefix} ` : ''}{it.chunks.join(' ')}{it.end ?? '.'}</div>}
        {reveal && it.explain && <div className="toefl-explain"><RichText text={it.explain} /></div>}
        <Nav index={index} count={items.length} setIndex={setIndex} onSubmit={finished ? null : submit} submitLabel={test ? 'Submit answers' : 'Finish'} />
      </div>
    </div>
  )
}

const wordCount = (s) => (String(s).trim().match(/\S+/g) ?? []).length

// Write an Email (7 min) and Academic Discussion (10 min).
export function WriteTask({ p, ctx, mode, onDone, quiet = false }) {
  const test = mode === 'test'
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const sent = useRef(false)
  const submit = async () => {
    if (sent.current) return
    sent.current = true
    setBusy(true); setError('')
    try {
      const r = await api.toeflWrite({ blockId: ctx.blockId, path: ctx.path, task: p.task, text: text.trim() || '(no answer)' })
      setResult(r)
      onDone?.({ raw: r.ai?.score ?? null })
    } catch (err) { setError(err.message); sent.current = false } finally { setBusy(false) }
  }
  const left = useCountdown(test ? p.timeSec ?? 0 : 0, test && !result, submit)
  const email = p.task === 'email'
  return (
    <div className="toefl-task">
      <div className="toefl-task-bar">
        <span className="muted">{email ? `Write an email. You have ${fmtTime(p.timeSec ?? 420)}.` : `Write a post for the discussion. You have ${fmtTime(p.timeSec ?? 600)}.`}</span>
        <TimerBadge left={left} total={test ? p.timeSec : 0} />
      </div>
      <div className="toefl-split">
        <div className="toefl-passage">
          {email ? (
            <>
              <p>{p.scenario}</p>
              <p><b>Write an email to {p.toName ?? 'the recipient'}. In your email:</b></p>
              <ul>{p.points.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </>
          ) : (
            <>
              <p className="muted">{p.intro ?? 'Your professor is teaching a class. Write a post responding to the professor\'s question. In your response, express and support your opinion and make a contribution to the discussion.'}</p>
              <div className="toefl-post prof"><b>{p.professor.name}</b><p>{p.professor.text}</p></div>
              {p.students.map((s, i) => <div key={i} className="toefl-post"><b>{s.name}</b><p>{s.text}</p></div>)}
            </>
          )}
        </div>
        <div className="toefl-questions">
          {email && <div className="toefl-email-head"><div><span className="muted">To:</span> {p.to}</div><div><span className="muted">Subject:</span> {p.subject}</div></div>}
          <textarea className="course-writing toefl-writing" rows={12} value={text} disabled={Boolean(result) || busy} spellCheck={false}
            placeholder="Type your answer…" onChange={(e) => setText(e.target.value)} />
          <div className="toefl-nav">
            <span className="muted">Words: {wordCount(text)}{email ? ' (aim for 100–150)' : ' (aim for 100+)'}</span>
            {!result && <button type="button" disabled={busy || !text.trim()} onClick={submit}>{busy ? 'Scoring…' : 'Submit'}</button>}
          </div>
          {error && <div className="error">{error}</div>}
          {result && !quiet && <AiResult ai={result.ai} aiOff={result.aiOff} />}
          {result && !quiet && !test && p.sample && <details><summary>Sample answer</summary><div className="course-text">{p.sample}</div></details>}
          {result && quiet && <div className="notice">Saved. Your score will be in the results.</div>}
        </div>
      </div>
    </div>
  )
}

// One recorded answer: listen to the prompt, then speak for `seconds`.
function SpeakItem({ prompt, num, audio, seconds, ctx, task, item, mode, onSaved, autoStart, showText }) {
  const test = mode === 'test'
  const { recording, error, start, stop } = useRecorder()
  const [phase, setPhase] = useState('listen') // listen | ready | rec | saving | done
  const [res, setRes] = useState(null)
  const [upErr, setUpErr] = useState('')
  const finishRec = async () => {
    if (phase !== 'rec') return
    setPhase('saving')
    const out = await stop()
    try {
      const r = await api.toeflSpeak({ blockId: ctx.blockId, path: ctx.path, task, item, blob: out?.blob, transcript: out?.transcript ?? '' })
      setRes(r)
      onSaved?.(r)
    } catch (err) { setUpErr(err.message); onSaved?.(null) }
    setPhase('done')
  }
  const left = useCountdown(seconds, phase === 'rec', finishRec)
  const begin = async () => { if (await start()) setPhase('rec') }
  return (
    <div className="toefl-speak">
      {(showText || !test) && <div className="course-exercise-q">{num ? `${num}. ` : ''}{prompt}</div>}
      <Listen audio={audio} script={prompt} once={test} autoPlay={test && autoStart} label="Listen" onEnded={() => { setPhase((ph) => (ph === 'listen' ? 'ready' : ph)); if (autoStart) begin() }} />
      {phase === 'ready' && !recording && <button type="button" onClick={begin}>🎙 Start speaking ({seconds} s)</button>}
      {phase === 'listen' && !test && <button type="button" className="ghost" onClick={begin}>🎙 Record without listening</button>}
      {phase === 'rec' && (
        <div className="toefl-rec"><span className="toefl-rec-dot" /> Recording… {fmtTime(left)} <button type="button" className="ghost" onClick={finishRec}>Stop</button></div>
      )}
      {phase === 'saving' && <p className="muted">Saving…</p>}
      {error && <div className="error">{error}</div>}
      {upErr && <div className="error">{upErr}</div>}
      {res && !test && (
        <div className="toefl-ai">
          {res.audioPath && <audio controls src={res.audioPath} style={{ width: '100%' }} />}
          <div className="muted">Распознано: {res.transcript || '—'}</div>
          {res.ai && (res.ai.score != null
            ? <div>Оценка: <b>{res.ai.score} / 5</b>{res.ai.summary ? ` — ${res.ai.summary}` : ''}</div>
            : <div className="muted">{res.ai.summary}</div>)}
          {res.ai?.improve?.length > 0 && <ul>{res.ai.improve.map((s, i) => <li key={i}>{s}</li>)}</ul>}
        </div>
      )}
    </div>
  )
}

// Listen and Repeat (7 sentences, 8–12 s each) and Take an Interview
// (4 questions, 45 s each).
export function SpeakTask({ p, ctx, mode, onDone }) {
  const test = mode === 'test'
  const repeat = p.task === 'listen-repeat'
  const prompts = repeat ? p.sentences : p.questions
  const audios = repeat ? p.sentenceAudio : p.questionAudio
  const [index, setIndex] = useState(0)
  const scores = useRef({})
  const [doneCount, setDoneCount] = useState(0)
  const finished = doneCount >= prompts.length
  const saved = (i) => (r) => {
    scores.current[i] = r?.ai?.score ?? null
    setDoneCount((n) => n + 1)
    if (Object.keys(scores.current).length === prompts.length) {
      const vals = Object.values(scores.current).filter((v) => v != null)
      onDone?.({ raw: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null })
    }
    if (test && i < prompts.length - 1) setTimeout(() => setIndex(i + 1), 600)
  }
  const seconds = (i) => (repeat ? (p.responseSec?.[i] ?? Math.min(12, Math.max(8, Math.round(prompts[i].split(' ').length * 0.9)))) : (p.responseSec ?? 45))
  return (
    <div className="toefl-task">
      <div className="toefl-task-bar">
        <span className="muted">{p.scenario}</span>
      </div>
      <p className="muted">{repeat ? 'Listen and repeat only once. Recording starts right after the sentence.' : 'Listen to each question and answer it. You have 45 seconds.'}</p>
      {test ? (
        <div className="toefl-questions">
          <div className="muted">{repeat ? 'Sentence' : 'Question'} {index + 1} of {prompts.length}</div>
          <SpeakItem key={index} prompt={prompts[index]} audio={audios?.[index]} seconds={seconds(index)} ctx={ctx} task={p.task} item={index}
            mode={mode} autoStart onSaved={saved(index)} showText={false} />
          {finished && <div className="notice">All answers are saved.</div>}
        </div>
      ) : (
        <div className="toefl-questions">
          {prompts.map((q, i) => (
            <SpeakItem key={i} num={i + 1} prompt={q} audio={audios?.[i]} seconds={seconds(i)} ctx={ctx} task={p.task} item={i}
              mode={mode} onSaved={saved(i)} showText />
          ))}
        </div>
      )}
    </div>
  )
}

export function TaskView(props) {
  const t = props.p.task
  if (t === 'complete-words') return <CompleteWords {...props} />
  if (t === 'choose-response') return <ChooseResponse {...props} />
  if (t === 'build-sentence') return <BuildSentence {...props} />
  if (t === 'email' || t === 'discussion') return <WriteTask {...props} />
  if (t === 'listen-repeat' || t === 'interview') return <SpeakTask {...props} />
  return <QuestionSet {...props} />
}
