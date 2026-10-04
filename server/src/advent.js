// The Advent trainer (trainer.advent-academy.online), connected rather than
// copied: a student is the same person there, found by email — same words,
// progress and access. Every call goes from this server with the partner
// key; the key never reaches a browser.
import { adventKey } from './settings.js'
import { breaker } from './resilience.js'

const BASE = 'https://trainer.advent-academy.online/partner/v1'

export const adventEnabled = () => Boolean(adventKey())

// The first sign-in of a student sets up their account there (and checks
// the school's GetCourse for their access), which can take a while: a 10 s
// limit gave "The operation was aborted due to timeout". 30 s, and one retry
// if the connection itself failed or timed out.
export function advent(method, path, body, options) {
  return breaker('trainer').run(() => adventOnce(method, path, body, options))
}
async function adventOnce(method, path, body, { timeoutMs = 30000, retries = 1 } = {}) {
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
    if (retries > 0) return adventOnce(method, path, body, { timeoutMs, retries: retries - 1 })
    throw Object.assign(new Error(error.name === 'TimeoutError' ? 'The trainer is taking too long to answer — try again in a moment' : `Could not reach the trainer: ${error.message}`), { status: 504 })
  }
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw Object.assign(new Error(data?.error || data?.detail || `Trainer error ${response.status}`), { status: response.status, countsAsFailure: response.status >= 500 })
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

// Being a student on the platform is what gives trainer access (Galina,
// 2026-09-26: "if a student is on the platform, they have the trainer").
// Full access with no end date; PRO stays whatever the student bought.
// Each call replaces what this platform granted before; access bought on the
// school's GetCourse is kept by the trainer regardless.
export const grantAccess = (email, name) =>
  advent('POST', '/access', { email, name, full: 'forever', pro: null, order_id: 'platform-student' })
export const revokeAccess = (email) =>
  advent('POST', '/access', { email, full: null, pro: null })

// A student gets their trainer account and access as soon as they join the
// platform, not on first opening it. Best effort, never blocks the caller.
export async function enrollStudent(email, name) {
  if (!adventEnabled() || !email) return false
  try {
    await advent('POST', '/session', { email, name })
    await grantAccess(email, name)
    return true
  } catch (error) {
    console.warn(`Trainer enrolment failed for a student: ${error.message}`)
    return false
  }
}

// Removed from the platform: the access the platform gave is taken back.
export function unenrollStudent(email) {
  if (!adventEnabled() || !email) return
  revokeAccess(email).catch((error) => console.warn(`Trainer access revoke failed: ${error.message}`))
}

// A student's email changed: the trainer knows people by email, so access
// moves to the new one (the old address loses what the platform gave it).
export function moveStudent(oldEmail, newEmail, name) {
  if (!adventEnabled() || !newEmail || oldEmail === newEmail) return
  unenrollStudent(oldEmail)
  enrollStudent(newEmail, name)
}
