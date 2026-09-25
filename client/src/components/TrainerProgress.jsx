import { useEffect, useState } from 'react'
import { api } from '../api'
import Panel from './Panel'

// The student's grammar topics in the Advent trainer, by status. Shown only
// when the trainer is connected and knows this student.
const GROUPS = [
  ['weak', 'To work on'],
  ['review', 'Time to review'],
  ['learning', 'Learning'],
  ['confirmed', 'Mastered']
]
const topicName = (t) => String(t).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())

export default function TrainerProgress({ classroomId }) {
  const [data, setData] = useState(null)
  useEffect(() => {
    let live = true
    api.adventStatus()
      .then(({ connected }) => (connected ? api.adventProgress(classroomId) : null))
      .then((d) => { if (live) setData(d) })
      .catch(() => { if (live) setData(null) })
    return () => { live = false }
  }, [classroomId])
  if (!data) return null
  const weak = data.topics?.weak?.length ?? 0
  return (
    <Panel id={`room:trainer:${classroomId}`} title="Trainer" hint={data.found ? `${data.plan ?? ''}${data.pro ? ' · PRO' : ''}` : 'not started'} count={weak || undefined}>
      {!data.found && <p className="muted">The student hasn’t opened the trainer yet.</p>}
      {data.found && (
        <div className="trainer-topics">
          {GROUPS.map(([key, label]) => {
            const items = data.topics?.[key] ?? []
            if (!items.length) return null
            return (
              <div key={key}>
                <div className="muted small-hint">{label}</div>
                <div className="mistake-tags">
                  {items.map((t) => (
                    <span key={t.topic} className="mistake-tag" title={`${t.correct ?? 0} right · ${t.wrong ?? 0} wrong`}>
                      {topicName(t.topic)}{t.wrong ? ` · ${t.wrong}✗` : ''}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
          {!GROUPS.some(([key]) => data.topics?.[key]?.length) && <p className="muted">No topics practised yet ({data.total_topics ?? 0} in the course).</p>}
        </div>
      )}
    </Panel>
  )
}
