import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { api } from '../api'
import Nav from '../components/Nav'
import { SiteFooter } from '../components/Brand'

export default function Vocabulary() {
  const { user } = useAuth()
  const [sets, setSets] = useState([])
  const [title, setTitle] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const isStaff = user.role !== 'STUDENT'

  const refresh = () =>
    api.listVocabSets()
      .then(({ sets }) => setSets(sets))
      .catch((err) => setError(err.message))

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [])

  const handleCreate = async (event) => {
    event.preventDefault()
    setError('')
    try {
      await api.createVocabSet({ title })
      setTitle('')
      await refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) return <div className="centered">Loading…</div>

  return (
    <div className="page">
      <Nav title="Vocabulary" />

      {error && <div className="error">{error}</div>}

      <section>
        {isStaff && (
          <form className="inline-form" onSubmit={handleCreate}>
            <input
              placeholder="New set title, e.g. Unit 3 — Food"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
            <button type="submit">Create set</button>
          </form>
        )}

        {!isStaff && !sets.some((set) => set.personal) && (
          <p className="muted" style={{ marginBottom: 10 }}>
            Double-click any word on the board or in Writing to hear it, see its meanings and add it to <strong>My words</strong>.
          </p>
        )}
        {sets.length === 0 && <p className="muted">No sets yet.</p>}

        <div className="list">
          {sets.map((set) => (
            <Link key={set.id} className="row unit-row" to={`/vocabulary/${set.id}`}>
              <div className="unit-main">
                <strong>{set.title}</strong>
                <div className="muted">{set.total} {set.total === 1 ? 'word' : 'words'}{set.personal ? ' · your own words, with pronunciation' : ''}</div>
              </div>
              {set.due > 0 && <span className="due-badge">{set.due} to review</span>}
            </Link>
          ))}
        </div>
      </section>
      <SiteFooter />
    </div>
  )
}
