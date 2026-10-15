import crypto from 'crypto'
import express from 'express'
import { z } from 'zod'
import { prisma } from './db.js'
import { requireAuth, requireRole, isAdmin, hashPassword } from './auth.js'
import { generateRecurringInstances } from './routes/personal.js'
import { ensureStudent, MEMO } from './adventLessons.js'
import { toAdventLater } from './adventSync.js'
import { botToken, botUsername, startLink, appUrl } from './telegram.js'
import { sendLessonLinkEmail } from './mailer.js'

// Trial lessons booked on the platform (Galina, 2026-10-14: Maxim's site is
// only the gate — its «Записаться» button opens /trial here). Teachers mark
// their own free windows in the Timetable; the page offers 40-minute lessons
// on the hour inside them; the student picks only the time and the teacher
// with the fewest trials in the last month gets it. A booking is "pending"
// until the student presses Start in the school's Telegram bot (that is where
// the link and the reminders go) and is cancelled after a day without it.
// The lesson is an AdventLesson with source 'platform', so calls, outcomes,
// the trial report and the bot treat it exactly like a booking from the site.

const MIN = 60000
const HOUR = 60 * MIN
export const TRIAL_MIN = 40
const STEP_MIN = 60
const LEAD_MS = 3 * HOUR
const HORIZON_MS = 14 * 24 * HOUR
const CONFIRM_MS = 24 * HOUR
const STAFF = ['OWNER', 'PARTNER', 'TEACHER']

async function publicSchool() {
  if (process.env.PUBLIC_SCHOOL_ID) return prisma.school.findUnique({ where: { id: process.env.PUBLIC_SCHOOL_ID } })
  return prisma.school.findFirst({ orderBy: { createdAt: 'asc' } })
}
// Off (Galina, 2026-10-14): trials are booked on Maxim's site, the platform
// holds the paid lessons. The page, the windows and the booking code stay
// for the day this changes; Move / Teacher / Remove below are in use.
const PLATFORM_BOOKING = false
const bookingOpen = () => PLATFORM_BOOKING && Boolean(botToken() && botUsername())

// What keeps a teacher busy: their Timetable lessons (a lesson saved with no
// length counts as an hour) and trial bookings, pending ones included.
async function busyFor(teacherId, from, to, exceptLessonId = null) {
  const events = await prisma.userCalendarEvent.findMany({
    where: {
      userId: teacherId,
      startTime: { lt: to },
      OR: [{ recurrence: null, startTime: { gte: new Date(from.getTime() - 24 * HOUR) } }, { recurrence: 'WEEKLY', OR: [{ recurrenceEndDate: null }, { recurrenceEndDate: { gte: from } }] }]
    }
  })
  const lessons = await prisma.adventLesson.findMany({
    where: { teacherId, status: { in: ['pending', 'scheduled'] }, startsAt: { gte: new Date(from.getTime() - 3 * HOUR), lt: to }, ...(exceptLessonId ? { id: { not: exceptLessonId } } : {}) },
    select: { id: true, startsAt: true, durationMin: true, calendarEventId: true }
  })
  const skip = new Set(lessons.map((l) => l.calendarEventId).filter(Boolean))
  const except = exceptLessonId ? (await prisma.adventLesson.findUnique({ where: { id: exceptLessonId }, select: { calendarEventId: true } }))?.calendarEventId : null
  const busy = []
  for (const event of events) {
    if (skip.has(event.id) || event.id === except) continue
    for (const one of generateRecurringInstances(event, new Date(from.getTime() - 24 * HOUR), to)) {
      const start = new Date(one.startTime).getTime()
      const end = new Date(one.endTime).getTime()
      busy.push([start, end > start ? end : start + HOUR])
    }
  }
  for (const l of lessons) busy.push([new Date(l.startsAt).getTime(), new Date(l.startsAt).getTime() + l.durationMin * MIN])
  return busy
}
const clash = (busy, start, end) => busy.some(([b1, b2]) => start < b2 && b1 < end)

// Every start time someone can be booked at, with the teachers free then.
async function freeSlots(schoolId, from = new Date(Date.now() + LEAD_MS), to = new Date(Date.now() + HORIZON_MS)) {
  const windows = await prisma.trialWindow.findMany({
    where: {
      teacher: { schoolId, role: { in: STAFF } },
      startTime: { lt: to },
      OR: [{ recurrence: null, endTime: { gt: from } }, { recurrence: 'WEEKLY', OR: [{ recurrenceEndDate: null }, { recurrenceEndDate: { gte: from } }] }]
    }
  })
  const slots = new Map()
  const byTeacher = new Map()
  for (const w of windows) byTeacher.set(w.teacherId, [...(byTeacher.get(w.teacherId) ?? []), w])
  for (const [teacherId, list] of byTeacher) {
    const busy = await busyFor(teacherId, from, to)
    for (const window of list) {
      for (const one of generateRecurringInstances(window, new Date(from.getTime() - 24 * HOUR), to)) {
        const end = new Date(one.endTime).getTime()
        for (let t = new Date(one.startTime).getTime(); t + TRIAL_MIN * MIN <= end; t += STEP_MIN * MIN) {
          if (t < from.getTime() || t + TRIAL_MIN * MIN > to.getTime()) continue
          if (clash(busy, t, t + TRIAL_MIN * MIN)) continue
          const free = slots.get(t) ?? new Set()
          free.add(teacherId)
          slots.set(t, free)
        }
      }
    }
  }
  return slots
}

// Of the teachers free then, the one with the fewest trials in the last month.
async function pickTeacher(teacherIds) {
  const since = new Date(Date.now() - 30 * 24 * HOUR)
  const counts = await Promise.all(teacherIds.map(async (id) => ({
    id,
    n: await prisma.adventLesson.count({ where: { teacherId: id, kind: 'trial', status: { not: 'cancelled' }, startsAt: { gte: since } } })
  })))
  const fewest = Math.min(...counts.map((c) => c.n))
  const pool = counts.filter((c) => c.n === fewest)
  return pool[crypto.randomInt(pool.length)].id
}

// One booking at a time, so two people can't take the same hour.
let queue = Promise.resolve()
const oneAtATime = (job) => { const run = queue.then(job, job); queue = run.catch(() => {}); return run }

const newToken = () => crypto.randomBytes(18).toString('base64url')
const mskDay = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Europe/Moscow' })

// The student pressed Start in the bot: the booking holds, the lesson goes
// into the teacher's Timetable and the student into their students.
export async function confirmBooking(lesson) {
  if (lesson.status !== 'pending') return lesson
  const event = await prisma.userCalendarEvent.create({
    data: {
      title: `Пробный урок — ${lesson.studentName || 'ученик'}`,
      description: [MEMO, lesson.studentEmail ? `Почта ученика: ${lesson.studentEmail}` : null].filter(Boolean).join('\n'),
      startTime: lesson.startsAt,
      endTime: new Date(new Date(lesson.startsAt).getTime() + lesson.durationMin * MIN),
      userId: lesson.teacherId
    }
  })
  let row = await prisma.adventLesson.update({ where: { id: lesson.id }, data: { status: 'scheduled', calendarEventId: event.id } })
  row = await ensureStudent(row, row.teacherId)
  if (row.studentEmail) {
    const teacher = await prisma.user.findUnique({ where: { id: row.teacherId }, select: { name: true } })
    sendLessonLinkEmail({
      to: row.studentEmail, name: row.studentName, what: 'Пробный урок', teacher: teacher?.name,
      when: `${new Date(row.startsAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} (МСК)`,
      link: `${appUrl()}/lesson/${row.studentToken}`
    }).catch((error) => console.error('[booking] email', error.message))
  }
  return row
}

// Not confirmed in a day (or an hour before the lesson): the hour is free again.
async function expirePending() {
  const now = Date.now()
  const stale = await prisma.adventLesson.findMany({
    where: { source: 'platform', status: 'pending', OR: [{ createdAt: { lt: new Date(now - CONFIRM_MS) } }, { startsAt: { lt: new Date(now + HOUR) } }] }
  })
  for (const lesson of stale) {
    await prisma.adventLesson.update({ where: { id: lesson.id }, data: { status: 'cancelled' } })
    // The account made for it, if it never got further (no teacher, no chat).
    if (lesson.studentUserId) {
      const user = await prisma.user.findUnique({ where: { id: lesson.studentUserId }, select: { viaLink: true, telegramChatId: true, _count: { select: { studentLinks: true } } } })
      if (user?.viaLink && !user.telegramChatId && !user._count.studentLinks) await prisma.user.delete({ where: { id: lesson.studentUserId } }).catch(() => {})
    }
  }
}
export function startBookingJobs() {
  setInterval(() => { expirePending().catch((error) => console.error('[booking] expire', error.message)) }, MIN)
}

export const bookingRouter = express.Router()

// --- The public page ----------------------------------------------------------

bookingRouter.get('/slots', async (req, res) => {
  const school = await publicSchool()
  if (!school || !bookingOpen()) return res.json({ open: false, days: [] })
  const slots = await freeSlots(school.id)
  const days = new Map()
  for (const t of [...slots.keys()].sort((a, b) => a - b)) {
    const day = mskDay(t)
    days.set(day, [...(days.get(day) ?? []), new Date(t).toISOString()])
  }
  res.json({ open: true, minutes: TRIAL_MIN, days: [...days].map(([date, times]) => ({ date, times })) })
})

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref']
const bookingSchema = z.object({
  startsAt: z.string().datetime(),
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(200).optional().or(z.literal('')),
  utm: z.record(z.string().max(200)).optional(),
  website: z.string().max(0).optional() // a field people never see; bots fill it
})
const bookingsByIp = new Map()

bookingRouter.post('/', express.json(), async (req, res) => {
  const parsed = bookingSchema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ error: 'Проверьте имя и время' })
  const ip = req.ip ?? ''
  const recent = (bookingsByIp.get(ip) ?? []).filter((t) => Date.now() - t < HOUR)
  if (recent.length >= 5) return res.status(429).json({ error: 'Слишком много записей подряд — попробуйте через час' })
  const school = await publicSchool()
  if (!school || !bookingOpen()) return res.status(503).json({ error: 'Запись временно недоступна' })
  const { startsAt, name, email } = parsed.data
  const start = new Date(startsAt).getTime()
  if (start < Date.now() + LEAD_MS || start > Date.now() + HORIZON_MS) return res.status(409).json({ error: 'Это время уже недоступно — выберите другое' })
  const utm = Object.fromEntries(Object.entries(parsed.data.utm ?? {}).filter(([k, v]) => UTM_KEYS.includes(k) && v))
  try {
    const lesson = await oneAtATime(async () => {
      const slots = await freeSlots(school.id, new Date(start), new Date(start + TRIAL_MIN * MIN))
      const free = [...(slots.get(start) ?? [])]
      if (!free.length) throw Object.assign(new Error('Это время уже заняли — выберите другое'), { status: 409 })
      const teacherId = await pickTeacher(free)
      const token = newToken()
      const student = await prisma.user.create({
        data: { email: `trial-${token.toLowerCase().replace(/[^a-z0-9]/g, '')}@trial.invalid`, name, role: 'STUDENT', schoolId: school.id, passwordHash: await hashPassword(newToken()), viaLink: true }
      })
      return prisma.adventLesson.create({
        data: {
          adventId: `platform-${token}`,
          source: 'platform',
          kind: 'trial',
          title: 'Бесплатный пробный урок',
          startsAt: new Date(start),
          durationMin: TRIAL_MIN,
          status: 'pending',
          teacherId,
          studentName: name,
          studentEmail: email || null,
          studentUserId: student.id,
          studentToken: token,
          teacherToken: newToken(),
          utm: Object.keys(utm).length ? utm : undefined
        }
      })
    })
    bookingsByIp.set(ip, [...recent, Date.now()])
    res.json({ token: lesson.studentToken, startsAt: lesson.startsAt, telegram: startLink(`l_${lesson.studentToken}`), confirmHours: CONFIRM_MS / HOUR })
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message })
    console.error('[booking]', error)
    res.status(500).json({ error: 'Не получилось записаться — попробуйте ещё раз' })
  }
})

// --- Teachers' free windows (Timetable) ------------------------------------------

const validZone = (zone) => { try { new Intl.DateTimeFormat('en', { timeZone: zone }); return zone } catch { return null } }
const windowSchema = z.object({
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  recurrence: z.enum(['WEEKLY']).nullable().optional(),
  timezone: z.string().max(64).optional().nullable()
})

bookingRouter.get('/windows', requireAuth, requireRole(...STAFF), async (req, res) => {
  const windows = await prisma.trialWindow.findMany({
    where: isAdmin(req.user) ? { teacher: { schoolId: req.user.schoolId } } : { teacherId: req.user.id },
    orderBy: { startTime: 'asc' },
    include: { teacher: { select: { id: true, name: true } } }
  })
  // One-off windows that are over aren't shown.
  res.json({ windows: windows.filter((w) => w.recurrence || new Date(w.endTime) > Date.now()), open: bookingOpen(), page: `${appUrl()}/trial` })
})

bookingRouter.post('/windows', requireAuth, requireRole(...STAFF), express.json(), async (req, res) => {
  const parsed = windowSchema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ error: 'Choose the day and the time' })
  const startTime = new Date(parsed.data.startTime)
  const endTime = new Date(parsed.data.endTime)
  if (endTime - startTime < TRIAL_MIN * MIN) return res.status(400).json({ error: `A window must be at least ${TRIAL_MIN} minutes` })
  if (endTime - startTime > 16 * HOUR) return res.status(400).json({ error: 'A window can be at most 16 hours' })
  if (!parsed.data.recurrence && endTime < Date.now()) return res.status(400).json({ error: 'This time is already over' })
  const window = await prisma.trialWindow.create({
    data: { teacherId: req.user.id, startTime, endTime, recurrence: parsed.data.recurrence ?? null, timezone: validZone(parsed.data.timezone) },
    include: { teacher: { select: { id: true, name: true } } }
  })
  res.status(201).json({ window })
})

bookingRouter.delete('/windows/:id', requireAuth, requireRole(...STAFF), async (req, res) => {
  const window = await prisma.trialWindow.findUnique({ where: { id: req.params.id }, include: { teacher: { select: { schoolId: true } } } })
  const mine = window && (window.teacherId === req.user.id || (isAdmin(req.user) && window.teacher.schoolId === req.user.schoolId))
  if (!mine) return res.status(404).json({ error: 'Not found' })
  await prisma.trialWindow.delete({ where: { id: window.id } })
  res.json({ ok: true })
})

// --- Moving a trial, or giving it to another teacher (Timetable) ---------------

async function lessonFor(req) {
  const lesson = await prisma.adventLesson.findUnique({ where: { id: req.params.id } })
  if (!lesson || !['pending', 'scheduled'].includes(lesson.status)) return null
  const teacher = await prisma.user.findUnique({ where: { id: lesson.teacherId }, select: { schoolId: true } })
  if (teacher?.schoolId !== req.user.schoolId) return null
  if (lesson.teacherId !== req.user.id && !isAdmin(req.user)) return null
  return lesson
}

bookingRouter.post('/lessons/:id/move', requireAuth, requireRole(...STAFF), express.json(), async (req, res) => {
  const lesson = await lessonFor(req)
  if (!lesson) return res.status(404).json({ error: 'Lesson not found' })
  const startsAt = new Date(String(req.body?.startsAt ?? ''))
  if (Number.isNaN(startsAt.getTime()) || startsAt < Date.now()) return res.status(400).json({ error: 'Choose a time in the future' })
  const busy = await busyFor(lesson.teacherId, new Date(startsAt.getTime() - 3 * HOUR), new Date(startsAt.getTime() + 3 * HOUR), lesson.id)
  if (clash(busy, startsAt.getTime(), startsAt.getTime() + lesson.durationMin * MIN)) return res.status(409).json({ error: 'The teacher has another lesson at that time' })
  await prisma.adventLesson.update({ where: { id: lesson.id }, data: { startsAt } })
  if (lesson.calendarEventId) {
    await prisma.userCalendarEvent.updateMany({ where: { id: lesson.calendarEventId }, data: { startTime: startsAt, endTime: new Date(startsAt.getTime() + lesson.durationMin * MIN) } })
  }
  // Booked on Maxim's site: his site moves it too.
  if (lesson.source !== 'platform') {
    await toAdventLater('move', 'PATCH', `/lessons/${encodeURIComponent(lesson.adventId)}`, { starts_at: startsAt.toISOString(), changed_by: lesson.teacherId === req.user.id ? 'teacher' : 'admin' }, lesson.id)
  }
  res.json({ ok: true })
})

bookingRouter.get('/teachers', requireAuth, requireRole(...STAFF), async (req, res) => {
  const teachers = await prisma.user.findMany({ where: { schoolId: req.user.schoolId, role: { in: STAFF } }, select: { id: true, name: true }, orderBy: { name: 'asc' } })
  res.json({ teachers })
})

bookingRouter.post('/lessons/:id/teacher', requireAuth, requireRole('OWNER', 'PARTNER'), express.json(), async (req, res) => {
  const lesson = await lessonFor(req)
  if (!lesson) return res.status(404).json({ error: 'Lesson not found' })
  const teacher = await prisma.user.findFirst({ where: { id: String(req.body?.teacherId ?? ''), schoolId: req.user.schoolId, role: { in: STAFF } }, select: { id: true } })
  if (!teacher) return res.status(400).json({ error: 'Choose a teacher' })
  if (teacher.id === lesson.teacherId) return res.json({ ok: true })
  const start = new Date(lesson.startsAt).getTime()
  const busy = await busyFor(teacher.id, new Date(start - 3 * HOUR), new Date(start + 3 * HOUR))
  if (clash(busy, start, start + lesson.durationMin * MIN)) return res.status(409).json({ error: 'That teacher has another lesson at that time' })
  if (lesson.callId) return res.status(409).json({ error: 'The lesson has already started' })
  let row = await prisma.adventLesson.update({ where: { id: lesson.id }, data: { teacherId: teacher.id, teacherConfirmedAt: null } })
  if (row.calendarEventId) await prisma.userCalendarEvent.updateMany({ where: { id: row.calendarEventId }, data: { userId: teacher.id } })
  if (row.status === 'scheduled') row = await ensureStudent(row, teacher.id)
  if (lesson.source !== 'platform') {
    const next = await prisma.user.findUnique({ where: { id: teacher.id }, select: { email: true, name: true } })
    await toAdventLater('teacher', 'PATCH', `/lessons/${encodeURIComponent(lesson.adventId)}`, { teacher_email: next.email, changed_by: 'admin' }, lesson.id)
  }
  // A student who came only for this trial leaves the old teacher's list (no lessons with them yet).
  const student = row.studentUserId ? await prisma.user.findUnique({ where: { id: row.studentUserId }, select: { viaLink: true } }) : null
  if (student?.viaLink) {
    const held = await prisma.session.count({ where: { classroom: { studentId: row.studentUserId, teacherId: lesson.teacherId } } })
    if (!held) await prisma.teacherStudent.deleteMany({ where: { teacherId: lesson.teacherId, studentId: row.studentUserId } })
  }
  res.json({ ok: true })
})

// People → «Пробные уроки»: a booking that shouldn't be there (a test, a
// duplicate) is removed from the platform. Nobody is told — a real lesson is
// cancelled from the Timetable instead. The account made only for it (no
// other bookings, no lessons held, nothing paid) goes too.
bookingRouter.delete('/lessons/:id', requireAuth, requireRole('OWNER', 'PARTNER'), async (req, res) => {
  const lesson = await prisma.adventLesson.findUnique({ where: { id: req.params.id } })
  const teacher = lesson ? await prisma.user.findUnique({ where: { id: lesson.teacherId }, select: { schoolId: true } }) : null
  if (!lesson || teacher?.schoolId !== req.user.schoolId) return res.status(404).json({ error: 'Not found' })
  if (lesson.calendarEventId) await prisma.userCalendarEvent.deleteMany({ where: { id: lesson.calendarEventId } })
  await prisma.adventLesson.delete({ where: { id: lesson.id } })
  // Removed for good: neither Maxim's next event about it nor the
  // reconciliation with his list brings it back.
  if (lesson.source !== 'platform') await prisma.adventEvent.create({ data: { id: `removed:${lesson.adventId}` } }).catch(() => {})
  let accountRemoved = false
  if (lesson.studentUserId) {
    const student = await prisma.user.findUnique({ where: { id: lesson.studentUserId }, select: { role: true, schoolId: true, viaLink: true, lessonsPaid: true } })
    const [others, held] = await Promise.all([
      prisma.adventLesson.count({ where: { studentUserId: lesson.studentUserId } }),
      prisma.session.count({ where: { classroom: { studentId: lesson.studentUserId } } })
    ])
    if (student?.role === 'STUDENT' && student.schoolId === req.user.schoolId && student.viaLink && !(student.lessonsPaid > 0) && !others && !held) {
      await prisma.user.delete({ where: { id: lesson.studentUserId } })
      accountRemoved = true
    }
  }
  res.json({ ok: true, accountRemoved })
})
