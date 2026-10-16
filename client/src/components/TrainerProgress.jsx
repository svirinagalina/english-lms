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

export default function TrainerProgress({ classroomId, focus = false }) {
  const [data, setData] = useState(null)
  useEffect(() => {
    let live = true
    api.adventStatus()
      .then(({ connected }) => (connected ? api.adventProgress(classroomId) : null))
      .then((d) => { if (live) setData(d) })
      .catch(() => { if (live) setData(null) })
    return () => { live = false }
  }, [classroomId])
  // Opened from the owner's activity page (?trainer=1): unfolded and in view.
  useEffect(() => {
    if (focus && data) document.getElementById('trainer-progress')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [focus, data])
  if (!data) return null
  const weak = data.topics?.weak?.length ?? 0
  return (
    <>
    <div id="trainer-progress" />
    <Panel id={`room:trainer:${classroomId}`} forceOpen={focus} title="Trainer" hint={data.found ? `${data.plan ?? ''}${data.pro ? ' · PRO' : ''}` : 'not started'} count={weak || undefined}>
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
    </>
  )
}
