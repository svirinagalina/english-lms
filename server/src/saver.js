// Debounced writes of state kept in memory (boards, Writing documents).
//
// An edit schedules a write `delayMs` later; more edits push it back. A write
// that fails (the database briefly away, a deploy restarting Postgres) is
// tried again with a growing pause (2 s, 4 s … up to a minute) until it goes
// through — before, one failed write left the edit only in memory, lost at
// the next restart. One write per record at a time, so an older copy can
// never land after a newer one. A record deleted meanwhile (Prisma P2025)
// is simply dropped.
export function debouncedSaver(label, write, delayMs, { retryBaseMs = 2000 } = {}) {
  const timers = new Map()
  const failures = new Map()
  const inFlight = new Map()

  const later = (id, ms) => {
    clearTimeout(timers.get(id))
    timers.set(id, setTimeout(() => save(id), ms))
  }

  async function save(id) {
    timers.delete(id)
    // A write is still on its way: this one goes after it.
    if (inFlight.has(id)) return later(id, delayMs)
    const done = (async () => {
      try {
        await write(id)
        failures.delete(id)
      } catch (error) {
        if (error?.code === 'P2025') { failures.delete(id); return }
        const n = (failures.get(id) ?? 0) + 1
        failures.set(id, n)
        console.error(`Failed to save ${label} ${id} (attempt ${n}), will retry:`, error.message)
        if (!timers.has(id)) later(id, Math.min(60_000, retryBaseMs * 2 ** (n - 1)) + Math.random() * retryBaseMs / 2)
      }
    })()
    inFlight.set(id, done)
    try { await done } finally { inFlight.delete(id) }
  }

  return {
    schedule: (id) => later(id, delayMs),
    pending: (id) => timers.has(id),
    cancel: (id) => { clearTimeout(timers.get(id)); timers.delete(id) },
    // Writes this record now (if anything waits) and waits for it.
    settle: async (id) => {
      await inFlight.get(id)
      if (timers.has(id)) { clearTimeout(timers.get(id)); await save(id) }
    },
    // Everything waiting or on its way (server shutdown).
    flush: async () => {
      await Promise.all(inFlight.values())
      const ids = [...timers.keys()]
      for (const id of ids) clearTimeout(timers.get(id))
      await Promise.all(ids.map(save))
    },
    // Records whose last write failed, for /api/health.
    failing: () => failures.size
  }
}
