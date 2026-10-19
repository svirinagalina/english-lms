import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api'
import Nav from '../components/Nav'
import Panel from '../components/Panel'
import { TASK_INFO, rawToBand } from '../toefl/shared'
import '../styles/toefl.css'

// TOEFL results: a student sees their own sets, tests and the feedback on
// written/spoken answers; a teacher sees their students' and scores them.

const date = (d) => new Date(d).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function Review({ work, onSaved }) {
  const [score, setScore] = useState(work.teacherScore ?? '')
  const [comment, setComment] = useState(work.teacherComment ?? '')
  const [busy, setBusy] = useState(false)
  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    try { onSaved(await api.toeflReview(work.id, { teacherScore: score === '' ? null : Number(score), teacherComment: comment })) } finally { setBusy(false) }
  }
  return (
    <form className="toefl-review" onSubmit={save}>
      <label>Оценка 0–5 <input type="number" min="0" max="5" step="0.5" value={score} onChange={(e) => setScore(e.target.value)} style={{ width: 80 }} /></label>
      <textarea rows={2} placeholder="Комментарий ученику" value={comment} onChange={(e) => setComment(e.target.value)} />
      <button type="submit" disabled={busy}>{busy ? 'Сохраняю…' : 'Сохранить'}</button>
    </form>
  )
}

function Work({ work, staff, onSaved }) {
  const ai = work.aiFeedback
  const final = work.teacherScore ?? work.aiScore
  return (
    <div className="toefl-work">
      <div className="toefl-work-head">
        <b>{TASK_INFO[work.task]?.name ?? work.task}</b>
        {staff && <span> · {work.user.name}</span>}
        <span className="muted"> · {date(work.createdAt)}</span>
        {final != null && <span className="toefl-pill">{final} / 5 · band {rawToBand(final)}{work.teacherScore != null ? ' · учитель' : ' · ИИ'}</span>}
      </div>
      <details>
        <summary>Задание и ответ</summary>
        <div className="course-text muted">{work.prompt}</div>
        {work.audioPath && <audio controls src={work.audioPath} style={{ width: '100%', marginTop: 8 }} />}
        {work.text && <div className="course-text" style={{ marginTop: 8 }}>{work.audioPath ? 'Распознано: ' : ''}{work.text}</div>}
      </details>
      {ai && (ai.summary || ai.improve?.length > 0) && (
        <div className="toefl-ai">
          {ai.score != null && <div className="muted">ИИ: {ai.score} / 5</div>}
          {ai.summary && <p>{ai.summary}</p>}
          {ai.improve?.length > 0 && <ul>{ai.improve.map((s, i) => <li key={i}>{s}</li>)}</ul>}
          {ai.corrected && work.task !== 'listen-repeat' && <details><summary>Исправленный вариант</summary><div className="course-text">{ai.corrected}</div></details>}
        </div>
      )}
      {!staff && work.teacherComment && <div className="notice">Преподаватель: {work.teacherComment}</div>}
      {staff && <Review work={work} onSaved={onSaved} />}
    </div>
  )
}

export default function ToeflResults() {
  const [params] = useSearchParams()
  const userId = params.get('student')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { api.toeflOverview(userId).then(setData).catch((e) => setError(e.message)) }, [userId])
  if (error) return <div className="page"><Nav title="TOEFL" back="/courses" /><div className="error">{error}</div></div>
  if (!data) return <div className="centered">Loading…</div>
  const { staff } = data
  const toReview = data.works.filter((w) => w.teacherScore == null && !w.teacherComment)
  const reviewed = data.works.filter((w) => !toReview.includes(w))
  const replace = (row) => setData({ ...data, works: data.works.map((w) => (w.id === row.id ? { ...w, ...row } : w)) })
  const tests = data.results.filter((r) => r.kind === 'test')
  const sets = data.results.filter((r) => r.kind === 'set')

  return (
    <div className="page">
      <Nav title="TOEFL results" back="/courses" />
      {staff && (
        <Panel id="toefl-review" title="Ждут проверки" count={toReview.length || undefined} defaultOpen>
          {toReview.length === 0 ? <p className="muted">Новых работ нет.</p> : toReview.map((w) => <Work key={w.id} work={w} staff onSaved={replace} />)}
        </Panel>
      )}
      <Panel id="toefl-tests" title="Пробные тесты" count={tests.length || undefined} defaultOpen={!staff}>
        {tests.length === 0 ? <p className="muted">Пока нет пройденных тестов.</p> : (
          <table className="toefl-table">
            <thead><tr>{staff && <th>Ученик</th>}<th>Тест</th><th>Overall</th><th>R</th><th>L</th><th>W</th><th>S</th><th>Дата</th></tr></thead>
            <tbody>{tests.map((r) => (
              <tr key={r.id}>{staff && <td>{r.user.name}</td>}<td>{r.title}</td><td><b>{r.band ?? '—'}</b></td>
                {['reading', 'listening', 'writing', 'speaking'].map((s) => <td key={s}>{r.detail?.[s]?.band ?? '—'}</td>)}
                <td className="muted">{date(r.createdAt)}</td></tr>
            ))}</tbody>
          </table>
        )}
      </Panel>
      <Panel id="toefl-sets" title="Тренировочные наборы" count={sets.length || undefined}>
        {sets.length === 0 ? <p className="muted">Пока пусто.</p> : (
          <table className="toefl-table">
            <thead><tr>{staff && <th>Ученик</th>}<th>Задание</th><th>Набор</th><th>Баллы</th><th>Band</th><th>Дата</th></tr></thead>
            <tbody>{sets.map((r) => (
              <tr key={r.id}>{staff && <td>{r.user.name}</td>}<td>{TASK_INFO[r.task]?.name ?? r.task}</td><td>{r.title}</td><td>{r.correct}/{r.total}</td><td>{r.band ?? '—'}</td><td className="muted">{date(r.createdAt)}</td></tr>
            ))}</tbody>
          </table>
        )}
      </Panel>
      <Panel id="toefl-works" title={staff ? 'Проверенные работы' : 'Мои письма и ответы'} count={(staff ? reviewed : data.works).length || undefined} defaultOpen={!staff}>
        {(staff ? reviewed : data.works).length === 0 ? <p className="muted">Пока пусто.</p>
          : (staff ? reviewed : data.works).map((w) => <Work key={w.id} work={w} staff={staff} onSaved={replace} />)}
      </Panel>
    </div>
  )
}
