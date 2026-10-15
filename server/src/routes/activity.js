import { Router } from 'express'
import { prisma } from '../db.js'
import { requireAuth, requireRole, isAdmin } from '../auth.js'
import { limitedToSite, peopleScope, siteStudentIds, maySeeStudent } from '../partnerScope.js'
import { generateRecurringInstances } from './personal.js'

// Who opened which part of the platform, and what they did there — for the
// school's owner. The browser reports a section when a page opens; the work
// itself (practice, words, mistakes, lessons, reports) is read from its own
// tables.
export const activityRouter = Router()
activityRouter.use(requireAuth)

const SECTIONS = new Set(['home', 'classroom', 'board', 'call', 'practice', 'mistakes', 'trainer', 'vocabulary', 'dictionary', 'courses', 'writing', 'progress', 'report', 'billing', 'plans', 'calendar', 'todo', 'profile', 'settings', 'people', 'content', 'timetable', 'other'])
const DAY_MS = 24 * 60 * 60 * 1000
const dayKey = (date) => date.toISOString().slice(0, 10)

activityRouter.post('/', async (req, res) => {
  const section = SECTIONS.has(req.body?.section) ? req.body.section : 'other'
  const now = new Date()
  const day = dayKey(now)
  await prisma.$transaction([
    prisma.activityDay.upsert({
      where: { userId_day_section: { userId: req.user.id, day, section } },
      create: { userId: req.user.id, day, section, lastAt: now },
      update: { visits: { increment: 1 }, lastAt: now }
    }),
    prisma.user.update({ where: { id: req.user.id }, data: { lastSeenAt: now } })
  ]).catch(() => {})
  res.json({ ok: true })
})

// Everyone in the school, most recently active first, with a 30-day summary.
activityRouter.get('/people', requireRole('OWNER'), async (req, res) => {
  const since = dayKey(new Date(Date.now() - 30 * DAY_MS))
  const users = await prisma.user.findMany({
    where: { schoolId: req.user.schoolId, ...(await peopleScope(req.user)) },
    select: { id: true, name: true, email: true, role: true, free: true, createdAt: true, lastSeenAt: true }
  })
  const rows = await prisma.activityDay.groupBy({
    by: ['userId', 'day'],
    where: { userId: { in: users.map((u) => u.id) }, day: { gte: since } },
    _sum: { visits: true }
  })
  const days = new Map()
  for (const r of rows) days.set(r.userId, (days.get(r.userId) ?? 0) + 1)
  const people = users
    .map((u) => ({ ...u, activeDays30: days.get(u.id) ?? 0 }))
    .sort((a, b) => (b.lastSeenAt?.getTime() ?? 0) - (a.lastSeenAt?.getTime() ?? 0) || a.name.localeCompare(b.name))
  res.json({ people })
})

// One person: the sections they opened, day by day, and what they worked on.
// The administrator sees anyone in the school; a teacher sees their own
// students (and themselves).
activityRouter.get('/people/:id', requireRole('OWNER', 'PARTNER', 'TEACHER'), async (req, res) => {
  const user = await prisma.user.findFirst({
    where: { id: req.params.id, schoolId: req.user.schoolId },
    select: { id: true, name: true, email: true, role: true, free: true, createdAt: true, lastSeenAt: true, phone: true, messenger: true, city: true, timezone: true, plan: true, planUntil: true }
  })
  if (!user || (user.role === 'STUDENT' && !(await maySeeStudent(req.user, user.id)))) return res.status(404).json({ error: 'Person not found' })
  if (!isAdmin(req.user) && user.id !== req.user.id) {
    const link = await prisma.teacherStudent.findFirst({ where: { teacherId: req.user.id, studentId: user.id } })
    if (!link) return res.status(404).json({ error: 'Person not found' })
  }
  const since = new Date(Date.now() - 30 * DAY_MS)

  const [activity, attempts, attempts30, mistakes, ownCards, reviews, classrooms, reports] = await Promise.all([
    prisma.activityDay.findMany({ where: { userId: user.id, day: { gte: dayKey(new Date(Date.now() - 60 * DAY_MS)) } }, orderBy: [{ day: 'desc' }, { lastAt: 'desc' }] }),
    prisma.attempt.findMany({ where: { studentId: user.id }, orderBy: { createdAt: 'desc' }, take: 300, select: { correct: true, createdAt: true, exercise: { select: { unit: { select: { id: true, title: true } } } } } }),
    prisma.attempt.count({ where: { studentId: user.id, createdAt: { gte: since } } }),
    prisma.lessonMistake.findMany({ where: { studentId: user.id }, select: { practicedCorrect: true, lastPracticedAt: true, createdAt: true } }),
    prisma.vocabCard.count({ where: { set: { ownerId: user.id } } }),
    prisma.cardReview.findMany({ where: { studentId: user.id }, select: { streak: true, dueAt: true, lastResult: true } }),
    prisma.classroom.findMany({ where: { studentId: user.id }, select: { id: true, teacher: { select: { name: true } }, sessions: { where: { counted: true }, select: { startedAt: true }, orderBy: { startedAt: 'desc' } }, document: { select: { updatedAt: true } }, boards: { select: { id: true, title: true }, orderBy: { updatedAt: 'desc' }, take: 1 } } }),
    prisma.trialReport.findMany({ where: { studentId: user.id }, orderBy: { createdAt: 'desc' }, select: { id: true, createdAt: true, publishedAt: true, teacherLevel: true, generated: true, classroomId: true } })
  ])

  // Sections: totals over the period, most recent first.
  const sectionMap = new Map()
  for (const a of activity) {
    const s = sectionMap.get(a.section) ?? { section: a.section, visits: 0, days: 0, lastAt: a.lastAt }
    s.visits += a.visits; s.days += 1
    if (a.lastAt > s.lastAt) s.lastAt = a.lastAt
    sectionMap.set(a.section, s)
  }
  const timeline = []
  for (const a of activity) {
    let day = timeline[timeline.length - 1]
    if (day?.day !== a.day) { day = { day: a.day, sections: [] }; timeline.push(day) }
    day.sections.push({ section: a.section, visits: a.visits })
  }

  // Practice by unit.
  const units = new Map()
  for (const a of attempts) {
    const unit = a.exercise?.unit
    if (!unit) continue
    const u = units.get(unit.id) ?? { title: unit.title, attempts: 0, correct: 0, lastAt: a.createdAt }
    u.attempts += 1; if (a.correct) u.correct += 1
    units.set(unit.id, u)
  }

  const extra = user.role === 'STUDENT' ? await studentExtras(user) : await teacherExtras(user)
  const sessions = classrooms.flatMap((c) => c.sessions)
  res.json({
    user,
    sections: [...sectionMap.values()].sort((a, b) => b.lastAt - a.lastAt),
    timeline: timeline.slice(0, 30),
    work: {
      practice: {
        attempts: attempts.length >= 300 ? '300+' : attempts.length,
        last30: attempts30,
        accuracy: attempts.length ? Math.round((attempts.filter((a) => a.correct).length / attempts.length) * 100) : null,
        lastAt: attempts[0]?.createdAt ?? null,
        units: [...units.values()].slice(0, 12).map((u) => ({ ...u, accuracy: Math.round((u.correct / u.attempts) * 100) }))
      },
      mistakes: {
        total: mistakes.length,
        practiced: mistakes.filter((m) => m.practicedCorrect > 0).length,
        lastPracticedAt: mistakes.reduce((max, m) => (m.lastPracticedAt && (!max || m.lastPracticedAt > max) ? m.lastPracticedAt : max), null)
      },
      vocabulary: {
        ownCards: ownCards,
        inReview: reviews.length,
        learned: reviews.filter((r) => r.streak >= 3).length,
        due: reviews.filter((r) => r.dueAt <= new Date()).length
      },
      lessons: {
        held: sessions.length,
        last30: sessions.filter((s) => s.startedAt >= since).length,
        lastAt: sessions.sort((a, b) => b.startedAt - a.startedAt)[0]?.startedAt ?? null,
        classrooms: classrooms.map((c) => ({ id: c.id, teacher: c.teacher?.name ?? null, writingUpdatedAt: c.document?.updatedAt ?? null, board: c.boards?.[0] ?? null }))
      }
    },
    ...extra,
    reports: reports.map((r) => ({ id: r.id, classroomId: r.classroomId, createdAt: r.createdAt, publishedAt: r.publishedAt, level: r.generated?.level ?? r.teacherLevel ?? null, generated: Boolean(r.generated) }))
  })
})

// Trial reports: every one in the school for the owner, a teacher's own
// students' for a teacher.
activityRouter.get('/reports', requireRole('OWNER', 'PARTNER', 'TEACHER'), async (req, res) => {
  const reports = await prisma.trialReport.findMany({
    where: req.user.role === 'OWNER'
      ? { classroom: { schoolId: req.user.schoolId } }
      : limitedToSite(req.user)
        ? { classroom: { schoolId: req.user.schoolId }, studentId: { in: await siteStudentIds() } }
        : { classroom: { teacherId: req.user.id } },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: { id: true, createdAt: true, publishedAt: true, teacherLevel: true, generated: true, classroomId: true, studentId: true, teacherId: true, classroom: { select: { student: { select: { name: true } }, teacher: { select: { name: true } } } } }
  })
  res.json({
    reports: reports.map((r) => ({
      id: r.id, classroomId: r.classroomId, studentId: r.studentId, createdAt: r.createdAt, publishedAt: r.publishedAt,
      level: r.generated?.level ?? r.teacherLevel ?? null, generated: Boolean(r.generated),
      student: r.classroom?.student?.name ?? '—', teacher: r.classroom?.teacher?.name ?? '—'
    }))
  })
})


// --- Extras for the person page ---------------------------------------------

// A student's money and people: the package (paid / held since it started /
// left), the price, "I have paid", the rouble card they see, their teachers.
async function studentExtras(user) {
  const student = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      priceAmount: true, priceCurrency: true, lessonsPaid: true, packageStartedAt: true, heldAdjust: true, paymentReportedAt: true, payToTrialCard: true,
      studentLinks: { select: { teacher: { select: { id: true, name: true } } } }
    }
  })
  const held = await prisma.session.count({
    where: { classroom: { studentId: user.id }, counted: true, ...(student.packageStartedAt ? { startedAt: { gte: student.packageStartedAt } } : {}) }
  }) + student.heldAdjust
  const hadTrial = await prisma.trialReport.findFirst({ where: { studentId: user.id, publishedAt: { not: null } }, select: { id: true } })
  return {
    billing: {
      priceAmount: student.priceAmount, priceCurrency: student.priceCurrency,
      lessonsPaid: student.lessonsPaid, packageStartedAt: student.packageStartedAt, held,
      remaining: student.lessonsPaid == null ? null : student.lessonsPaid - held,
      paymentReportedAt: student.paymentReportedAt,
      card: (student.payToTrialCard ?? Boolean(hadTrial)) ? 'after-trial' : 'school'
    },
    teachers: student.studentLinks.map((l) => l.teacher),
    contacts: { phone: user.phone, messenger: user.messenger, city: user.city, timezone: user.timezone },
    plan: user.free ? { plan: user.plan, until: user.planUntil } : null
  }
}

// A teacher's work: students, lessons and hours (all time, 30 days, the last
// eight weeks), trial reports, and what is in their timetable for the week.
async function teacherExtras(user) {
  const DAY = 24 * 60 * 60 * 1000
  const since30 = new Date(Date.now() - 30 * DAY)
  const since8w = new Date(Date.now() - 56 * DAY)
  const [links, sessions, trials, events] = await Promise.all([
    prisma.teacherStudent.findMany({ where: { teacherId: user.id }, select: { student: { select: { id: true, name: true } } } }),
    prisma.session.findMany({ where: { classroom: { teacherId: user.id }, counted: true }, select: { startedAt: true, endedAt: true, classroom: { select: { studentId: true } } }, orderBy: { startedAt: 'desc' } }),
    prisma.trialReport.count({ where: { teacherId: user.id } }),
    prisma.userCalendarEvent.findMany({ where: { userId: user.id } })
  ])
  const minutes = (s) => (s.endedAt ? Math.max(0, Math.min(240, (s.endedAt - s.startedAt) / 60000)) : 0)
  const perStudent = new Map()
  for (const s of sessions) {
    const id = s.classroom?.studentId
    if (!id) continue
    const e = perStudent.get(id) ?? { total: 0, last30: 0, lastAt: null }
    e.total += 1
    if (s.startedAt >= since30) e.last30 += 1
    if (!e.lastAt || s.startedAt > e.lastAt) e.lastAt = s.startedAt
    perStudent.set(id, e)
  }
  const weeks = []
  for (let w = 7; w >= 0; w--) {
    const from = new Date(Date.now() - (w + 1) * 7 * DAY), to = new Date(Date.now() - w * 7 * DAY)
    const inWeek = sessions.filter((s) => s.startedAt >= from && s.startedAt < to)
    weeks.push({ from, lessons: inWeek.length, hours: Math.round(inWeek.reduce((n, s) => n + minutes(s), 0) / 6) / 10 })
  }
  const now = new Date(), weekAhead = new Date(Date.now() + 7 * DAY)
  const upcoming = events.flatMap((e) => generateRecurringInstances(e, now, weekAhead))
    .map((e) => ({ title: e.title, startTime: e.startTime, students: e.studentIds?.length ?? 0 }))
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime)).slice(0, 15)
  const last30 = sessions.filter((s) => s.startedAt >= since30)
  return {
    teaching: {
      students: links.map((l) => ({ ...l.student, ...(perStudent.get(l.student.id) ?? { total: 0, last30: 0, lastAt: null }) }))
        .sort((a, b) => (b.lastAt ?? 0) - (a.lastAt ?? 0)),
      lessons: sessions.length,
      lessons30: last30.length,
      hours30: Math.round(last30.reduce((n, s) => n + minutes(s), 0) / 6) / 10,
      hours8w: Math.round(sessions.filter((s) => s.startedAt >= since8w).reduce((n, s) => n + minutes(s), 0) / 6) / 10,
      weeks,
      trialReports: trials,
      upcoming
    }
  }
}

// Trial lessons booked on the Advent site, step by step, for the owner:
// booked → waited in the waiting room → held / who didn't come → report sent
// → paid. Everything from the platform's own records.
activityRouter.get('/trial-funnel', requireRole('OWNER', 'PARTNER'), async (req, res) => {
  const since = new Date(Date.now() - 45 * 86400000)
  const rows = await prisma.adventLesson.findMany({
    where: { kind: 'trial', startsAt: { gte: since }, ...(limitedToSite(req.user) ? { source: { not: 'platform' } } : {}) },
    orderBy: { startsAt: 'desc' }
  })
  const teacherIds = [...new Set(rows.map((r) => r.teacherId))]
  const studentIds = [...new Set(rows.map((r) => r.studentUserId).filter(Boolean))]
  const [teachers, students, reports] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: teacherIds }, schoolId: req.user.schoolId }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { id: { in: studentIds } }, select: { id: true, name: true, viaLink: true, lessonsPaid: true, paymentReportedAt: true } }),
    prisma.trialReport.findMany({ where: { studentId: { in: studentIds } }, select: { id: true, studentId: true, publishedAt: true, generated: true } })
  ])
  const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]))
  const T = byId(teachers), S = byId(students)
  // A booking whose account was made for it while the student already has one
  // (invited separately): the same teacher, the same first name or Telegram.
  const twins = {}
  if (req.user.role === 'OWNER') {
    const firstWord = (n) => String(n ?? '').trim().split(/\s+/)[0].toLowerCase()
    const handle = (v) => String(v ?? '').trim().replace(/^@/, '').toLowerCase()
    for (const r of rows) {
      const s = r.studentUserId ? S[r.studentUserId] : null
      if (!s?.viaLink) continue
      const others = await prisma.user.findMany({
        where: { schoolId: req.user.schoolId, role: 'STUDENT', viaLink: false, studentLinks: { some: { teacherId: r.teacherId } } },
        select: { id: true, name: true, email: true, messenger: true, telegramName: true }
      })
      const tg = handle(r.studentTelegram)
      const twin = others.find((o) => tg && [handle(o.messenger), handle(o.telegramName)].includes(tg)) ?? others.find((o) => firstWord(o.name) && firstWord(o.name) === firstWord(s.name))
      if (twin) twins[r.id] = { id: twin.id, name: twin.name, email: twin.email }
    }
  }
  res.json({
    trials: rows.filter((r) => T[r.teacherId]).map((r) => {
      const s = r.studentUserId ? S[r.studentUserId] : null
      const report = reports.filter((x) => x.studentId === r.studentUserId && x.publishedAt).sort((a, b) => b.publishedAt - a.publishedAt)[0] ?? null
      return {
        id: r.id,
        startsAt: r.startsAt,
        status: r.status,
        isTest: r.isTest,
        // Booked on Maxim's site ('advent') or the platform's /trial page, and from which ad.
        source: r.source,
        utm: r.utm ?? null,
        teacher: T[r.teacherId],
        student: s ? { id: s.id, name: s.name, registered: !s.viaLink } : { id: null, name: r.studentName ?? '—', registered: false },
        telegram: r.studentTelegram,
        waitedAt: r.studentWaitingAt,
        studentJoinedAt: r.studentJoinedAt,
        teacherJoinedAt: r.teacherJoinedAt,
        outcome: r.outcome,
        reportSentAt: report?.publishedAt ?? r.reportSentAt,
        reportId: report?.id ?? null,
        level: report?.generated?.level ?? null,
        lessonsPaid: s?.lessonsPaid ?? null,
        saysPaid: s?.paymentReportedAt ?? null,
        twin: twins[r.id] ?? null
      }
    })
  })
})
