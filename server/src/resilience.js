// Staying up when something around us is slow, down or flooding us.
//
// - breaker(name): a circuit breaker per outside service (AI, dictionary,
//   trainer, mail, Stripe). After 5 failures within a minute it opens for
//   30 s: calls fail at once instead of piling up waiting on a dead service
//   and eating the server's connections. Then one call is let through to see
//   whether the service is back.
// - guardedFetch(name, url, init): fetch with a timeout, one retry for safe
//   requests (GET) on a network error or a 5xx/429, and the breaker around it.
// - rateLimit(options): requests per address per window, answered 429 past it.

const breakers = new Map()

export class CircuitOpenError extends Error {
  constructor(name) {
    super(`${name} is unavailable right now, try again in a moment`)
    this.circuitOpen = true
  }
}

export function breaker(name, { failures = 5, windowMs = 60_000, cooldownMs = 30_000 } = {}) {
  if (breakers.has(name)) return breakers.get(name)
  const state = { recent: [], openUntil: 0, probing: false }
  const b = {
    async run(fn) {
      const now = Date.now()
      if (state.openUntil > now) throw new CircuitOpenError(name)
      // Half-open: one trial call while the others still fail fast.
      if (state.openUntil && state.probing) throw new CircuitOpenError(name)
      if (state.openUntil) state.probing = true
      try {
        const result = await fn()
        state.recent = []
        if (state.openUntil) console.warn(`[breaker] ${name} closed again`)
        state.openUntil = 0
        state.probing = false
        return result
      } catch (error) {
        // A refusal for this request (bad input, 4xx) says nothing about the
        // service's health; only timeouts, network errors and 5xx count.
        if (error?.countsAsFailure !== false) {
          state.recent = [...state.recent.filter((t) => now - t < windowMs), now]
          if (state.probing || state.recent.length >= failures) {
            state.openUntil = Date.now() + cooldownMs
            console.warn(`[breaker] ${name} open for ${cooldownMs / 1000}s after ${state.recent.length} failures: ${error?.message}`)
          }
        }
        state.probing = false
        throw error
      }
    },
    status: () => ({ name, open: state.openUntil > Date.now(), recentFailures: state.recent.length })
  }
  breakers.set(name, b)
  return b
}

export const breakerStatus = () => [...breakers.values()].map((b) => b.status())

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export async function guardedFetch(name, url, init = {}, { timeoutMs = 10_000, retries } = {}) {
  const method = (init.method ?? 'GET').toUpperCase()
  const attempts = 1 + (retries ?? (method === 'GET' ? 1 : 0))
  return breaker(name).run(async () => {
    let lastError
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (attempt) await sleep(300 * attempt + Math.random() * 300)
      try {
        const response = await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(timeoutMs) })
        if (response.status >= 500 || response.status === 429) {
          lastError = new Error(`${name} answered ${response.status}`)
          lastError.response = response
          continue
        }
        return response
      } catch (error) {
        lastError = error
      }
    }
    // The last 5xx/429 is still a response the caller may want to read.
    if (lastError?.response) return lastError.response
    throw lastError
  })
}

// --- Rate limiting ---------------------------------------------------------------
// In memory, per process: enough for one server. `key` defaults to the
// client address (Caddy passes the real one from Cloudflare).
export function rateLimit({ windowMs, max, key = (req) => req.ip, message = 'Too many requests. Please slow down and try again in a minute.' }) {
  const hits = new Map()
  setInterval(() => {
    const now = Date.now()
    for (const [k, entry] of hits) if (entry.reset <= now) hits.delete(k)
  }, windowMs).unref()
  return (req, res, next) => {
    const k = key(req)
    const now = Date.now()
    let entry = hits.get(k)
    if (!entry || entry.reset <= now) { entry = { count: 0, reset: now + windowMs }; hits.set(k, entry) }
    entry.count += 1
    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.reset - now) / 1000)))
      return res.status(429).json({ error: message })
    }
    next()
  }
}
