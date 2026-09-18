import { useEffect, useState } from 'react'
import { api } from '../api'

const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// A GitHub-style calendar of the last half year: darker = more done that day.
export default function ActivityHeatmap({ studentId = null, weeks = 26, compact = false }) {
  const [data, setData] = useState(null)
  useEffect(() => {
    const load = studentId ? api.activityStudent(studentId) : api.activityMe()
    load.then(setData).catch(() => setData({ days: {}, streak: 0, activeDays: 0 }))
  }, [studentId])
  if (!data) return null

  const today = new Date(); today.setHours(0, 0, 0, 0)
  // Columns are weeks starting on Monday; the last column ends today.
  const end = new Date(today)
  const start = new Date(end); start.setDate(end.getDate() - weeks * 7 + 1)
  while (start.getDay() !== 1) start.setDate(start.getDate() - 1)
  const columns = []
  const cursor = new Date(start)
  while (cursor <= end) {
    const col = []
    for (let i = 0; i < 7 && cursor <= end; i++) { col.push(new Date(cursor)); cursor.setDate(cursor.getDate() + 1) }
    columns.push(col)
  }
  const score = (d) => d ? d.attempts + d.lessons * 8 + d.words * 2 + d.mistakes : 0
  const level = (n) => (n === 0 ? 0 : n < 5 ? 1 : n < 12 ? 2 : n < 25 ? 3 : 4)
  const cell = compact ? 10 : 12
  const gap = 3
  const width = columns.length * (cell + gap)
  const height = 7 * (cell + gap) + 16
  const monthLabels = columns.map((col, i) => {
    const first = col[0]
    const prev = columns[i - 1]?.[0]
    return !prev || prev.getMonth() !== first.getMonth() ? { x: i * (cell + gap), text: MONTHS[first.getMonth()] } : null
  }).filter(Boolean)
  const tip = (date, d) => `${date.toLocaleDateString()}: ${d ? [
    d.lessons ? `${d.lessons} lesson${d.lessons > 1 ? 's' : ''}${d.minutes ? ` (${d.minutes} min)` : ''}` : '',
    d.attempts ? `${d.attempts} practice (${d.correct} right)` : '',
    d.words ? `${d.words} words saved` : '',
    d.mistakes ? `${d.mistakes} mistakes noted` : ''
  ].filter(Boolean).join(', ') : 'nothing'}`

  return (
    <div className="heatmap">
      <div className="heatmap-meta muted">
        {data.activeDays} active {data.activeDays === 1 ? 'day' : 'days'} in the last {weeks} weeks
        {data.streak > 0 && <> · <strong className="streak">🔥 {data.streak}-day streak</strong></>}
      </div>
      <div className="heatmap-scroll">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Activity calendar">
          {monthLabels.map((m) => <text key={m.x} x={m.x} y={10} className="heatmap-month">{m.text}</text>)}
          {columns.map((col, ci) => col.map((date, ri) => {
            const d = data.days[key(date)]
            return (
              <rect
                key={key(date)}
                x={ci * (cell + gap)}
                y={16 + ri * (cell + gap)}
                width={cell}
                height={cell}
                rx={2}
                className={`heat heat-${level(score(d))}`}
              >
                <title>{tip(date, d)}</title>
              </rect>
            )
          }))}
        </svg>
      </div>
    </div>
  )
}
