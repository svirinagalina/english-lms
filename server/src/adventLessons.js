import crypto from 'crypto'
import express from 'express'
import { prisma } from './db.js'
import { guardedFetch } from './resilience.js'
import { hashPassword, issueToken } from './auth.js'
import { ensureClassroom } from './routes/classrooms.js'
import { sendAdventLessonEmail } from './mailer.js'
import { notify } from './push.js'

// Lessons booked on the Advent site (Maxim's partner API, see
// ~/Downloads/Интеграция_платформы_уроков_Галины_с_Advent.md). Advent sends
// every new, moved or cancelled lesson here; the lesson goes into the
// teacher's Timetable. When the teacher starts a call for it, the platform
// tells Advent when it started, how it ended and, for a trial, the report.

const API_URL = () => (process.env.ADVENT_API_URL ?? 'https://advent-academy.online/api/v1/partner').replace(/\/$/, '')
const APP_URL = () => (process.env.APP_URL ?? 'https://lms.advent-academy.online').replace(/\/$/, '')
export const adventLessonsEnabled = () => Boolean(process.env.ADVENT_API_KEY && process.env.ADVENT_WEBHOOK_SECRET)

export async function adventApi(method, path, body) {
  const response = await guardedFetch('advent-site', `${API_URL()}${path}`, {
    method,
    headers: { 'X-API-Key': process.env.ADVENT_API_KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  }, { timeoutMs: 15000 })
  const text = await response.text()
  if (!response.ok) throw new Error(`Advent ${method} ${path}: ${response.status} ${text.slice(0, 200)}`)
  return text ? JSON.parse(text) : null
}

const MEMO = [
  'Пробный урок по записи с сайта Advent.',
  'Перед уроком: 1) создайте доску в My boards; 2) назначьте её ученику (Assign);',
  '3) в первый раз нажмите Trial lesson — не Start lesson. После урока отчёт с уровнем уйдёт ученику сам.'
].join('\n')

const eventTitle = (lesson) => {
  const who = lesson.student?.name || 'ученик'
  const prefix = lesson.is_test ? '[ТЕСТ] ' : ''
  return lesson.kind === 'trial' ? `${prefix}Пробный урок — ${who} (Advent)` : `${prefix}${lesson.title || 'Урок'} — ${who} (Advent)`
}
const eventDescription = (lesson) => [
  lesson.kind === 'trial' ? MEMO : null,
  lesson.topic ? `Тема: ${lesson.topic}` : null,
  lesson.student?.telegram ? `Telegram ученика: ${lesson.student.telegram}` : null,
  lesson.student?.email ? `Почта ученика: ${lesson.student.email}` : null
].filter(Boolean).join('\n')

// Personal links: a random token each, no password needed (Advent's rules).
// Lessons booked before the tokens existed got `/?advent=<id>`; that link
// still opens the student's side (see lessonLink).
const newToken = () => crypto.randomBytes(18).toString('base64url')
const links = (row) => ({
  lesson_id: row.id,
  student_join_url: `${APP_URL()}/lesson/${row.studentToken}`,
  teacher_join_url: `${APP_URL()}/lesson/${row.teacherToken}`
})
async function withTokens(row) {
  if (row.studentToken && row.teacherToken) return row
  return prisma.adventLesson.update({ where: { id: row.id }, data: { studentToken: row.studentToken ?? newToken(), teacherToken: row.teacherToken ?? newToken() } })
}

// The student of a booking: an account made for it (signing in by the link),
// linked to the teacher so the lesson is in the teacher's students with its
// own cabinet — the teacher starts "Trial lesson" there. The same Advent
// student booking again gets the same account.
async function ensureStudent(row, teacherId) {
  const teacher = await prisma.user.findUnique({ where: { id: teacherId }, select: { schoolId: true } })
  let student = row.studentUserId ? await prisma.user.findUnique({ where: { id: row.studentUserId } }) : null
  const placeholder = `advent-${(row.studentAdventId || row.adventId).replace(/[^A-Za-z0-9_-]/g, '')}@trial.invalid`
  if (!student) student = await prisma.user.findUnique({ where: { email: placeholder } })
  const email = row.studentEmail?.trim().toLowerCase()
  if (!student && email) student = await prisma.user.findUnique({ where: { email } })
  if (!student) {
    student = await prisma.user.create({
      data: {
        email: email || placeholder,
        name: row.studentName?.trim() || 'Ученик',
        role: 'STUDENT',
        schoolId: teacher.schoolId,
        passwordHash: await hashPassword(newToken()),
        messenger: row.studentTelegram || null,
        viaLink: true
      }
    })
  }
  if (student.role !== 'STUDENT' || student.schoolId !== teacher.schoolId) return row
  await prisma.teacherStudent.upsert({
    where: { teacherId_studentId: { teacherId, studentId: student.id } },
    create: { teacherId, studentId: student.id },
    update: {}
  })
  const classroom = await ensureClassroom(teacherId, student.id, teacher.schoolId)
  return prisma.adventLesson.update({ where: { id: row.id }, data: { studentUserId: student.id, classroomId: row.callId ? row.classroomId : classroom.id } })
}

const MSK = (d) => new Date(d).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

// The teacher hears of a new (or moved) lesson at once: email and the phone.
async function tellTeacher(row, moved = false) {
  const teacher = await prisma.user.findUnique({ where: { id: row.teacherId }, select: { email: true, name: true } })
  if (!teacher) return
  const what = row.kind === 'trial' ? 'Пробный урок' : 'Урок'
  const who = row.studentName || 'ученик'
  const when = `${MSK(row.startsAt)} (МСК)`
  const link = links(row).teacher_join_url
  sendAdventLessonEmail({ to: teacher.email, teacherName: teacher.name, what, who, when, link, moved, telegram: row.studentTelegram, isTest: row.isTest })
    .catch((error) => console.error('[advent] teacher email', error.message))
  notify([row.teacherId], { title: `${moved ? 'Перенос: ' : ''}${what} — ${who}`, body: `${when}. Ссылка на урок — в почте и в Timetable.`, url: `/lesson/${row.teacherToken}` })
    .catch((error) => console.error('[advent] teacher push', error.message))
  await prisma.adventLesson.update({ where: { id: row.id }, data: { teacherNotifiedAt: new Date() } })
}

async function teacherFor(lesson) {
  const email = String(lesson.teacher?.email ?? '').trim()
  if (!email) return null
  return prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' }, role: { in: ['OWNER', 'PARTNER', 'TEACHER'] } },
    select: { id: true }
  })
}

const teacherMissing = (lesson) => ({
  error: 'teacher_not_found',
  message: `Преподаватель ${lesson.teacher?.name ?? ''} <${lesson.teacher?.email || 'почта не указана'}> не зарегистрирован на платформе уроков. ` +
    'Добавьте его на платформе с этой же почтой — урок подтянется при следующей попытке.'
})

async function saveCalendar(row, lesson, teacherId) {
  const startTime = new Date(lesson.starts_at)
  const endTime = new Date(startTime.getTime() + (lesson.duration_min || (lesson.kind === 'trial' ? 40 : 60)) * 60000)
  const data = { title: eventTitle(lesson), description: eventDescription(lesson), startTime, endTime, userId: teacherId }
  if (row?.calendarEventId) {
    const existing = await prisma.userCalendarEvent.findUnique({ where: { id: row.calendarEventId } })
    if (existing) return (await prisma.userCalendarEvent.update({ where: { id: existing.id }, data })).id
  }
  return (await prisma.userCalendarEvent.create({ data })).id
}

const lessonFields = (lesson, teacherId) => ({
  kind: lesson.kind === 'trial' ? 'trial' : 'regular',
  title: String(lesson.title ?? '').slice(0, 300),
  topic: lesson.topic ? String(lesson.topic).slice(0, 300) : null,
  startsAt: new Date(lesson.starts_at),
  durationMin: Number(lesson.duration_min) || (lesson.kind === 'trial' ? 40 : 60),
  isTest: Boolean(lesson.is_test) || /^\[ТЕСТ\]/i.test(lesson.title ?? ''),
  teacherId,
  studentAdventId: lesson.student?.id ? String(lesson.student.id) : null,
  studentName: lesson.student?.name ?? null,
  studentTelegram: lesson.student?.telegram ?? null,
  studentEmail: lesson.student?.email || null
})

// What each event does; returns [status, body].
async function handle(event) {
  const lesson = event.lesson ?? {}
  const adventId = String(lesson.id ?? '')
  if (!adventId || !lesson.starts_at) return [422, { error: 'invalid_lesson', message: 'Нет lesson.id или lesson.starts_at' }]
  const row = await prisma.adventLesson.findUnique({ where: { adventId } })

  if (event.event === 'lesson.cancelled') {
    if (!row) return [200, {}]
    if (row.calendarEventId) await prisma.userCalendarEvent.deleteMany({ where: { id: row.calendarEventId } })
    await prisma.adventLesson.update({ where: { id: row.id }, data: { status: 'cancelled', calendarEventId: null } })
    return [200, {}]
  }

  if (event.event !== 'lesson.created' && event.event !== 'lesson.updated') return [422, { error: 'unknown_event', message: `Событие ${event.event} не поддерживается` }]

  const teacher = await teacherFor(lesson)
  if (!teacher) return [422, teacherMissing(lesson)]
  const fields = lessonFields(lesson, teacher.id)

  if (row) {
    // The teacher changed: the lesson leaves the old Timetable.
    if (row.teacherId !== teacher.id && row.calendarEventId) {
      await prisma.userCalendarEvent.deleteMany({ where: { id: row.calendarEventId } })
      row.calendarEventId = null
    }
    const calendarEventId = await saveCalendar(row, lesson, teacher.id)
    const moved = row.teacherId !== teacher.id || new Date(row.startsAt).getTime() !== fields.startsAt.getTime()
    let updated = await prisma.adventLesson.update({ where: { id: row.id }, data: { ...fields, status: 'scheduled', calendarEventId } })
    updated = await ensureStudent(await withTokens(updated), teacher.id)
    if (moved) await tellTeacher(updated, true).catch((error) => console.error('[advent] tell teacher', error.message))
    return [200, links(updated)]
  }
  const created = await prisma.adventLesson.create({ data: { ...fields, adventId, status: 'scheduled', studentToken: newToken(), teacherToken: newToken() } })
  const calendarEventId = await saveCalendar(null, lesson, teacher.id)
  let saved = await prisma.adventLesson.update({ where: { id: created.id }, data: { calendarEventId } })
  saved = await ensureStudent(saved, teacher.id).catch((error) => { console.error('[advent] student', error.message); return saved })
  await tellTeacher(saved).catch((error) => console.error('[advent] tell teacher', error.message))
  return [200, links(saved)]
}

function signatureOk(req) {
  const timestamp = req.get('X-Advent-Timestamp') ?? ''
  const signature = (req.get('X-Advent-Signature') ?? '').replace(/^sha256=/, '')
  const sentAt = /^\d+$/.test(timestamp) ? Number(timestamp) * (timestamp.length > 11 ? 1 : 1000) : Date.parse(timestamp)
  if (!Number.isFinite(sentAt) || Math.abs(Date.now() - sentAt) > 5 * 60 * 1000) return false
  const expected = crypto.createHmac('sha256', process.env.ADVENT_WEBHOOK_SECRET).update(`${timestamp}.${req.body.toString('utf8')}`).digest('hex')
  const a = Buffer.from(expected, 'hex')
  const b = Buffer.from(signature, 'hex')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

// Mounted before express.json: the signature is over the raw body.
export const adventWebhook = express.Router()
adventWebhook.post('/', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
  if (!adventLessonsEnabled()) return res.status(503).json({ error: 'not_configured', message: 'Интеграция с Advent не настроена на платформе' })
  if (!Buffer.isBuffer(req.body) || !signatureOk(req)) return res.status(401).json({ error: 'bad_signature', message: 'Неверная подпись или запрос старше 5 минут' })
  let event
  try { event = JSON.parse(req.body.toString('utf8')) } catch { return res.status(400).json({ error: 'bad_json', message: 'Тело запроса — не JSON' }) }
  const eventId = String(event.event_id ?? '')
  if (!eventId) return res.status(422).json({ error: 'no_event_id', message: 'Нет event_id' })

  // A retry of an event already handled: the same answer, nothing new.
  const seen = await prisma.adventEvent.findUnique({ where: { id: eventId } })
  if (seen) {
    const row = seen.lessonId ? await prisma.adventLesson.findUnique({ where: { id: seen.lessonId } }) : null
    return res.json(row && event.event === 'lesson.created' ? links(await withTokens(row)) : {})
  }
  try {
    const [status, body] = await handle(event)
    // Only a success is remembered: a refused event (no such teacher yet)
    // is handled afresh when Advent retries it.
    if (status === 200) {
      const row = await prisma.adventLesson.findUnique({ where: { adventId: String(event.lesson?.id) } })
      await prisma.adventEvent.create({ data: { id: eventId, lessonId: row?.id ?? null } }).catch(() => {})
    }
    if (status !== 200) console.warn('[advent] webhook refused', event.event, event.lesson?.id, body.error)
    res.status(status).json(body)
  } catch (error) {
    console.error('[advent] webhook failed', error)
    res.status(500).json({ error: 'server_error', message: 'Ошибка на платформе уроков, повторите позже' })
  }
})

// Cancelled on the platform (a Timetable button): its teacher or an admin.
export async function cancelAdventLesson(id, user, reason) {
  const lesson = await prisma.adventLesson.findUnique({ where: { id } })
  const admin = user.role === 'OWNER' || user.role === 'PARTNER'
  if (!lesson || (lesson.teacherId !== user.id && !admin)) throw Object.assign(new Error('Lesson not found'), { status: 404 })
  if (lesson.status === 'cancelled') return
  if (!adventLessonsEnabled()) throw Object.assign(new Error('The Advent connection is not set up'), { status: 503 })
  await adventApi('POST', `/lessons/${encodeURIComponent(lesson.adventId)}/cancel`, { reason, cancelled_by: lesson.teacherId === user.id ? 'teacher' : 'admin' })
  if (lesson.calendarEventId) await prisma.userCalendarEvent.deleteMany({ where: { id: lesson.calendarEventId } })
  await prisma.adventLesson.update({ where: { id }, data: { status: 'cancelled', calendarEventId: null } })
}

// --- The call side ------------------------------------------------------------

// A call a teacher starts is the lesson Advent booked for them now: the same
// teacher, the same kind, starting within an hour and a half of the booked time.
export async function linkCallToAdventLesson(call) {
  if (!adventLessonsEnabled()) return
  const now = Date.now()
  const lesson = await prisma.adventLesson.findFirst({
    where: {
      teacherId: call.hostId,
      status: 'scheduled',
      callId: null,
      kind: call.kind === 'TRIAL' ? 'trial' : 'regular',
      startsAt: { gte: new Date(now - 90 * 60000), lte: new Date(now + 90 * 60000) }
    },
    orderBy: { startsAt: 'asc' }
  })
  if (!lesson) return
  await prisma.adventLesson.update({ where: { id: lesson.id }, data: { callId: call.id, classroomId: call.classroomId ?? null } })
}

const iso = (d) => (d ? new Date(d).toISOString() : null)

// Someone entered or left a call: kept per role; the first entry is "started".
export async function adventCallPresence(callId, role, joined) {
  if (!adventLessonsEnabled() || !callId) return
  const lesson = await prisma.adventLesson.findUnique({ where: { callId } })
  if (!lesson) return
  const staff = role !== 'STUDENT'
  const now = new Date()
  const data = joined
    ? (staff ? (lesson.teacherJoinedAt ? {} : { teacherJoinedAt: now }) : (lesson.studentJoinedAt ? {} : { studentJoinedAt: now }))
    : (staff ? { teacherLeftAt: now } : { studentLeftAt: now })
  if (joined && !lesson.startedSentAt) data.startedSentAt = now
  if (Object.keys(data).length) await prisma.adventLesson.update({ where: { id: lesson.id }, data })
  if (joined && !lesson.startedSentAt) {
    adventApi('POST', `/lessons/${encodeURIComponent(lesson.adventId)}/started`, { started_at: now.toISOString() })
      .catch((error) => console.error('[advent] started', error.message))
  }
}

// The call ended: how the lesson went, once. A student who never came in is
// a no-show; the teacher started the call, so the teacher was there.
export async function adventCallEnded(callId) {
  if (!adventLessonsEnabled() || !callId) return
  const lesson = await prisma.adventLesson.findUnique({ where: { callId } })
  if (!lesson || lesson.finishedSentAt) return
  const outcome = !lesson.teacherJoinedAt ? 'teacher_no_show' : !lesson.studentJoinedAt ? 'student_no_show' : 'held'
  const started = [lesson.teacherJoinedAt, lesson.studentJoinedAt].filter(Boolean).sort((a, b) => a - b)[0] ?? new Date()
  const body = {
    outcome,
    started_at: iso(started),
    ended_at: new Date().toISOString(),
    teacher_joined_at: iso(lesson.teacherJoinedAt), teacher_left_at: iso(lesson.teacherLeftAt),
    student_joined_at: iso(lesson.studentJoinedAt), student_left_at: iso(lesson.studentLeftAt)
  }
  try {
    await adventApi('POST', `/lessons/${encodeURIComponent(lesson.adventId)}/finished`, body)
    await prisma.adventLesson.update({ where: { id: lesson.id }, data: { finishedSentAt: new Date(), outcome } })
  } catch (error) { console.error('[advent] finished', error.message) }
}

// A trial report was published to the student: it goes to Advent too, once.
export async function adventTrialReport(report) {
  if (!adventLessonsEnabled() || !report?.callId) return
  const lesson = await prisma.adventLesson.findUnique({ where: { callId: report.callId } })
  if (!lesson || lesson.reportSentAt) return
  const g = report.generated ?? {}
  const body = {
    summary: String(g.summary ?? '').slice(0, 800),
    strengths: (g.strengths ?? []).slice(0, 5),
    to_improve: (g.focus ?? []).map((f) => (typeof f === 'string' ? f : f.topic)).filter(Boolean).slice(0, 5),
    homework: (g.plan ?? []).join('\n').slice(0, 1000),
    level: g.level ?? report.teacherLevel ?? null,
    report_url: `${APP_URL()}/report/${report.id}`
  }
  try {
    await adventApi('POST', `/lessons/${encodeURIComponent(lesson.adventId)}/report`, body)
    await prisma.adventLesson.update({ where: { id: lesson.id }, data: { reportSentAt: new Date() } })
  } catch (error) { console.error('[advent] report', error.message) }
}

// --- The lesson links ----------------------------------------------------------

// A token is a student's or a teacher's; an old `/?advent=<id>` link is the
// student's (those went out before the tokens existed).
async function byToken(token) {
  token = String(token ?? '')
  if (!token || token.length > 80) return null
  // Old-style ids only for the lessons booked before the tokens (2026-10-13).
  const row = await prisma.adventLesson.findFirst({ where: { OR: [{ studentToken: token }, { teacherToken: token }, { id: token, createdAt: { lt: new Date('2026-10-13T14:00:00Z') } }] } })
  if (!row) return null
  return { row, role: row.teacherToken === token ? 'teacher' : 'student' }
}

// The call the teacher started for this lesson, while it is on.
async function liveCallToken(row) {
  if (row.callId) {
    const call = await prisma.call.findUnique({ where: { id: row.callId }, select: { token: true, endedAt: true } })
    if (call && !call.endedAt) return call.token
  }
  if (row.classroomId) {
    const call = await prisma.call.findFirst({ where: { classroomId: row.classroomId, endedAt: null, createdAt: { gte: new Date(Date.now() - 4 * 3600000) } }, orderBy: { createdAt: 'desc' }, select: { token: true } })
    if (call) return call.token
  }
  return null
}

export const lessonLinkRouter = express.Router()

lessonLinkRouter.get('/:token', async (req, res) => {
  const found = await byToken(req.params.token)
  if (!found) return res.status(404).json({ error: 'Ссылка не найдена — проверьте, что она скопирована целиком' })
  let { row, role } = found
  if (role === 'student' && !row.studentUserId && row.status === 'scheduled') row = await ensureStudent(row, row.teacherId).catch(() => row)
  const teacher = await prisma.user.findUnique({ where: { id: row.teacherId }, select: { name: true } })
  const student = row.studentUserId ? await prisma.user.findUnique({ where: { id: row.studentUserId }, select: { name: true, viaLink: true } }) : null
  res.json({
    role,
    kind: row.kind,
    status: row.status,
    startsAt: row.startsAt,
    durationMin: row.durationMin,
    teacherName: teacher?.name ?? null,
    studentName: student?.name ?? row.studentName ?? null,
    // A student who already has an account of their own signs in with it.
    ownAccount: role === 'student' && student ? !student.viaLink : false,
    classroomId: row.classroomId,
    callToken: row.status === 'scheduled' ? await liveCallToken(row) : null
  })
})

// Enter by the link: signed in as the lesson's student (an account made for
// it) or its teacher, without a password.
lessonLinkRouter.post('/:token/enter', express.json(), async (req, res) => {
  const found = await byToken(req.params.token)
  if (!found) return res.status(404).json({ error: 'Ссылка не найдена' })
  let { row, role } = found
  if (row.status === 'cancelled') return res.status(410).json({ error: 'Урок отменён' })
  // Usable until six hours after the lesson.
  if (Date.now() > new Date(row.startsAt).getTime() + (row.durationMin + 360) * 60000) return res.status(410).json({ error: 'Эта ссылка уже не действует — урок прошёл' })
  if (role === 'teacher') {
    const teacher = await prisma.user.findUnique({ where: { id: row.teacherId } })
    if (!teacher) return res.status(404).json({ error: 'Преподаватель не найден' })
    issueToken(res, teacher)
    return res.json({ ok: true, redirect: row.classroomId ? `/classroom/${row.classroomId}` : '/timetable' })
  }
  if (!row.studentUserId) row = await ensureStudent(row, row.teacherId)
  const student = row.studentUserId ? await prisma.user.findUnique({ where: { id: row.studentUserId } }) : null
  if (!student) return res.status(404).json({ error: 'Ученик не найден' })
  if (!student.viaLink) return res.status(409).json({ error: 'У вас уже есть аккаунт — войдите в него, урок будет в кабинете', ownAccount: true })
  const name = String(req.body?.name ?? '').trim().slice(0, 80)
  if (name && name !== student.name) await prisma.user.update({ where: { id: student.id }, data: { name } })
  issueToken(res, student)
  res.json({ ok: true })
})
