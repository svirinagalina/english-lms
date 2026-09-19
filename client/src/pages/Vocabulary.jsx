import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { api } from '../api'
import Nav from '../components/Nav'
import { SiteFooter } from '../components/Brand'
import { Study } from './VocabSet'

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

  const [searchParams] = useSearchParams()
  const [reviewing, setReviewing] = useState(searchParams.get('review') === '1')
  const [renaming, setRenaming] = useState(null)
  const [titleDraft, setTitleDraft] = useState('')
  const saveTitle = async (id) => {
    setError('')
    try {
      await api.renameVocabSet(id, titleDraft.trim())
      setRenaming(null)
      await refresh()
    } catch (err) {
      setError(err.message)
    }
  }
  const removeSet = async (set) => {
    if (!window.confirm(`Delete "${set.title}" with all ${set.total} words? This cannot be undone.`)) return
    try {
      await api.deleteVocabSet(set.id)
      await refresh()
    } catch (err) {
      setError(err.message)
    }
  }

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

  const due = sets.reduce((n, s) => n + s.due, 0)
  const total = sets.reduce((n, s) => n + s.total, 0)

  if (reviewing) {
    return (
      <div className="page practice-page">
        <header className="topbar">
          <div className="row-actions">
            <button className="ghost back-link" onClick={() => { setReviewing(false); refresh() }}>← Back</button>
            <strong>Words to review</strong>
          </div>
        </header>
        <Study loader={api.dueWords} onExit={() => { setReviewing(false); refresh() }} />
      </div>
    )
  }

  return (
    <div className="page">
      <Nav title="Vocabulary" />

      {error && <div className="error">{error}</div>}

      {total > 0 && (
        <section>
          <div className="row">
            <div>
              <strong>{due > 0 ? `${due} ${due === 1 ? 'word is' : 'words are'} due for review` : 'Nothing due today'}</strong>
              <div className="muted">
                Spaced repetition: a word you knew comes back in 1, then 3, 7, 14 and 30 days; a word you missed comes back tomorrow. {total} words in all.
              </div>
            </div>
            {due > 0 && <button onClick={() => setReviewing(true)}>Review now</button>}
          </div>
        </section>
      )}

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
        {sets.length === 0 && (
          <p className="muted">
            {isStaff
              ? 'No sets yet. Create one above and add words one by one or paste a whole list (word — translation).'
              : 'No word sets yet. Words you save from the board or Writing will appear here as “My words”.'}
          </p>
        )}

        <div className="list">
          {sets.map((set) => (
            <div key={set.id} className="row set-row">
              {renaming === set.id ? (
                <form className="row-actions" style={{ flex: 1 }} onSubmit={(e) => { e.preventDefault(); saveTitle(set.id) }}>
                  <input autoFocus value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} maxLength={200} required style={{ flex: 1 }} />
                  <button type="submit">Save</button>
                  <button type="button" className="ghost" onClick={() => setRenaming(null)}>Cancel</button>
                </form>
              ) : (
                <>
                  <Link className="unit-main student-link" to={`/vocabulary/${set.id}`}>
                    <strong>{set.title}</strong>
                    <div className="muted">{set.total} {set.total === 1 ? 'word' : 'words'}{set.personal ? ' · your own words, with pronunciation' : ''}</div>
                  </Link>
                  <div className="row-actions">
                    {set.due > 0 && <span className="due-badge">{set.due} to review</span>}
                    {(isStaff || set.personal) && (
                      <button className="ghost" onClick={() => { setTitleDraft(set.title); setRenaming(set.id) }} title="Rename">Rename</button>
                    )}
                    {isStaff && !set.personal && (
                      <button className="ghost" onClick={() => removeSet(set)} title="Delete this set and all its words">Delete</button>
                    )}
                    <Link className="button" to={`/vocabulary/${set.id}`}>Open</Link>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </section>
      <SiteFooter />
    </div>
  )
}
