import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { api } from '../api'

export default function Practice() {
  const { user, logout } = useAuth()
  const [units, setUnits] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.listUnits()
      .then(({ units }) => setUnits(units))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="centered">Loading…</div>

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <strong>Practice</strong>
          <span className="muted"> · {user.name}</span>
        </div>
        <div className="row-actions">
          <Link className="ghost" to="/">Dashboard</Link>
          <button className="ghost" onClick={logout}>Sign out</button>
        </div>
      </header>

      {error && <div className="error">{error}</div>}

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
