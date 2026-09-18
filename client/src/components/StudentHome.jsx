import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { PackageBadge } from './PackageBadge'
import ActivityHeatmap from './ActivityHeatmap'

// The student's first screen: everything they might want is one click away.
export default function StudentHome({ classrooms }) {
  const [units, setUnits] = useState(null)
  const [sets, setSets] = useState(null)
  const [homework, setHomework] = useState(null)
  const [billing, setBilling] = useState(null)
  const [mistakes, setMistakes] = useState(null)

  useEffect(() => {
    api.listUnits().then(({ units }) => setUnits(units)).catch(() => setUnits([]))
    api.listVocabSets().then(({ sets }) => setSets(sets)).catch(() => setSets([]))
    api.studentHome().then(({ homework }) => setHomework(homework)).catch(() => setHomework(null))
    api.myBilling().then(({ billing }) => setBilling(billing)).catch(() => setBilling(null))
    api.mistakePractice().then(({ exercises }) => setMistakes(exercises)).catch(() => setMistakes([]))
  }, [])

  const classroom = classrooms[0] ?? null
  const nextUnit = units?.find((u) => u.solved < u.total) ?? units?.[0] ?? null
  const due = sets?.reduce((n, s) => n + s.due, 0) ?? 0
  const words = sets?.find((s) => s.personal)
  const pkg = billing?.package

  return (
    <>
      <section>
        <div className="tiles-grid">
          {classroom && (
            <Link className="tile" to={`/classroom/${classroom.id}`}>
              <span className="tile-kicker">Lessons with {classroom.teacher.name}</span>
              <strong>My board</strong>
              <span className="muted">
                {classroom.lastSession ? `Last lesson ${new Date(classroom.lastSession).toLocaleDateString()}` : 'No lessons yet'} · Writing is here too
              </span>
            </Link>
          )}

          <Link className={`tile ${homework ? 'accent' : ''}`} to={homework ? `/classroom/${homework.classroomId}?board=${homework.boardId}&focus=${homework.elementId}` : (classroom ? `/classroom/${classroom.id}` : '/practice')}>
            <span className="tile-kicker">Homework</span>
            {homework ? (
              <>
                <strong>From {new Date(homework.updatedAt).toLocaleDateString()}</strong>
                <span className="muted tile-lines">
                  {homework.lines.length ? homework.lines.join(' · ') : 'See the board'}
                  {homework.more > 0 && ` · +${homework.more} more`}
                </span>
              </>
            ) : (
              <>
                <strong>Nothing set yet</strong>
                <span className="muted">Your teacher's homework appears here.</span>
              </>
            )}
          </Link>

          <Link className="tile" to={nextUnit ? `/practice/${nextUnit.id}` : '/practice'}>
            <span className="tile-kicker">Practice</span>
            {nextUnit ? (
              <>
                <strong>{nextUnit.title}</strong>
                <span className="muted">{nextUnit.solved} of {nextUnit.total} done · continue</span>
              </>
            ) : (
              <>
                <strong>Grammar practice</strong>
                <span className="muted">{units === null ? 'Loading…' : 'No units yet'}</span>
              </>
            )}
          </Link>

          <Link className="tile" to={words ? `/vocabulary/${words.id}` : '/vocabulary'}>
            <span className="tile-kicker">Vocabulary</span>
            <strong>{due > 0 ? `${due} ${due === 1 ? 'word' : 'words'} to review` : 'All words reviewed'}</strong>
            <span className="muted">
              {words ? `${words.total} in My words` : 'Double-click a word on the board to save it'}
            </span>
          </Link>

          <Link className="tile" to={mistakes?.length ? '/practice/mistakes' : (classroom ? `/classroom/${classroom.id}` : '/practice')}>
            <span className="tile-kicker">Mistake notebook</span>
            {mistakes?.length ? (
              <>
                <strong>{mistakes.length} to drill</strong>
                <span className="muted">From your lessons — say them right.</span>
              </>
            ) : (
              <>
                <strong>Empty so far</strong>
                <span className="muted">Mistakes your teacher notes in lessons collect here.</span>
              </>
            )}
          </Link>

          {pkg && (pkg.lessonsPaid != null || billing.priceAmount != null) && (
            <Link className="tile" to="/billing">
              <span className="tile-kicker">Lessons</span>
              <strong>{pkg.lessonsPaid != null ? `${Math.max(0, pkg.remaining)} left` : `${pkg.held} held`}</strong>
              <span><PackageBadge pkg={pkg} /></span>
            </Link>
          )}
        </div>
      </section>
      <section>
        <h2>Your activity</h2>
        <ActivityHeatmap />
      </section>
    </>
  )
}
