import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { PlayButton } from './WordCard'

// The teacher's dictionary: type any word or phrase, in Russian or English.
// Russian gives the English equivalents (IPA, a play button, a note on when
// each fits); English gives the Russian entry. `onAdd`, when given, puts an
// English result into the current student's vocabulary.
export default function DictionaryPanel({ onClose, onAdd }) {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [added, setAdded] = useState({})
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const search = async (event, text) => {
    event?.preventDefault()
    const q = (text ?? query).trim()
    if (!q || busy) return
    setBusy(true); setError(''); setResult(null); setAdded({})
    try {
      setResult(await api.translate(q))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const add = async (term) => {
    setAdded((a) => ({ ...a, [term]: 'adding' }))
    try {
      await onAdd(term)
      setAdded((a) => ({ ...a, [term]: 'done' }))
    } catch {
      setAdded((a) => ({ ...a, [term]: null }))
    }
  }

  const addButton = (term) => onAdd && (
    <button type="button" className="tool dict-add" disabled={Boolean(added[term])} onClick={() => add(term)} title="Put it into the student's vocabulary">
      {added[term] === 'done' ? '✓ Added' : added[term] === 'adding' ? 'Adding…' : '+ Vocabulary'}
    </button>
  )

  return (
    <div className="dict-panel" onPointerDown={(e) => e.stopPropagation()}>
      <div className="dict-head">
        <strong>Dictionary</strong>
        <span className="muted">Russian ⇄ English</span>
        <button type="button" className="word-card-close" onClick={onClose} title="Close (Esc)" aria-label="Close">×</button>
      </div>
      <form onSubmit={search} className="dict-form">
        <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="слово или фраза / a word or phrase" maxLength={80} />
        <button type="submit" disabled={busy || !query.trim()}>{busy ? '…' : 'Find'}</button>
      </form>
      {error && <div className="error">{error}</div>}
      {result?.direction === 'ru-en' && (
        result.items.length ? (
          <ul className="dict-results">
            {result.items.map((item) => (
              <li key={item.english}>
                <div className="dict-row">
                  <strong>{item.english}</strong>
                  {item.transcription && <span className="muted">{item.transcription}</span>}
                  <PlayButton src={item.audio} small />
                  {addButton(item.english)}
                </div>
                {(item.pos || item.note) && <div className="muted dict-note">{[item.pos, item.note].filter(Boolean).join(' · ')}</div>}
                <Grammar forms={item.forms} countability={item.countability} />
              </li>
            ))}
          </ul>
        ) : <div className="muted">Nothing found.</div>
      )}
      {result?.direction === 'en-ru' && result.entry.suggestion && (
        <div className="dict-results">
          <div className="dict-suggest">
            <span className="muted">«{result.query}» — такого слова нет. Возможно, вы имели в виду:</span>{' '}
            <button type="button" className="link-button" onClick={() => { setQuery(result.entry.suggestion); search(null, result.entry.suggestion) }}>{result.entry.suggestion}</button>
          </div>
        </div>
      )}
      {result?.direction === 'en-ru' && !result.entry.suggestion && (
        <div className="dict-results">
          <div className="dict-row">
            <strong>{result.query}</strong>
            {result.entry.transcription && <span className="muted">{result.entry.transcription}</span>}
            <PlayButton src={result.entry.audio} small />
            {addButton(result.query)}
          </div>
          <Grammar forms={result.grammar?.forms} countability={result.grammar?.countability} />
          {result.entry.senses?.length
            ? <ul className="word-senses">{result.entry.senses.map((s) => <li key={s.pos}><em>{s.pos}</em> {s.translations.join(', ')}</li>)}</ul>
            : <div>{result.entry.translation}</div>}
        </div>
      )}
    </div>
  )
}

// A verb's three forms and a noun's countability, when the word has them.
function Grammar({ forms, countability }) {
  if (!forms && !countability) return null
  return (
    <div className="dict-grammar">
      {forms && <span className="dict-forms">{forms}</span>}
      {countability && <span className="dict-count">{countability}</span>}
    </div>
  )
}
