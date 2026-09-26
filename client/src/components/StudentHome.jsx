import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { PackageBadge } from './PackageBadge'
import ActivityHeatmap from './ActivityHeatmap'
import Panel from './Panel'
import LiveLesson from './LiveLesson'

// The student's first screen: everything they might want is one click away.
export default function StudentHome({ classrooms }) {
  const [units, setUnits] = useState(null)
  const [sets, setSets] = useState(null)
  const [homework, setHomework] = useState(null)
  const [billing, setBilling] = useState(null)
  const [mistakes, setMistakes] = useState(null)
  // Whether the Advent trainer is connected: it lives in the Practice section
  // (no tile of its own — six tiles make an even grid).
  const [trainer, setTrainer] = useState(false)

  useEffect(() => {
    api.listUnits().then(({ units }) => setUnits(units)).catch(() => setUnits([]))
    api.listVocabSets().then(({ sets }) => setSets(sets)).catch(() => setSets([]))
    api.studentHome().then(({ homework }) => setHomework(homework)).catch(() => setHomework(null))
    api.myBilling().then(({ billing }) => setBilling(billing)).catch(() => setBilling(null))
    api.mistakePractice().then(({ exercises }) => setMistakes(exercises)).catch(() => setMistakes([]))
    api.adventStatus().then(({ connected }) => setTrainer(connected)).catch(() => {})
  }, [])

  const classroom = classrooms[0] ?? null
  const nextUnit = units?.find((u) => u.solved < u.total) ?? units?.[0] ?? null
  const due = sets?.reduce((n, s) => n + s.due, 0) ?? 0
  const words = sets?.find((s) => s.personal)
  const pkg = billing?.package

  return (
    <>
      <LiveLesson />
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

          {/* The Practice section: grammar units and (when connected) the speaking trainer. */}
          <Link className="tile" to="/practice">
            <span className="tile-kicker">Practice</span>
            <strong>Train your grammar</strong>
            <span className="muted">
              {nextUnit ? `${nextUnit.title} · ${nextUnit.solved} of ${nextUnit.total} done` : units === null ? 'Loading…' : 'Grammar units'}
              {trainer ? ' · speaking trainer' : ''}
            </span>
          </Link>

          <Link className="tile" to={due > 0 ? '/vocabulary?review=1' : (words ? `/vocabulary/${words.id}` : '/vocabulary')}>
            <span className="tile-kicker">Vocabulary</span>
            <strong>Learn and revise new words</strong>
            <span className="muted">
              {due > 0 ? `${due} to review` : 'All reviewed'}
              {words ? ` · ${words.total} in From my board` : ' · double-click a word on the board to save it'}
            </span>
          </Link>

          <Link className="tile" to={mistakes?.length ? '/practice/mistakes' : (classroom ? `/classroom/${classroom.id}` : '/practice')}>
            <span className="tile-kicker">Mistake notebook</span>
            <strong>Get rid of mistakes</strong>
            <span className="muted">
              {mistakes?.length ? `${mistakes.length} from your lessons to drill` : 'Mistakes your teacher notes in lessons collect here.'}
            </span>
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
      <Panel
        id="student:activity"
        title="Your activity"
        actions={billing?.trial?.reportId ? <Link className="button" to={`/report/${billing.trial.reportId}`}>Study plan</Link> : null}
      >
        <ActivityHeatmap />
      </Panel>

      <div style={{ textAlign: 'center', padding: '20px 0', color: '#666' }}>
        <p style={{ fontSize: 13, margin: 0 }}>
          New to the platform?{' '}
          <a href="/student-guide.html" target="_blank" rel="noopener noreferrer" style={{ color: '#6366f1', textDecoration: 'none' }}>
            Read the student guide
          </a>
        </p>
      </div>
    </>
  )
}
