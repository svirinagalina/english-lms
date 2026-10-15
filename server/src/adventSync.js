import express from 'express'
import { prisma } from './db.js'
import { requireAuth, requireRole } from './auth.js'
import { adventApi, adventLessonsEnabled, applyAdventEvent } from './adventLessons.js'
import { sendTo, esc } from './telegram.js'

// The platform and Maxim's site always show the same lessons (Galina,
// 2026-10-14: "нужна полная синхронизация"). Trials are booked on his site
// and come here by his webhook; from then on the platform is where a lesson
// changes. Everything the platform tells his site — a lesson started, how it
// went, the report, a cancellation, a move, a new teacher — goes through an
// outbox and is retried until his API takes it, so nothing is lost
// while his site is down. Every 6 hours both lists are compared: what is
// missing here is brought in, what differs is put right, the rest is shown in
// Settings and sent to the owner in Telegram.

const MIN = 60000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const BACKOFF = [1, 5, 15, 60, 360].map((m) => m * MIN) // then once a day
const msk = (d) => new Date(d).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

// Only the real server talks to his site. A copy of the platform on a laptop
// has the same key in its .env, and its own lessons and links: from there it
// would send him test outcomes and wrong links. ADVENT_SYNC=on overrides (tests).
export const syncAllowed = () => process.env.NODE_ENV === 'production' || process.env.ADVENT_SYNC === 'on'

// --- The outbox -----------------------------------------------------------------

export async function toAdventLater(kind, method, path, body, lessonId = null) {
  await prisma.adventOutbox.create({ data: { kind, method, path, body: body ?? undefined, lessonId } })
  setTimeout(() => { flushOutbox().catch((error) => console.error('[sync] flush', error.message)) }, 1000)
}

let flushing = false
export async function flushOutbox({ now = false } = {}) {
  if (!adventLessonsEnabled() || !syncAllowed() || flushing) return
  flushing = true
  try {
    const due = await prisma.adventOutbox.findMany({
      where: { doneAt: null, failedAt: null, ...(now ? {} : { nextAt: { lte: new Date() } }) },
      orderBy: { createdAt: 'asc' },
      take: 100
    })
    // One lesson's messages in order: a later one waits for an earlier one.
    const stuck = new Set()
    for (const item of due) {
      if (item.lessonId && stuck.has(item.lessonId)) continue
      try {
        await adventApi(item.method, item.path, item.body ?? undefined)
        await prisma.adventOutbox.update({ where: { id: item.id }, data: { doneAt: new Date(), attempts: item.attempts + 1, lastError: null } })
      } catch (error) {
        const status = Number(String(error.message).match(/: (\d{3})\b/)?.[1] ?? 0)
        const attempts = item.attempts + 1
        const message = String(error.message).slice(0, 300)
        // A repeat of something his site already has: nothing more to do. A 409
        // on a move or a cancellation (lesson_closed, slot_busy) is a real
        // refusal and is shown in Settings.
        if (status === 409 && ['started', 'finished', 'report', 'links'].includes(item.kind)) {
          await prisma.adventOutbox.update({ where: { id: item.id }, data: { doneAt: new Date(), attempts, lastError: message } })
          continue
        }
        // His API refused the request itself (bad data): repeating won't help.
        // A 404 may be an address his site doesn't have yet — keep trying daily.
        const refused = status >= 400 && status < 500 && ![404, 408, 425, 429].includes(status) // 409 included
        const tooOld = Date.now() - new Date(item.createdAt).getTime() > 30 * DAY
        await prisma.adventOutbox.update({
          where: { id: item.id },
          data: { attempts, lastError: message, ...(refused || tooOld ? { failedAt: new Date() } : { nextAt: new Date(Date.now() + (BACKOFF[attempts - 1] ?? DAY)) }) }
        })
        if (item.lessonId) stuck.add(item.lessonId)
      }
    }
  } finally { flushing = false }
}

// --- Comparing both lists -------------------------------------------------------

const label = (l) => `${l.studentName ?? l.student?.name ?? 'ученик'}, ${msk(l.startsAt ?? l.starts_at)}`
const changedHere = (lessonId, kinds) => prisma.adventOutbox.findFirst({ where: { lessonId, kind: { in: kinds } }, select: { id: true } })
const waiting = (lessonId, kinds) => prisma.adventOutbox.findFirst({ where: { lessonId, kind: { in: kinds }, doneAt: null, failedAt: null }, select: { id: true } })

async function saveState(state) {
  const value = JSON.stringify(state)
  await prisma.platformSetting.upsert({ where: { key: 'advent.sync' }, create: { key: 'advent.sync', value }, update: { value } })
}
async function loadState() {
  const row = await prisma.platformSetting.findUnique({ where: { key: 'advent.sync' } })
  try { return row ? JSON.parse(row.value) : null } catch { return null }
}

export async function reconcile() {
  const at = new Date().toISOString()
  if (!adventLessonsEnabled()) { await saveState({ at, ok: false, error: 'Связь с сайтом Advent не настроена (ADVENT_API_KEY)' }); return loadState() }
  if (!syncAllowed()) { await saveState({ at, ok: false, error: 'Это не рабочий сервер — сверка с сайтом Advent идёт только на lms.advent-academy.online' }); return loadState() }
  const from = new Date(Date.now() - 14 * DAY)
  const to = new Date(Date.now() + 60 * DAY)
  let data
  try {
    data = await adventApi('GET', `/lessons?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`)
  } catch (error) {
    console.error('[sync] reconcile: his list not available', String(error.message).slice(0, 200))
    await saveState({ at, ok: false, error: `Сайт Advent не отдал список уроков: ${String(error.message).slice(0, 200)}` })
    return loadState()
  }
  const list = (Array.isArray(data) ? data : data?.lessons ?? data?.items ?? data?.data ?? []).filter((l) => l?.id && l.starts_at)
  const theirs = new Map(list.map((l) => [String(l.id), l]))
  const result = { imported: [], fixedHere: [], sentThere: [], onlyHere: [], problems: [] }

  for (const [id, lesson] of theirs) {
    const cancelledThere = /cancel/i.test(String(lesson.status ?? ''))
    if (await prisma.adventEvent.findUnique({ where: { id: `removed:${id}` } })) continue
    const row = await prisma.adventLesson.findUnique({ where: { adventId: id } })
    if (!row) {
      // Booked there, never arrived here (a lost webhook): brought in, and his site gets the links.
      if (cancelledThere || new Date(lesson.starts_at) < Date.now() - DAY) continue
      const [status, body] = await applyAdventEvent({ event: 'lesson.created', lesson })
      if (status === 200) {
        result.imported.push(label(lesson))
        await toAdventLater('links', 'PUT', `/lessons/${encodeURIComponent(id)}/links`, body, (await prisma.adventLesson.findUnique({ where: { adventId: id }, select: { id: true } }))?.id)
      } else result.problems.push(`${label(lesson)}: ${body.message ?? body.error}`)
      continue
    }
    if (cancelledThere && row.status !== 'cancelled') {
      if (await changedHere(row.id, ['move', 'teacher'])) { result.problems.push(`${label(row)}: отменён на сайте Advent, а на платформе его меняли — проверьте`); continue }
      await applyAdventEvent({ event: 'lesson.cancelled', lesson })
      result.fixedHere.push(`${label(row)}: отменён, как на сайте`)
      continue
    }
    if (!cancelledThere && row.status === 'cancelled') {
      if (await changedHere(row.id, ['cancel'])) {
        if (!(await waiting(row.id, ['cancel']))) await toAdventLater('cancel', 'POST', `/lessons/${encodeURIComponent(id)}/cancel`, { reason: 'Отменён на платформе', cancelled_by: 'admin' }, row.id)
        result.sentThere.push(`${label(row)}: отмена`)
      } else result.problems.push(`${label(row)}: отменён на платформе, а на сайте Advent идёт`)
      continue
    }
    if (row.status === 'cancelled') continue
    const teacher = await prisma.user.findUnique({ where: { id: row.teacherId }, select: { email: true, name: true } })
    const timeDiffers = Math.abs(new Date(lesson.starts_at).getTime() - new Date(row.startsAt).getTime()) > MIN
    const theirTeacher = String(lesson.teacher?.email ?? '').trim().toLowerCase()
    const teacherDiffers = Boolean(theirTeacher && teacher && theirTeacher !== teacher.email.toLowerCase())
    if (!timeDiffers && !teacherDiffers) continue
    // Changed on the platform: his site gets our version again. Never changed
    // here (his webhook was lost): his version is taken.
    if (await changedHere(row.id, ['move', 'teacher'])) {
      if (!(await waiting(row.id, ['move', 'teacher']))) {
        await toAdventLater('move', 'PATCH', `/lessons/${encodeURIComponent(id)}`, { starts_at: new Date(row.startsAt).toISOString(), teacher_email: teacher?.email, changed_by: 'platform' }, row.id)
      }
      result.sentThere.push(`${label(row)}: ${[timeDiffers && 'время', teacherDiffers && 'учитель'].filter(Boolean).join(' и ')}`)
    } else {
      const [status, body] = await applyAdventEvent({ event: 'lesson.updated', lesson })
      if (status === 200) result.fixedHere.push(`${label(lesson)}: ${[timeDiffers && 'время', teacherDiffers && 'учитель'].filter(Boolean).join(' и ')} как на сайте`)
      else result.problems.push(`${label(lesson)}: ${body.message ?? body.error}`)
    }
  }
  const ours = await prisma.adventLesson.findMany({ where: { source: { not: 'platform' }, status: 'scheduled', isTest: false, startsAt: { gte: from, lte: to } } })
  for (const row of ours) if (!theirs.has(row.adventId)) result.onlyHere.push(label(row))

  const failed = await prisma.adventOutbox.count({ where: { failedAt: { not: null }, doneAt: null } })
  const state = { at, ok: true, theirs: theirs.size, ...result, failed }
  const previous = await loadState()
  await saveState(state)
  // Counts only (no names) for the server log.
  console.log('[sync] reconcile', JSON.stringify({ theirs: state.theirs, shape: Array.isArray(data) ? 'array' : Object.keys(data ?? {}).join(','), imported: result.imported.length, fixedHere: result.fixedHere.length, sentThere: result.sentThere.length, onlyHere: result.onlyHere.length, problems: result.problems.length, failed }))
  await tellOwner(state, previous)
  return state
}

// The owner hears only when something was put right or needs a look — and not
// the same problems twice in a row.
async function tellOwner(state, previous) {
  const fixed = [...state.imported.map((x) => `подтянут: ${x}`), ...state.fixedHere.map((x) => `исправлен: ${x}`), ...state.sentThere.map((x) => `отправлен на сайт: ${x}`)]
  const trouble = [...state.problems, ...state.onlyHere.map((x) => `есть только на платформе: ${x}`), ...(state.failed ? [`не дошло до сайта: ${state.failed} (Settings → Advent site)`] : [])]
  const same = JSON.stringify(trouble) === JSON.stringify([...(previous?.problems ?? []), ...(previous?.onlyHere ?? []).map((x) => `есть только на платформе: ${x}`), ...(previous?.failed ? [`не дошло до сайта: ${previous.failed} (Settings → Advent site)`] : [])])
  if (!fixed.length && (!trouble.length || same)) return
  const owners = await prisma.user.findMany({ where: { role: 'OWNER', telegramChatId: { not: null } }, select: { telegramChatId: true } })
  const text = ['🔄 Сверка с сайтом Advent', ...fixed.map((x) => `✅ ${esc(x)}`), ...trouble.map((x) => `⚠️ ${esc(x)}`)].join('\n').slice(0, 3500)
  for (const owner of owners) await sendTo(owner, text)
}

export function startSyncJobs() {
  if (!syncAllowed()) return
  const quietly = (name, job) => job().catch((error) => console.error(`[sync] ${name}`, error.message))
  setInterval(() => quietly('flush', flushOutbox), MIN)
  setTimeout(() => quietly('reconcile', reconcile), 5 * MIN)
  setInterval(() => quietly('reconcile', reconcile), 6 * HOUR)
}

// --- Settings → «Advent site» ------------------------------------------------------

export const adventSyncRouter = express.Router()
adventSyncRouter.use(requireAuth, requireRole('OWNER'))

async function status() {
  const [waitingCount, failed, recent] = await Promise.all([
    prisma.adventOutbox.count({ where: { doneAt: null, failedAt: null } }),
    prisma.adventOutbox.findMany({ where: { doneAt: null, OR: [{ failedAt: { not: null } }, { attempts: { gt: 0 } }] }, orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, kind: true, path: true, attempts: true, lastError: true, failedAt: true, createdAt: true } }),
    prisma.adventOutbox.count({ where: { doneAt: { gte: new Date(Date.now() - DAY) } } })
  ])
  return { enabled: adventLessonsEnabled(), last: await loadState(), outbox: { waiting: waitingCount, sentToday: recent, problems: failed } }
}
adventSyncRouter.get('/', async (req, res) => res.json(await status()))
adventSyncRouter.post('/run', async (req, res) => {
  await flushOutbox({ now: true }).catch(() => {})
  await reconcile().catch((error) => console.error('[sync] reconcile', error.message))
  res.json(await status())
})
// The ones his API refused: once more (after Maxim fixed something on his side).
adventSyncRouter.post('/retry', async (req, res) => {
  await prisma.adventOutbox.updateMany({ where: { doneAt: null, failedAt: { not: null } }, data: { failedAt: null, nextAt: new Date(), attempts: 0 } })
  await flushOutbox({ now: true }).catch(() => {})
  res.json(await status())
})
