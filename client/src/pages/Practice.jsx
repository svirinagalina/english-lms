import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { api } from '../api'
import Nav from '../components/Nav'

export default function Practice() {
  const { user } = useAuth()
  const [units, setUnits] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [focus, setFocus] = useState(null)

  useEffect(() => {
    api.statsMe().then(setFocus).catch(() => setFocus(null))
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

      {focus?.suggestions?.length > 0 && (
        <section>
          <h2>Worth practising</h2>
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
        </section>
      )}

      {units.length === 0 && !error && (
        <p className="muted" style={{ marginTop: 24 }}>
          No units yet. The textbook has not been imported for this school.
        </p>
      )}

      <section>
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
      </section>
    </div>
  )
}
