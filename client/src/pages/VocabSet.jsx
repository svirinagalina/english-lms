import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { PlayButton } from '../components/WordCard'

// `cram`: every card in the set, in deck order, any time — like Anki's cram
// deck — instead of only what the spaced-repetition schedule has due today.
// A cram run never records a result, so it cannot push a card's schedule
// around; it is purely for drilling before, say, a test.
export function Study({ setId, loader, onExit, cram = false, onCram }) {
  const [cards, setCards] = useState(null)
  const [index, setIndex] = useState(0)
  const [mode, setMode] = useState('flip')
  const [revealed, setRevealed] = useState(false)
  const [answer, setAnswer] = useState('')
  const [verdict, setVerdict] = useState(null)
  const [stats, setStats] = useState({ right: 0, wrong: 0 })
  const inputRef = useRef(null)

  useEffect(() => {
    setCards(null); setIndex(0); setStats({ right: 0, wrong: 0 })
    ;(loader ? loader() : api.studyVocab(setId, cram)).then(({ cards }) => setCards(cards))
  }, [setId, loader, cram])

  useEffect(() => {
    if (mode === 'write' && !verdict) inputRef.current?.focus()
  }, [index, mode, verdict])

  if (!cards) return <div className="centered">Loading…</div>

  if (cards.length === 0) {
    return (
      <div className="card done-card">
        <h2>Nothing to review</h2>
        <p className="muted">{cram ? 'This set has no cards yet.' : 'All cards in this set are scheduled for later.'}</p>
        <div className="row-actions" style={{ justifyContent: 'center' }}>
          {!cram && onCram && <button onClick={onCram}>Practice all cards anyway</button>}
          <button className="ghost" onClick={onExit}>Back to the set</button>
        </div>
      </div>
    )
  }

  const card = cards[index]
  const finished = index >= cards.length

  if (finished) {
    return (
      <div className="card done-card">
        <h2>Session complete</h2>
        <p className="muted">Knew: {stats.right} · Missed: {stats.wrong}{cram && " · practice, not counted for review"}</p>
        <button onClick={onExit}>Back to the set</button>
      </div>
    )
  }

  const record = async (correct) => {
    // A cram run drills the whole deck on demand; it never touches the
    // spaced-repetition schedule, so it is safe to run as often as wanted.
    if (!cram) await api.reviewCard(card.id, correct)
    setStats((prev) => ({
      right: prev.right + (correct ? 1 : 0),
      wrong: prev.wrong + (correct ? 0 : 1)
    }))
    setRevealed(false)
    setVerdict(null)
    setAnswer('')
    setIndex((value) => value + 1)
  }

  const handleWrite = async (event) => {
    event.preventDefault()
    if (verdict) return
    const result = await api.checkCard(card.id, answer)
    setVerdict(result)
  }

  return (
    <div className="study">
      <div className="study-head">
        <div className="muted">
          {index + 1} of {cards.length} · knew {stats.right}, missed {stats.wrong}
          {cram && ' · practice run, not counted for review'}
        </div>
        <div className="tool-group">
          <button
            className={`lesson-tab ${mode === 'flip' ? 'active' : ''}`}
            onClick={() => { setMode('flip'); setVerdict(null); setRevealed(false) }}
          >
            Flip
          </button>
          <button
            className={`lesson-tab ${mode === 'write' ? 'active' : ''}`}
            onClick={() => { setMode('write'); setVerdict(null); setRevealed(false) }}
          >
            Write
          </button>
          <button className="ghost" onClick={onExit}>Stop</button>
        </div>
      </div>

      {mode === 'flip' ? (
        <>
          <div className="flashcard" onClick={() => setRevealed((v) => !v)}>
            <div className="flash-term">{card.translation}</div>
            {revealed ? (
              <>
                <div className="flash-answer">{card.term}{card.audio && <> <PlayButton src={card.audio} small /></>}</div>
                {card.transcription && <div className="muted">{card.transcription}</div>}
                {card.example && <div className="muted flash-example">{card.example}</div>}
              </>
            ) : (
              <div className="muted">click to reveal</div>
            )}
          </div>

          {revealed && (
            <div className="study-actions">
              <button className="ghost" onClick={() => record(false)}>Did not know</button>
              <button onClick={() => record(true)}>Knew it</button>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flashcard">
            <div className="flash-term">{card.translation}</div>
          </div>

          <form className="drill" onSubmit={handleWrite}>
            <input
              ref={inputRef}
              className="drill-input"
              placeholder="Write it in English…"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              disabled={Boolean(verdict)}
              autoComplete="off"
              spellCheck="false"
            />
            {!verdict && <button type="submit" disabled={!answer.trim()}>Check</button>}
          </form>

          {verdict && (
            <div className={`verdict ${verdict.correct ? 'right' : 'wrong'}`}>
              <strong>{verdict.correct ? 'Correct' : 'Not quite'}</strong>
              {!verdict.correct && <div className="expected">{verdict.term}{card.audio && <> <PlayButton src={card.audio} small /></>}</div>}
              {verdict.correct && card.audio && <div><PlayButton src={card.audio} small /> <span className="muted">{card.transcription ?? ''}</span></div>}
              <button onClick={() => record(verdict.correct)} autoFocus>Next</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function VocabSet() {
  const { id } = useParams()
  const [set, setSet] = useState(null)
  const [error, setError] = useState('')
  // false, or which kind of session is open: the spaced-repetition queue,
  // or a free run through every card ("cram").
  const [studying, setStudying] = useState(false)
  const [card, setCard] = useState({ term: '', translation: '', example: '' })
  const [bulk, setBulk] = useState('')
  const [showBulk, setShowBulk] = useState(false)
  const [notice, setNotice] = useState('')


  const refresh = () =>
    api.getVocabSet(id)
      .then(({ set }) => setSet(set))
      .catch((err) => setError(err.message))

  useEffect(() => { refresh() }, [id])

  const handleAddCard = async (event) => {
    event.preventDefault()
    setError('')
    try {
      await api.addCard(id, {
        term: card.term,
        translation: card.translation,
        example: card.example.trim() === '' ? null : card.example
      })
      setCard({ term: '', translation: '', example: '' })
      await refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleBulk = async (event) => {
    event.preventDefault()
    setError('')
    try {
      const { added } = await api.addCardsBulk(id, bulk)
      setNotice(`Added ${added} cards`)
      setBulk('')
      setShowBulk(false)
      await refresh()
      setTimeout(() => setNotice(''), 3000)
    } catch (err) {
      setError(err.message)
    }
  }

  const [renaming, setRenaming] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const saveTitle = async (event) => {
    event.preventDefault()
    setError('')
    try {
      await api.renameVocabSet(id, titleDraft.trim())
      setRenaming(false)
      await refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  const navigate = useNavigate()
  const deleteSet = async () => {
    if (!window.confirm(`Delete "${set.title}" with all ${set.cards.length} words? This cannot be undone.`)) return
    try {
      await api.deleteVocabSet(id)
      navigate('/vocabulary')
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDelete = async (cardId) => {
    await api.deleteCard(id, cardId)
    await refresh()
  }

  if (error && !set) {
    return (
      <div className="centered">
        <div className="card">
          <h2>Cannot open this set</h2>
          <p className="error">{error}</p>
          <Link className="button" to="/vocabulary">Back</Link>
        </div>
      </div>
    )
  }

  if (!set) return <div className="centered">Loading…</div>

  return (
    <div className="page practice-page">
      <header className="topbar">
        <div className="row-actions">
          <Link className="ghost back-link" to="/vocabulary">← Back</Link>
          {renaming ? (
            <form className="row-actions" onSubmit={saveTitle}>
              <input autoFocus value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} maxLength={200} required />
              <button type="submit">Save</button>
              <button type="button" className="ghost" onClick={() => setRenaming(false)}>Cancel</button>
            </form>
          ) : (
            <>
              <strong>{set.title}</strong>
              {set.canEdit && !studying && (
                <>
                  <button className="ghost" onClick={() => { setTitleDraft(set.title); setRenaming(true) }} title="Rename this set">Rename</button>
                  {!set.personal && <button className="ghost" onClick={deleteSet} title="Delete this set and all its words">Delete set</button>}
                </>
              )}
            </>
          )}
        </div>
        <div className="row-actions">
          {!studying && set.cards.length > 0 && (
            <>
              <button onClick={() => setStudying('due')}>Study</button>
              <button className="ghost" onClick={() => setStudying('all')} title="Flip through every card, any time — does not affect the review schedule">Practice all cards</button>
            </>
          )}
        </div>
      </header>

      {error && <div className="error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      {studying ? (
        <Study
          setId={id}
          cram={studying === 'all'}
          onCram={() => setStudying('all')}
          onExit={() => { setStudying(false); refresh() }}
        />
      ) : (
        <>
          {set.canEdit && (
            <section>
              <form className="inline-form" onSubmit={handleAddCard}>
                <input
                  placeholder="Word in English"
                  value={card.term}
                  onChange={(e) => setCard({ ...card, term: e.target.value })}
                  required
                />
                <input
                  placeholder="Перевод"
                  value={card.translation}
                  onChange={(e) => setCard({ ...card, translation: e.target.value })}
                  required
                />
                <input
                  placeholder="Example (optional)"
                  value={card.example}
                  onChange={(e) => setCard({ ...card, example: e.target.value })}
                />
                <button type="submit">Add</button>
              </form>

              <button className="ghost" onClick={() => setShowBulk((v) => !v)}>
                {showBulk ? 'Hide bulk paste' : 'Paste a list'}
              </button>

              {showBulk && (
                <form className="details-form" onSubmit={handleBulk} style={{ marginTop: 12 }}>
                  <textarea
                    rows={8}
                    placeholder={'One per line:\nbook — книга\nto run — бегать\nwindow — окно'}
                    value={bulk}
                    onChange={(e) => setBulk(e.target.value)}
                  />
                  <div className="editor-actions">
                    <button type="submit" disabled={!bulk.trim()}>Add all</button>
                    <span className="muted">
                      Separate with a dash, tab or semicolon. A third column becomes the example.
                    </span>
                  </div>
                </form>
              )}
            </section>
          )}

          <section>
            <h2>{set.cards.length} {set.cards.length === 1 ? 'word' : 'words'}</h2>
            {set.personal && set.cards.length === 0 && (
              <p className="muted">Double-click a word on the board or in Writing and press “Add to my words”.</p>
            )}
            <div className="list">
              {set.cards.map((item) => (
                <div key={item.id} className="row">
                  <div>
                    <div className="word-row">
                      <strong>{item.term}</strong>
                      {item.transcription && <span className="muted">{item.transcription}</span>}
                      {item.audio && <PlayButton src={item.audio} small />}
                    </div>
                    <div className="muted">{item.translation}</div>
                    {item.example && <div className="muted flash-example">{item.example}</div>}
                  </div>
                  {set.canEdit && (
                    <button className="ghost" onClick={() => handleDelete(item.id)}>Remove</button>
                  )}
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
