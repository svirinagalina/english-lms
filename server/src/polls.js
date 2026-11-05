// A poll in a call: the teacher asks, students vote anonymously, and everyone
// sees the result once the teacher ends it.
//
// Anonymous means nothing links a person to an option, anywhere. A vote adds
// one to the option's counter; separately, the student's id goes on the list
// of those who have voted, which is what stops a second vote. Which option
// they took is never stored, logged or sent, and the list is dropped when the
// poll ends. While voting is open only the number of votes goes out: a running
// split would show a teacher what the student who just voted chose.
//
// Polls live in memory, like the chat: they belong to one lesson, and no table
// means there is nothing to read back later.
import { randomUUID } from 'node:crypto'

const MAX_OPTIONS = 10
const MAX_OPTION_LENGTH = 120
const MAX_QUESTION_LENGTH = 300

// Call room → its poll: the open one, or the last result until it is cleared.
const polls = new Map()

// A partner only looks (see PARTNER_BLOCKED_EVENTS in signaling.js).
const runsPolls = (user) => user.role === 'OWNER' || user.role === 'TEACHER'

const publicPoll = (poll) => ({
  id: poll.id,
  question: poll.question,
  options: poll.options,
  open: poll.open,
  votes: poll.votes,
  counts: poll.open ? null : poll.counts
})

// The poll as this person should see it, for the join-call answer.
export function pollFor(roomId, user) {
  const poll = polls.get(roomId)
  if (!poll || poll.schoolId !== user.schoolId) return null
  return { ...publicPoll(poll), voted: Boolean(poll.voters?.has(user.id)) }
}

export function forgetPoll(roomId) {
  polls.delete(roomId)
}

function cleanOptions(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .map((option) => (typeof option === 'string' ? option.trim().slice(0, MAX_OPTION_LENGTH) : ''))
    .filter(Boolean)
}

export function attachPolls(io, socket) {
  const user = socket.data.user
  // Only a call's own room: join-call has checked the school by then.
  const callRoom = () => (socket.data.callId ? socket.data.roomId : null)
  const pollHere = (roomId) => {
    const poll = roomId ? polls.get(roomId) : null
    return poll?.schoolId === user.schoolId ? poll : null
  }
  const answer = (ack, body) => { if (typeof ack === 'function') ack(body) }

  socket.on('poll:start', (payload, ack) => {
    const roomId = callRoom()
    if (!runsPolls(user) || !roomId) return answer(ack, { error: 'Only the teacher in a call can start a poll' })
    if (pollHere(roomId)?.open) return answer(ack, { error: 'End the current poll first' })

    const options = cleanOptions(payload?.options)
    if (options.length < 2) return answer(ack, { error: 'Give at least two options' })
    if (options.length > MAX_OPTIONS) return answer(ack, { error: `No more than ${MAX_OPTIONS} options` })
    if (new Set(options.map((option) => option.toLowerCase())).size < options.length) return answer(ack, { error: 'Two options are the same' })

    const question = typeof payload?.question === 'string' ? payload.question.trim().slice(0, MAX_QUESTION_LENGTH) : ''
    const poll = {
      id: randomUUID(),
      schoolId: user.schoolId,
      question,
      options,
      open: true,
      votes: 0,
      counts: options.map(() => 0),
      voters: new Set()
    }
    polls.set(roomId, poll)
    io.to(roomId).emit('poll:state', publicPoll(poll))
    answer(ack, { ok: true })
  })

  // No await between the check and the count: two votes can't both pass.
  socket.on('poll:vote', (payload, ack) => {
    const poll = pollHere(callRoom())
    if (user.role !== 'STUDENT') return answer(ack, { error: 'Only students vote' })
    if (!poll || poll.id !== payload?.pollId || !poll.open) return answer(ack, { error: 'This poll has ended' })
    if (poll.voters.has(user.id)) return answer(ack, { error: 'You have already voted', voted: true })
    const option = payload?.option
    if (!Number.isInteger(option) || option < 0 || option >= poll.options.length) return answer(ack, { error: 'Choose an option' })

    poll.voters.add(user.id)
    poll.counts[option] += 1
    poll.votes += 1
    io.to(callRoom()).emit('poll:state', publicPoll(poll))
    answer(ack, { ok: true })
  })

  socket.on('poll:close', (ack) => {
    const roomId = callRoom()
    const poll = pollHere(roomId)
    if (!runsPolls(user) || !poll) return answer(ack, { error: 'Only the teacher in a call can end a poll' })
    if (poll.open) {
      poll.open = false
      delete poll.voters
      io.to(roomId).emit('poll:state', publicPoll(poll))
    }
    answer(ack, { ok: true })
  })

  // Takes the finished result off everyone's screen.
  socket.on('poll:clear', (ack) => {
    const roomId = callRoom()
    const poll = pollHere(roomId)
    if (!runsPolls(user) || !poll) return answer(ack, { error: 'Only the teacher in a call can do this' })
    if (poll.open) return answer(ack, { error: 'End the poll first' })
    polls.delete(roomId)
    io.to(roomId).emit('poll:state', null)
    answer(ack, { ok: true })
  })
}
