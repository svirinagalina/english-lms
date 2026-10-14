import express from 'express'
import { prisma } from './db.js'
import { requireAuth, requireRole } from './auth.js'
import { adventApi, adventLessonsEnabled } from './adventLessons.js'
import { unenrollStudent } from './advent.js'

// Trial requests don't pile up (Galina, 2026-10-14): a month after the trial
// lesson, a student who didn't buy is removed from the platform — the
// booking, the account made for it, its board and report — and kept only as
// a contact (TrialContact), which goes to Maxim's site (POST /leads) so he can
// get back in touch later. Anyone who paid or made an account of their own
// is never touched; test bookings are just removed.

const DAY = 24 * 60 * 60 * 1000
const KEEP_DAYS = 30
const realEmail = (email) => (email && !/\.invalid$/i.test(email) ? email : null)

async function contactFrom(lesson, student) {
  const report = student
    ? await prisma.trialReport.findFirst({ where: { studentId: student.id, publishedAt: { not: null } }, orderBy: { publishedAt: 'desc' }, select: { generated: true, teacherLevel: true } })
    : null
  const teacher = await prisma.user.findUnique({ where: { id: lesson.teacherId }, select: { name: true, schoolId: true } })
  const telegram = lesson.studentTelegram || student?.telegramName || (/^@/.test(student?.messenger ?? '') ? student.messenger : null)
  const email = realEmail(student?.email) || realEmail(lesson.studentEmail)
  const phone = student?.phone || null
  if (!telegram && !email && !phone && !student?.telegramChatId) return null
  return {
    schoolId: student?.schoolId ?? teacher?.schoolId,
    name: student?.name || lesson.studentName || '—',
    telegram, email, phone,
    schoolBotChatId: student?.telegramChatId ?? null,
    source: lesson.source === 'platform' ? 'platform' : 'advent',
    adventStudentId: lesson.studentAdventId,
    bookedAt: lesson.createdAt,
    lessonAt: lesson.startsAt,
    teacherName: teacher?.name ?? null,
    outcome: lesson.outcome ?? (lesson.status === 'cancelled' ? 'cancelled' : null),
    level: report?.generated?.level ?? report?.teacherLevel ?? null,
    utm: lesson.utm ?? undefined
  }
}

async function removeLessons(lessons) {
  const events = lessons.map((l) => l.calendarEventId).filter(Boolean)
  if (events.length) await prisma.userCalendarEvent.deleteMany({ where: { id: { in: events } } })
  await prisma.adventLesson.deleteMany({ where: { id: { in: lessons.map((l) => l.id) } } })
}

export async function archiveOldTrials() {
  const cutoff = new Date(Date.now() - KEEP_DAYS * DAY)
  const old = await prisma.adventLesson.findMany({ where: { kind: 'trial', startsAt: { lt: cutoff } }, orderBy: { startsAt: 'asc' } })
  // One student at a time (a student may have booked more than once).
  const byStudent = new Map()
  for (const lesson of old) {
    const key = lesson.studentUserId ?? `lesson:${lesson.id}`
    byStudent.set(key, [...(byStudent.get(key) ?? []), lesson])
  }
  let archived = 0
  for (const [key, lessons] of byStudent) {
    const last = lessons[lessons.length - 1]
    const student = key.startsWith('lesson:') ? null : await prisma.user.findUnique({ where: { id: key } })
    // A real student now (paid, or an account of their own): left alone.
    if (student && (student.role !== 'STUDENT' || !student.viaLink || student.lessonsPaid > 0)) continue
    // Booked again within the month: wait until that one is a month old too.
    if (student && await prisma.adventLesson.count({ where: { studentUserId: student.id, startsAt: { gte: cutoff } } })) continue
    if (!lessons.every((l) => l.isTest)) {
      const contact = await contactFrom(last, student)
      if (contact?.schoolId) { await prisma.trialContact.create({ data: contact }); archived++ }
    }
    await removeLessons(lessons)
    if (student) {
      await prisma.user.delete({ where: { id: student.id } }).catch((error) => console.error('[archive] student', error.message))
      if (realEmail(student.email)) unenrollStudent(student.email)
    }
  }
  if (archived) console.log(`[archive] ${archived} trial contact(s) archived`)
  await sendContacts()
}

// To Maxim's site, once each; retried every day until it takes them.
async function sendContacts() {
  if (!adventLessonsEnabled()) return
  const pending = await prisma.trialContact.findMany({ where: { sentAt: null }, take: 100, orderBy: { createdAt: 'asc' } })
  for (const c of pending) {
    try {
      await adventApi('POST', '/leads', {
        platform_id: c.id,
        name: c.name,
        telegram: c.telegram,
        email: c.email,
        phone: c.phone,
        source: c.source,
        advent_student_id: c.adventStudentId,
        booked_at: c.bookedAt.toISOString(),
        trial_at: c.lessonAt.toISOString(),
        teacher: c.teacherName,
        outcome: c.outcome,
        level: c.level,
        utm: c.utm ?? null,
        reason: 'trial_not_bought'
      })
      await prisma.trialContact.update({ where: { id: c.id }, data: { sentAt: new Date(), sendError: null } })
    } catch (error) {
      await prisma.trialContact.update({ where: { id: c.id }, data: { sendError: String(error.message).slice(0, 300) } })
      // His site doesn't take them yet: the rest wait for tomorrow.
      if (/404|not found/i.test(error.message)) break
    }
  }
}

export function startArchiveJobs() {
  const run = () => archiveOldTrials().catch((error) => console.error('[archive]', error.message))
  setTimeout(run, 3 * 60 * 1000)
  setInterval(run, DAY)
}

// People → «Архив пробных»: the owner and the partner see them and can take a CSV.
export const trialContactsRouter = express.Router()
trialContactsRouter.use(requireAuth, requireRole('OWNER', 'PARTNER'))

trialContactsRouter.get('/', async (req, res) => {
  const contacts = await prisma.trialContact.findMany({ where: { schoolId: req.user.schoolId }, orderBy: { lessonAt: 'desc' }, take: 500 })
  res.json({ contacts, total: await prisma.trialContact.count({ where: { schoolId: req.user.schoolId } }) })
})

const cell = (v) => {
  const s = v == null ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === 'object' ? Object.entries(v).map(([k, x]) => `${k}=${x}`).join(' ') : String(v)
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
trialContactsRouter.get('/csv', async (req, res) => {
  const contacts = await prisma.trialContact.findMany({ where: { schoolId: req.user.schoolId }, orderBy: { lessonAt: 'desc' } })
  const head = ['Имя', 'Telegram', 'Почта', 'Телефон', 'Пробный урок', 'Записался', 'Преподаватель', 'Итог', 'Уровень', 'Откуда', 'Реклама', 'Передан Максиму']
  const rows = contacts.map((c) => [c.name, c.telegram, c.email, c.phone, c.lessonAt, c.bookedAt, c.teacherName, c.outcome, c.level, c.source, c.utm, c.sentAt])
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="trial-contacts.csv"')
  // A BOM, so Excel reads the Cyrillic right.
  res.send('﻿' + [head, ...rows].map((r) => r.map(cell).join(';')).join('\n'))
})
