import { Fragment, useState } from 'react'

// Lesson blocks imported from Edvibe (scripts/import-edvibe.js): formatted
// theory and the interactive exercise types. Text arrives with only <b>, <i>
// and line breaks, and is rendered as React nodes — never as HTML.

export function RichText({ text }) {
  const nodes = []
  let bold = false
  let italic = false
  String(text ?? '').split(/(<\/?[bi]>|\n)/).forEach((piece, i) => {
    if (piece === '<b>') bold = true
    else if (piece === '</b>') bold = false
    else if (piece === '<i>') italic = true
    else if (piece === '</i>') italic = false
    else if (piece === '\n') nodes.push(<br key={i} />)
    else if (piece) {
      let node = piece
      if (italic) node = <em>{node}</em>
      if (bold) node = <strong>{node}</strong>
      nodes.push(<Fragment key={i}>{node}</Fragment>)
    }
  })
  return nodes
}

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase()

function Title({ text }) {
  return text ? <strong className="course-activity-title">{text}</strong> : null
}

function Actions({ checked, canCheck, onCheck, onReset, score }) {
  return (
    <div className="row-actions" style={{ marginTop: 10 }}>
      {!checked
        ? <button className="ghost" disabled={!canCheck} onClick={onCheck}>Check</button>
        : <><span className="course-feedback">{score}</span><button className="ghost" onClick={onReset}>Try again</button></>}
    </div>
  )
}

// Test: one question at a time is overkill for 5–10 translations; all on
// the page, one Check at the bottom.
export function ChoiceBlock({ payload }) {
  const [picked, setPicked] = useState({})
  const [checked, setChecked] = useState(false)
  const gradable = payload.questions.filter((q) => q.correct.length)
  const right = gradable.filter((q) => q.correct.includes(picked[payload.questions.indexOf(q)])).length
  return (
    <div className="course-block">
      <Title text={payload.title} />
      {payload.questions.map((q, qi) => (
        <div key={qi} className="course-exercise">
          <div className="course-exercise-q">{qi + 1}. {q.question}</div>
          <div className="course-exercise-options">
            {q.options.map((opt, oi) => {
              const isRight = checked && q.correct.includes(oi)
              const isWrong = checked && picked[qi] === oi && q.correct.length && !q.correct.includes(oi)
              return (
                <button key={oi} disabled={checked}
                  className={`course-option ${picked[qi] === oi ? 'selected' : ''} ${isRight ? 'correct' : ''} ${isWrong ? 'wrong' : ''}`}
                  onClick={() => setPicked({ ...picked, [qi]: oi })}>{opt}</button>
              )
            })}
          </div>
          {checked && !q.correct.length && <div className="muted">The answer isn't marked for this one — ask your teacher.</div>}
        </div>
      ))}
      <Actions checked={checked} canCheck={Object.keys(picked).length > 0} onCheck={() => setChecked(true)}
        onReset={() => { setPicked({}); setChecked(false) }} score={`${right} of ${gradable.length} correct`} />
    </div>
  )
}

// Text with a choice inside it: [has gone / went].
export function SelectTextBlock({ payload }) {
  const [picked, setPicked] = useState({})
  const [checked, setChecked] = useState(false)
  let total = 0
  let right = 0
  const texts = payload.texts.map((t, ti) => (
    <div key={ti} className="course-exercise course-flow">
      {t.question && <div className="course-exercise-q">{t.question}</div>}
      <div>
        {t.parts.map((p, pi) => {
          if (typeof p === 'string') return <RichText key={pi} text={p} />
          const key = `${ti}.${pi}`
          const value = picked[key] ?? ''
          const state = checked && p.correct !== null ? (Number(value) === p.correct && value !== '' ? 'correct' : 'wrong') : ''
          if (p.correct !== null) { total++; if (state === 'correct') right++ }
          return (
            <select key={pi} className={`course-inline-select ${state}`} value={value} disabled={checked}
              onChange={(e) => setPicked({ ...picked, [key]: e.target.value })}>
              <option value="">…</option>
              {p.options.map((o, oi) => <option key={oi} value={oi}>{o}</option>)}
            </select>
          )
        })}
      </div>
    </div>
  ))
  return (
    <div className="course-block">
      <Title text={payload.title} />
      {texts}
      <Actions checked={checked} canCheck={Object.keys(picked).length > 0} onCheck={() => setChecked(true)}
        onReset={() => { setPicked({}); setChecked(false) }} score={`${right} of ${total} correct`} />
    </div>
  )
}

// Drag a word from the bank into a gap. On a phone (or without a mouse):
// tap a word, then tap the gap. A filled gap goes back to the bank on tap.
export function DragWordsBlock({ payload }) {
  const [filled, setFilled] = useState({}) // gap → bank index
  const [held, setHeld] = useState(null) // bank index picked up by tap
  const [checked, setChecked] = useState(false)
  const used = new Set(Object.values(filled))
  const place = (gap, bankIndex) => {
    if (checked || bankIndex == null) return
    const next = Object.fromEntries(Object.entries(filled).filter(([, b]) => b !== bankIndex))
    next[gap] = bankIndex
    setFilled(next)
    setHeld(null)
  }
  const clear = (gap) => { if (checked) return; const next = { ...filled }; delete next[gap]; setFilled(next) }
  const right = payload.answers.filter((a, g) => filled[g] != null && norm(payload.bank[filled[g]]) === norm(a)).length

  return (
    <div className="course-block">
      <Title text={payload.title} />
      <div className="course-word-bank">
        {payload.bank.map((w, i) => (
          <button key={i} type="button" draggable={!checked && !used.has(i)} disabled={checked || used.has(i)}
            className={`course-chip ${held === i ? 'held' : ''}`}
            onDragStart={(e) => e.dataTransfer.setData('text/plain', String(i))}
            onClick={() => setHeld(held === i ? null : i)}>{w}</button>
        ))}
      </div>
      <div className="course-flow">
        {payload.parts.map((p, pi) => {
          if (typeof p === 'string') return <RichText key={pi} text={p} />
          const b = filled[p.gap]
          const state = checked ? (b != null && norm(payload.bank[b]) === norm(payload.answers[p.gap]) ? 'correct' : 'wrong') : ''
          return (
            <span key={pi} className={`course-gap ${b != null ? 'filled' : ''} ${held != null && b == null ? 'ready' : ''} ${state}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); place(p.gap, Number(e.dataTransfer.getData('text/plain'))) }}
              onClick={() => (held != null ? place(p.gap, held) : b != null && clear(p.gap))}>
              {b != null ? payload.bank[b] : ' '}
              {checked && state === 'wrong' && <small className="course-gap-answer"> {payload.answers[p.gap]}</small>}
            </span>
          )
        })}
      </div>
      <Actions checked={checked} canCheck={used.size > 0} onCheck={() => setChecked(true)}
        onReset={() => { setFilled({}); setHeld(null); setChecked(false) }} score={`${right} of ${payload.answers.length} correct`} />
    </div>
  )
}

// Build the sentence: tap the words in order; tap a placed word to take it back.
export function WordOrderBlock({ payload }) {
  const [built, setBuilt] = useState(() => payload.items.map(() => []))
  const [checked, setChecked] = useState(false)
  const isRight = (item, i) => built[i].map((k) => item.shown[k]).join(' ') === item.words.join(' ')
  const right = payload.items.filter(isRight).length
  const update = (i, change) => setBuilt((all) => all.map((b, j) => (j === i ? change(b) : b)))
  return (
    <div className="course-block">
      <Title text={payload.title || 'Put the words in order'} />
      {payload.items.map((item, i) => (
        <div key={i} className="course-exercise">
          <div className={`course-sentence ${checked ? (isRight(item, i) ? 'correct' : 'wrong') : ''}`}>
            {built[i].length === 0 && <span className="muted">Tap the words in order…</span>}
            {built[i].map((k, pos) => (
              <button key={pos} className="course-chip" disabled={checked} onClick={() => update(i, (b) => b.filter((_, p) => p !== pos))}>{item.shown[k]}</button>
            ))}
          </div>
          <div className="course-word-bank">
            {item.shown.map((w, k) => (
              <button key={k} className="course-chip" disabled={checked || built[i].includes(k)} onClick={() => update(i, (b) => (b.includes(k) ? b : [...b, k]))}>{w}</button>
            ))}
          </div>
          {checked && !isRight(item, i) && <div className="muted">Answer: {item.words.join(' ')}</div>}
        </div>
      ))}
      <Actions checked={checked} canCheck={built.some((b) => b.length)} onCheck={() => setChecked(true)}
        onReset={() => { setBuilt(payload.items.map(() => [])); setChecked(false) }} score={`${right} of ${payload.items.length} correct`} />
    </div>
  )
}

// Sort the words into columns: drag, or tap a word and then a column.
export function GroupsBlock({ payload }) {
  const [where, setWhere] = useState({}) // bank index → group index
  const [held, setHeld] = useState(null)
  const [checked, setChecked] = useState(false)
  const groupOf = (w) => payload.groups.findIndex((g) => g.words.some((x) => norm(x) === norm(w)))
  const put = (i, g) => { if (checked || i == null) return; setWhere({ ...where, [i]: g }); setHeld(null) }
  const back = (i) => { if (checked) return; const next = { ...where }; delete next[i]; setWhere(next) }
  const right = payload.bank.filter((w, i) => where[i] === groupOf(w)).length
  const loose = payload.bank.map((w, i) => i).filter((i) => where[i] == null)
  return (
    <div className="course-block">
      <Title text={payload.title} />
      <div className="course-word-bank">
        {loose.map((i) => (
          <button key={i} className={`course-chip ${held === i ? 'held' : ''}`} draggable={!checked} disabled={checked}
            onDragStart={(e) => e.dataTransfer.setData('text/plain', String(i))} onClick={() => setHeld(held === i ? null : i)}>{payload.bank[i]}</button>
        ))}
      </div>
      <div className="course-columns">
        {payload.groups.map((g, gi) => (
          <div key={gi} className={`course-column ${held != null ? 'ready' : ''}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); put(Number(e.dataTransfer.getData('text/plain')), gi) }}
            onClick={() => held != null && put(held, gi)}>
            <strong>{g.name}</strong>
            <div className="course-word-bank">
              {payload.bank.map((w, i) => where[i] === gi && (
                <button key={i} className={`course-chip ${checked ? (groupOf(w) === gi ? 'correct' : 'wrong') : ''}`}
                  onClick={(e) => { e.stopPropagation(); back(i) }}>{w}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <Actions checked={checked} canCheck={Object.keys(where).length > 0} onCheck={() => setChecked(true)}
        onReset={() => { setWhere({}); setChecked(false) }} score={`${right} of ${payload.bank.length} correct`} />
    </div>
  )
}
