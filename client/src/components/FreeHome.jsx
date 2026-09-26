import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../AuthContext'
import { openTrialOffer } from './TrialOffer'

// The first screen of a free account (signed up in the app, no teacher yet):
// what is open, what a lesson looks like, and the way to a trial lesson.
export default function FreeHome() {
  const { user } = useAuth()
  const [units, setUnits] = useState(null)
  const [sets, setSets] = useState(null)
  const [trainer, setTrainer] = useState(false)

  useEffect(() => {
    api.listUnits().then(({ units }) => setUnits(units)).catch(() => setUnits([]))
    api.listVocabSets().then(({ sets }) => setSets(sets)).catch(() => setSets([]))
    api.adventStatus().then(({ connected }) => setTrainer(connected)).catch(() => {})
  }, [])

  const open = units?.filter((u) => !u.locked) ?? []
  const nextUnit = open.find((u) => u.solved < u.total) ?? open[0]
  const due = sets?.reduce((n, s) => n + s.due, 0) ?? 0
  const requested = user.trialRequestedAt

  return (
    <>
      <div className="free-plan">
        <p>
          <strong>Free plan.</strong>{' '}
          <span className="muted">
            {units ? `${open.length} of ${units.length} grammar units` : 'Part of the grammar'}, the dictionary, your own vocabulary and the speaking trainer's trial.
          </span>
        </p>
        <button type="button" onClick={openTrialOffer}>{requested ? 'Trial lesson requested ✓' : 'Get a trial lesson'}</button>
      </div>

      <section>
        <div className="tiles-grid">
          <Link className="tile accent" to="/try-board">
            <span className="tile-kicker">Lessons</span>
            <strong>Try the lesson board</strong>
            <span className="muted">Write, draw and move things around — then see how a video lesson starts.</span>
          </Link>

          <Link className="tile" to={nextUnit ? `/practice/${nextUnit.id}` : '/practice'}>
            <span className="tile-kicker">Practice</span>
            <strong>Train your grammar</strong>
            <span className="muted">
              {nextUnit ? `${nextUnit.title} · ${nextUnit.solved} of ${nextUnit.total} done` : units === null ? 'Loading…' : 'Grammar units'}
            </span>
          </Link>

          <Link className="tile" to="/dictionary">
            <span className="tile-kicker">Dictionary</span>
            <strong>Look up a word</strong>
            <span className="muted">Russian ⇄ English, with sound. Save words to learn them.</span>
          </Link>

          <Link className="tile" to={due > 0 ? '/vocabulary?review=1' : '/vocabulary'}>
            <span className="tile-kicker">Vocabulary</span>
            <strong>Learn and revise new words</strong>
            <span className="muted">{due > 0 ? `${due} to review` : 'Your saved words and word sets'}</span>
          </Link>

          {trainer && (
            <Link className="tile" to="/trainer">
              <span className="tile-kicker">Speaking</span>
              <strong>Practice speaking</strong>
              <span className="muted">Talk to the trainer and get corrected — the trial is free.</span>
            </Link>
          )}

          <button type="button" className="tile tile-button" onClick={openTrialOffer}>
            <span className="tile-kicker">With a teacher</span>
            <strong>{requested ? 'Your request is in' : 'Book a trial lesson'}</strong>
            <span className="muted">
              {requested
                ? "We'll get in touch to arrange it. Tap to add something."
                : 'Video lessons, homework, your mistake notebook and everything else unlocked.'}
            </span>
          </button>
        </div>
      </section>
    </>
  )
}
