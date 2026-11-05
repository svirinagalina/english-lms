import { useEffect, useState } from 'react'

const MAX_OPTIONS = 10

// Calls the server and always comes back, even if the line dropped mid-way.
const ask = (socketRef, event, ...args) => new Promise((resolve) => {
  const socket = socketRef.current
  if (!socket?.connected) return resolve({ error: 'No connection. Try again in a moment.' })
  socket.timeout(8000).emit(event, ...args, (timedOut, response) => {
    resolve(timedOut ? { error: 'No answer from the server. Try again.' } : response ?? {})
  })
})

function PollForm({ socketRef, onClose }) {
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState(['', ''])
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const filled = options.filter((option) => option.trim())

  const start = async (e) => {
    e.preventDefault()
    if (sending) return
    setSending(true)
    setError('')
    const response = await ask(socketRef, 'poll:start', { question, options: filled })
    setSending(false)
    if (response.error) setError(response.error)
    else onClose()
  }

  return (
    <form className="poll-card" onSubmit={start}>
      <div className="poll-head">
        <strong>New poll</strong>
        <button type="button" className="poll-x" onClick={onClose} title="Close" aria-label="Close">×</button>
      </div>
      <input
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Question (optional)"
        maxLength={300}
        aria-label="Question"
        autoFocus
      />
      {options.map((option, index) => (
        <div className="poll-field" key={index}>
          <input
            value={option}
            onChange={(e) => setOptions((list) => list.map((value, i) => (i === index ? e.target.value : value)))}
            placeholder={`Option ${index + 1}`}
            maxLength={120}
            aria-label={`Option ${index + 1}`}
          />
          {options.length > 2 && (
            <button
              type="button"
              className="poll-x"
              onClick={() => setOptions((list) => list.filter((_, i) => i !== index))}
              title="Remove this option"
              aria-label={`Remove option ${index + 1}`}
            >×</button>
          )}
        </div>
      ))}
      {options.length < MAX_OPTIONS && (
        <button type="button" className="ghost" onClick={() => setOptions((list) => [...list, ''])}>+ Add option</button>
      )}
      {error && <div className="poll-error">{error}</div>}
      <button type="submit" disabled={sending || filled.length < 2}>{sending ? 'Starting…' : 'Start poll'}</button>
    </form>
  )
}

function PollVote({ socketRef, poll, onVoted }) {
  const [choice, setChoice] = useState(null)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)

  const vote = async (e) => {
    e.preventDefault()
    if (sending || choice === null) return
    setSending(true)
    setError('')
    const response = await ask(socketRef, 'poll:vote', { pollId: poll.id, option: choice })
    setSending(false)
    if (response.ok || response.voted) onVoted(poll.id)
    else setError(response.error ?? 'Could not vote. Try again.')
  }

  if (poll.voted) {
    return (
      <div className="poll-card">
        <strong>{poll.question || 'Poll'}</strong>
        <div className="poll-note">Thanks, your vote is in{choice !== null ? `: ${poll.options[choice]}` : ''}. You'll see the results when the teacher ends the poll.</div>
      </div>
    )
  }

  return (
    <form className="poll-card" onSubmit={vote}>
      <strong>{poll.question || 'Choose one'}</strong>
      {poll.options.map((option, index) => (
        <label className={`poll-option ${choice === index ? 'chosen' : ''}`} key={index}>
          <input type="radio" name="poll" checked={choice === index} onChange={() => setChoice(index)} />
          <span>{option}</span>
        </label>
      ))}
      {error && <div className="poll-error">{error}</div>}
      <button type="submit" disabled={sending || choice === null}>{sending ? 'Sending…' : 'Vote'}</button>
      <div className="poll-note">Anonymous: nobody sees who chose what. One vote, and it can't be changed.</div>
    </form>
  )
}

// Staff watch the number of votes only: the split stays hidden until the end.
function PollRunning({ socketRef, poll, canRun }) {
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const end = async () => {
    setSending(true)
    setError('')
    const response = await ask(socketRef, 'poll:close')
    setSending(false)
    if (response.error) setError(response.error)
  }
  return (
    <div className="poll-card">
      <strong>{poll.question || 'Poll'}</strong>
      <ul className="poll-list">{poll.options.map((option, index) => <li key={index}>{option}</li>)}</ul>
      <div className="poll-count">Voted: {poll.votes}</div>
      {error && <div className="poll-error">{error}</div>}
      {canRun && <button type="button" onClick={end} disabled={sending}>End poll and show results</button>}
    </div>
  )
}

function PollResults({ poll, onClose }) {
  return (
    <div className="poll-card">
      <div className="poll-head">
        <strong>{poll.question || 'Poll results'}</strong>
        <button type="button" className="poll-x" onClick={onClose} title="Close" aria-label="Close">×</button>
      </div>
      {poll.options.map((option, index) => {
        const count = poll.counts?.[index] ?? 0
        const share = poll.votes ? Math.round((count / poll.votes) * 100) : 0
        return (
          <div className="poll-result" key={index}>
            <div className="poll-result-line">
              <span>{option}</span>
              <span className="poll-result-number">{count} · {share}%</span>
            </div>
            <div className="poll-bar"><div style={{ width: `${share}%` }} /></div>
          </div>
        )
      })}
      <div className="poll-note">{poll.votes === 1 ? '1 vote' : `${poll.votes} votes`}</div>
    </div>
  )
}

// The poll's card in a call. Nothing on it stops the lesson: it floats over the
// picture or the board, and the sound and video carry on behind it.
export default function Poll({ socketRef, poll, onVoted, isStaff, canRun, composing, onCloseComposer }) {
  // Results someone closed for themselves (the teacher's close is for everyone).
  const [hiddenId, setHiddenId] = useState(null)

  useEffect(() => {
    if (poll?.open && composing) onCloseComposer()
  }, [poll?.open, composing, onCloseComposer])

  const closeResults = () => {
    setHiddenId(poll.id)
    if (canRun) ask(socketRef, 'poll:clear')
  }

  let card = null
  if (composing && !poll?.open) card = <PollForm socketRef={socketRef} onClose={onCloseComposer} />
  else if (poll?.open) card = isStaff ? <PollRunning socketRef={socketRef} poll={poll} canRun={canRun} /> : <PollVote key={poll.id} socketRef={socketRef} poll={poll} onVoted={onVoted} />
  else if (poll && poll.id !== hiddenId) card = <PollResults poll={poll} onClose={closeResults} />
  return card && <div className="poll-layer">{card}</div>
}
