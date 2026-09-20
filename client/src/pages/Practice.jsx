import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { api } from '../api'
import Nav from '../components/Nav'
import Panel from '../components/Panel'
import { SiteFooter } from '../components/Brand'

export default function Practice() {
  const { user } = useAuth()
  const [units, setUnits] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [focus, setFocus] = useState(null)
  const [mistakes, setMistakes] = useState([])

  useEffect(() => {
    api.statsMe().then(setFocus).catch(() => setFocus(null))
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

      {units.length === 0 && !error && (
        <p className="muted" style={{ marginTop: 24 }}>
          No units yet. The textbook has not been imported for this school.
        </p>
      )}

      <Panel id="practice:units" title="Grammar units" count={units.length} defaultOpen>
        <div className="list">
          {units.map((unit) => {
            const percent = unit.total ? Math.round((unit.solved / unit.total) * 100) : 0

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
