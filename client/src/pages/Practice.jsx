import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { api } from '../api'
import Nav from '../components/Nav'
import Panel from '../components/Panel'
import { SiteFooter } from '../components/Brand'
import { openTrialOffer } from '../components/TrialOffer'

export default function Practice() {
  const { user } = useAuth()
  const [units, setUnits] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [focus, setFocus] = useState(null)
  const [mistakes, setMistakes] = useState([])
  const [trainer, setTrainer] = useState(false)

  useEffect(() => {
    api.statsMe().then(setFocus).catch(() => setFocus(null))
    api.adventStatus().then(({ connected }) => setTrainer(connected)).catch(() => {})
    if (user.role === 'STUDENT') api.mistakePractice().then(({ exercises }) => setMistakes(exercises)).catch(() => {})
    api.listUnits()
      .then(({ units }) => setUnits(units))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="centered">Loading…</div>

  return (
    <div className="page">
      <Nav title="Practice" />

      {error && <div className="error">{error}</div>}

      {/* The Advent speaking trainer is part of Practice. */}
      {trainer && (
        <section>
          <Link className="row unit-row trainer-row" to="/trainer">
            <div className="unit-main">
              <strong>Practice speaking</strong>
              <div className="muted">The trainer: talk, get corrected, practise your words.</div>
            </div>
            <span className="due-badge">Open</span>
          </Link>
        </section>
      )}

      {mistakes.length > 0 && (
        <section>
          <Link className="row unit-row notebook-row" to="/practice/mistakes">
            <div className="unit-main">
              <strong>My mistakes from lessons</strong>
              <div className="muted">{mistakes.length} {mistakes.length === 1 ? 'sentence' : 'sentences'} your teacher noted — say them right.</div>
            </div>
            <span className="due-badge">Drill</span>
          </Link>
        </section>
      )}

      {focus?.suggestions?.length > 0 && (
        <Panel id="practice:worth" title="Worth practising" count={focus.suggestions.length}>
          <div className="list">
            {focus.suggestions.map((item) => (
              <div key={item.topic} className="row column suggestion">
                <strong>{item.label}</strong>
                <div className="muted">
                  {item.units.map((unit, index) => (
                    <span key={unit.id}>
                      {index > 0 && ' · '}
                      <Link to={`/practice/${unit.id}`}>{unit.title}</Link>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Panel id="practice:units" title="Grammar units" count={units.length} defaultOpen
        hint={user.free ? `${units.filter((u) => !u.locked).length} open on the free plan` : undefined}>
        {user.free && (
          <p className="muted" style={{ marginBottom: 10 }}>
            The free plan opens the first {units.filter((u) => !u.locked).length} units. <button type="button" className="link-button" onClick={openTrialOffer}>A trial lesson unlocks all {units.length}.</button>
          </p>
        )}
        {units.length === 0 && !error && (
          <p className="muted">No units yet. The textbook has not been imported for this school.</p>
        )}
        <div className="list">
          {units.map((unit) => {
            const percent = unit.total ? Math.round((unit.solved / unit.total) * 100) : 0

            // Beyond the free plan: listed, but it opens the trial-lesson offer.
            if (unit.locked) {
              return (
                <button key={unit.id} type="button" className="row unit-row locked-row tile-button" onClick={openTrialOffer}>
                  <div className="unit-main">
                    <strong>{unit.title}</strong>
                    <div className="muted">{unit.total} exercises · with a teacher</div>
                  </div>
                  <span className="locked-badge" aria-label="Locked">🔒</span>
                </button>
              )
            }

            return (
              <Link key={unit.id} className="row unit-row" to={`/practice/${unit.id}`}>
                <div className="unit-main">
                  <strong>{unit.title}</strong>
                  <div className="muted">{unit.solved} of {unit.total} done</div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${percent}%` }} />
                  </div>
                </div>
                <span className="unit-percent">{percent}%</span>
              </Link>
            )
          })}
        </div>
      </Panel>
      <SiteFooter />
    </div>
  )
}
