// The Advent trainer (trainer.advent-academy.online), connected rather than
// copied: a student is the same person there, found by email — same words,
// progress and access. Every call goes from this server with the partner
// key; the key never reaches a browser.
import { adventKey } from './settings.js'

const BASE = 'https://trainer.advent-academy.online/partner/v1'

export const adventEnabled = () => Boolean(adventKey())

export async function advent(method, path, body) {
  const key = adventKey()
  if (!key) throw Object.assign(new Error('The trainer is not connected yet (Settings → Advent trainer)'), { status: 503 })
  const response = await fetch(BASE + path, {
    method,
    headers: { 'X-Partner-Key': key, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000)
  })
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
