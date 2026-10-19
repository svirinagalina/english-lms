import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { RichText } from '../components/CourseActivities'
import { TaskView } from './tasks'
import { TASK_INFO, shareToBand, rawToBand, clampBand, roundHalf, oldScale } from './shared'
import '../styles/toefl.css'

// Course blocks of the TOEFL course:
//   type "toefl"      — one practice set of one task type, Test or Study mode
//   type "toefl-test" — a full simulation test (adaptive Reading/Listening)

function ModeSwitch({ mode, setMode, disabled }) {
  return (
    <div className="toefl-mode">
      <button type="button" disabled={disabled} className={mode === 'test' ? 'on' : ''} onClick={() => setMode('test')}>Test Mode</button>
      <button type="button" disabled={disabled} className={mode === 'study' ? 'on' : ''} onClick={() => setMode('study')}>Study Mode</button>
    </div>
  )
}

const WRITTEN = new Set(['email', 'discussion', 'listen-repeat', 'interview'])

export function ToeflSetBlock({ block }) {
  const p = block.payload
  const info = TASK_INFO[p.task] ?? { section: 'TOEFL', name: p.task }
  const [mode, setMode] = useState('test')
  const [run, setRun] = useState(0) // 0 = not started
  const [result, setResult] = useState(null)

  const done = (r) => {
    setResult(r)
    if (r.total != null) {
      api.toeflResult({ blockId: block.id, kind: 'set', task: p.task, title: p.title ?? info.name, correct: r.correct, total: r.total, band: shareToBand(r.correct / Math.max(1, r.total)) }).catch(() => {})
    }
  }
  return (
    <div className="course-block toefl-block">
      <div className="toefl-head">
        <div>
          <div className="toefl-kicker">{info.section} · {info.name}</div>
          <strong className="toefl-title">{p.title ?? info.name}</strong>
        </div>
        <ModeSwitch mode={mode} setMode={setMode} disabled={run > 0 && !result} />
      </div>
      {run === 0 ? (
        <div className="toefl-intro">
          {p.about && <p><RichText text={p.about} /></p>}
          <p className="muted">{mode === 'test'
            ? 'Test Mode: as in the exam — a timer, audio plays once, answers at the end.'
            : 'Study Mode: no timer, the script is open, check each answer and read the explanation.'}</p>
          <button type="button" onClick={() => setRun(1)}>Start</button>
        </div>
      ) : (
        <>
          <TaskView key={run} p={p} ctx={{ blockId: block.id }} mode={mode} onDone={done} />
          {result && (
            <div className="toefl-score">
              <span>{result.total != null
                ? <>Result: <b>{result.correct} / {result.total}</b> · band ≈ <b>{shareToBand(result.correct / Math.max(1, result.total))}</b></>
                : WRITTEN.has(p.task) && result.raw != null ? <>Score: <b>{roundHalf(result.raw)} / 5</b> · band ≈ <b>{rawToBand(result.raw)}</b></> : <>Saved — your teacher will review it.</>}</span>
              <button type="button" className="ghost" onClick={() => { setResult(null); setRun(run + 1) }}>Try again</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ---- Simulation test ----------------------------------------------------

const SECTIONS = ['reading', 'listening', 'writing', 'speaking']
const SECTION_NAME = { reading: 'Reading', listening: 'Listening', writing: 'Writing', speaking: 'Speaking' }
const ROUTE_UP = 0.6 // share of the first module needed for the harder second one

// The plan: every task the test will show, in order. Reading and Listening
// get their second module only after the first is scored.
function firstSteps(test) {
  const steps = []
  for (const s of SECTIONS) {
    const sec = test.sections[s]
    if (!sec) continue
    steps.push({ kind: 'intro', section: s })
    if (sec.routing) sec.routing.forEach((t, i) => steps.push({ kind: 'task', section: s, module: 'routing', task: t, path: `sections.${s}.routing.${i}` }))
    else sec.tasks.forEach((t, i) => steps.push({ kind: 'task', section: s, module: 'tasks', task: t, path: `sections.${s}.tasks.${i}` }))
    if (sec.routing) steps.push({ kind: 'route', section: s })
  }
  steps.push({ kind: 'results' })
  return steps
}

function bandsFrom(test, log) {
  const out = {}
  for (const s of SECTIONS) {
    const rows = log.filter((r) => r.section === s)
    if (!rows.length) continue
    if (test.sections[s].routing) {
      const routed = rows.find((r) => r.route)?.route
      const c = rows.reduce((a, r) => a + (r.correct ?? 0), 0)
      const t = rows.reduce((a, r) => a + (r.total ?? 0), 0)
      const share = c / Math.max(1, t)
      const band = routed === 'upper' ? clampBand(2.5 + 3.5 * share) : Math.min(4.5, clampBand(1 + 3.5 * share))
      out[s] = { band, correct: c, total: t, route: routed }
    } else {
      // A written/spoken part the AI could not score waits for the teacher;
      // a band from the other parts alone would mislead.
      const raws = rows.map((r) => (r.total != null ? (r.correct / Math.max(1, r.total)) * 5 : r.raw))
      const pending = raws.some((v) => v == null)
      out[s] = { band: pending ? null : rawToBand(raws.reduce((a, b) => a + b, 0) / raws.length), pending }
    }
  }
  const bands = Object.values(out).map((x) => x.band).filter((b) => b != null)
  const partial = bands.length < Object.keys(out).length
  return { sections: out, partial, overall: bands.length ? roundHalf(bands.reduce((a, b) => a + b, 0) / bands.length) : null }
}

export function ToeflTestBlock({ block }) {
  const test = block.payload
  const [steps, setSteps] = useState(null)
  const [at, setAt] = useState(0)
  const [log, setLog] = useState([])
  const [waiting, setWaiting] = useState(false) // task finished, Continue shown
  const saved = useRef(false)

  const start = () => { setSteps(firstSteps(test)); setAt(0); setLog([]); setWaiting(false); saved.current = false }
  const step = steps?.[at]

  const next = (logNow = log) => {
    setWaiting(false)
    const following = steps[at + 1]
    if (following?.kind === 'route') {
      // Score the first module and splice in the second one.
      const s = following.section
      const rows = logNow.filter((r) => r.section === s)
      const share = rows.reduce((a, r) => a + r.correct, 0) / Math.max(1, rows.reduce((a, r) => a + r.total, 0))
      const route = share >= ROUTE_UP ? 'upper' : 'lower'
      const tasks = test.sections[s][route].map((t, i) => ({ kind: 'task', section: s, module: route, task: t, path: `sections.${s}.${route}.${i}` }))
      setLog([...logNow, { section: s, route }])
      setSteps([...steps.slice(0, at + 1), ...tasks, ...steps.slice(at + 2)])
    }
    setAt(at + 1)
  }

  const taskDone = (r) => {
    const row = { section: step.section, task: step.task.task, ...r }
    const logNow = [...log, row]
    setLog(logNow)
    setWaiting(true)
  }

  // Results: saved once, when the last written/spoken score has arrived.
  const results = step?.kind === 'results' ? bandsFrom(test, log) : null
  if (results && !saved.current) {
    saved.current = true
    const c = log.reduce((a, r) => a + (r.correct ?? 0), 0)
    const t = log.reduce((a, r) => a + (r.total ?? 0), 0)
    api.toeflResult({ blockId: block.id, kind: 'test', task: 'full', title: test.title, correct: c, total: t, band: results.overall, detail: results.sections }).catch(() => {})
  }

  if (!steps) {
    return (
      <div className="course-block toefl-block">
        <div className="toefl-head"><div><div className="toefl-kicker">Simulation test</div><strong className="toefl-title">{test.title}</strong></div></div>
        <div className="toefl-intro">
          <p>A full TOEFL iBT test in the 2026 format: Reading → Listening → Writing → Speaking. Reading and Listening are adaptive:
            the second module is harder or easier depending on how you did in the first. You get a band for each section (1–6),
            an overall band and an approximate score on the old 0–120 scale.</p>
          <p className="muted">About {test.minutes ?? 85} minutes. Use headphones and allow the microphone. Writing and Speaking are scored by AI right away and checked by your teacher.</p>
          <button type="button" onClick={start}>Start the test</button>
        </div>
      </div>
    )
  }

  return (
    <div className="course-block toefl-block toefl-sim">
      <div className="toefl-head">
        <div><div className="toefl-kicker">{test.title}</div>
          <strong className="toefl-title">{step.kind === 'results' ? 'Your results' : SECTION_NAME[step.section]}{step.kind === 'task' ? ` · ${TASK_INFO[step.task.task]?.name}` : ''}</strong></div>
        {step.kind === 'task' && step.module !== 'tasks' && <span className="muted">Module {step.module === 'routing' ? 1 : 2}</span>}
      </div>

      {step.kind === 'intro' && (
        <div className="toefl-intro">
          <p><RichText text={test.sections[step.section].intro ?? `The ${SECTION_NAME[step.section]} section starts now.`} /></p>
          <button type="button" onClick={() => next()}>Begin {SECTION_NAME[step.section]}</button>
        </div>
      )}

      {step.kind === 'task' && (
        <>
          <TaskView key={at} p={step.task} ctx={{ blockId: block.id, path: step.path }} mode="test" onDone={taskDone} quiet />
          {waiting && <div className="toefl-score"><span className="muted">Saved.</span><button type="button" onClick={() => next()}>Continue →</button></div>}
        </>
      )}

      {results && (
        <div className="toefl-results">
          <div className="toefl-overall">Overall band <b>{results.overall ?? '—'}</b>{results.partial && <span className="muted"> · preliminary, without the parts your teacher will score</span>}</div>
          <table className="toefl-table">
            <thead><tr><th>Section</th><th>Band (1–6)</th><th>≈ old scale (0–30)</th><th /></tr></thead>
            <tbody>
              {SECTIONS.filter((s) => results.sections[s]).map((s) => {
                const r = results.sections[s]
                return (
                  <tr key={s}>
                    <td>{SECTION_NAME[s]}</td>
                    <td><b>{r.band ?? '—'}</b></td>
                    <td>{r.band != null ? oldScale(r.band) : '—'}</td>
                    <td className="muted">{r.total != null ? `${r.correct}/${r.total} · module 2: ${r.route === 'upper' ? 'harder' : 'easier'}` : r.pending ? 'part waits for the teacher' : ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {results.overall != null && !results.partial && <p>≈ <b>{Object.values(results.sections).reduce((a, r) => a + (r.band != null ? oldScale(r.band) : 0), 0)}</b> / 120 on the old scale (a guide, not an official conversion).</p>}
          <p className="muted">Detailed feedback on your writing and speaking is on the <Link to="/toefl">TOEFL results</Link> page.</p>
          <button type="button" className="ghost" onClick={() => setSteps(null)}>Close</button>
        </div>
      )}
    </div>
  )
}
