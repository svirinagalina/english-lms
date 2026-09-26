// The Advent trainer (trainer.advent-academy.online), connected rather than
// copied: a student is the same person there, found by email — same words,
// progress and access. Every call goes from this server with the partner
// key; the key never reaches a browser.
import { adventKey } from './settings.js'

const BASE = 'https://trainer.advent-academy.online/partner/v1'

export const adventEnabled = () => Boolean(adventKey())

// The first sign-in of a student sets up their account there (and checks
// the school's GetCourse for their access), which can take a while: a 10 s
// limit gave "The operation was aborted due to timeout". 30 s, and one retry
// if the connection itself failed or timed out.
export async function advent(method, path, body, { timeoutMs = 30000, retries = 1 } = {}) {
  const key = adventKey()
  if (!key) throw Object.assign(new Error('The trainer is not connected yet (Settings → Advent trainer)'), { status: 503 })
  let response
  try {
    response = await fetch(BASE + path, {
      method,
      headers: { 'X-Partner-Key': key, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs)
    })
  } catch (error) {
    if (retries > 0) return advent(method, path, body, { timeoutMs, retries: retries - 1 })
    throw Object.assign(new Error(error.name === 'TimeoutError' ? 'The trainer is taking too long to answer — try again in a moment' : `Could not reach the trainer: ${error.message}`), { status: 504 })
  }
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw Object.assign(new Error(data?.error || data?.detail || `Trainer error ${response.status}`), { status: response.status })
  return data
}

// A word saved on the platform goes into the student's trainer vocabulary
// too, so it turns up in their flashcards there. Best effort: the platform's
// own card is already saved whatever happens here.
export function shareWord(email, word, note) {
  if (!adventEnabled() || !email || !word) return
  advent('POST', '/vocab', { email, word, note: note ? String(note).slice(0, 200) : undefined })
    .catch((error) => console.warn(`Trainer vocab sync failed for ${word}:`, error.message))
}

// A student gets their trainer account as soon as they join the platform
// (Galina, 2026-09-26: "every student on the platform should have the
// trainer") rather than on first opening it. Best effort, never blocks.
export async function enrollStudent(email, name) {
  if (!adventEnabled() || !email) return false
  try {
    await advent('POST', '/session', { email, name })
    return true
  } catch (error) {
    console.warn(`Trainer enrolment failed for a student: ${error.message}`)
    return false
  }
}
