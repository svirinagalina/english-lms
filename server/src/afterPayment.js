import crypto from 'crypto'
import { prisma } from './db.js'
import { sendTrialWelcomeEmail } from './mailer.js'
import { supportContact } from './settings.js'

// A student who came by a trial booking and has paid (Galina, 2026-10-15):
// the platform itself invites them by email — teachers don't — and sends a
// friendly welcome with a guide to the platform. Once per student
// (`welcomedAt`). Paid = lessons in the package (a transfer confirmed in
// Payments, or a card payment) or an active plan (Solo).
//  · No password yet (`viaLink`): an invitation to the email they gave when
//    paying (`inviteEmail`, or the booking's), inside the welcome letter.
//  · Already set a password (right after a card payment): the welcome alone.
// Without an email the lesson link itself asks for one (needsSignup).

const APP_URL = () => (process.env.APP_URL ?? 'https://lms.advent-academy.online').replace(/\/$/, '')
const INVITE_DAYS = 14
const realEmail = (email) => (email && !/\.invalid$/i.test(email) ? String(email).trim().toLowerCase() : null)
const paid = (u) => u.lessonsPaid > 0 || Boolean(u.plan && u.planUntil && new Date(u.planUntil) > new Date())

export async function welcomeSweep() {
  const fromTrial = await prisma.adventLesson.findMany({ where: { kind: 'trial', studentUserId: { not: null } }, select: { studentUserId: true }, distinct: ['studentUserId'] })
  for (const { studentUserId } of fromTrial) {
    const u = await prisma.user.findUnique({ where: { id: studentUserId } })
    if (!u || u.role !== 'STUDENT' || u.welcomedAt || !paid(u)) continue
    const link = await prisma.teacherStudent.findFirst({ where: { studentId: u.id }, select: { teacher: { select: { id: true, name: true } } } })
    const teacher = link?.teacher ?? null
    if (u.viaLink) {
      const booking = await prisma.adventLesson.findFirst({ where: { studentUserId: u.id, studentEmail: { not: null } }, orderBy: { startsAt: 'desc' }, select: { studentEmail: true } })
      const email = realEmail(u.inviteEmail) || realEmail(booking?.studentEmail)
      if (!email) continue
      // Someone already has this email (their own account): not ours to take.
      if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) { console.warn('[welcome] email already in use, no invitation'); continue }
      // An invitation already on its way (sent by hand): nothing more.
      if (await prisma.invite.findFirst({ where: { userId: u.id, acceptedAt: null, expiresAt: { gt: new Date() } }, select: { id: true } })) continue
      const inviter = teacher?.id ?? (await prisma.user.findFirst({ where: { schoolId: u.schoolId, role: 'OWNER' }, select: { id: true } }))?.id
      if (!inviter) continue
      await prisma.invite.deleteMany({ where: { email, acceptedAt: null } })
      const invite = await prisma.invite.create({
        data: {
          token: crypto.randomBytes(24).toString('base64url'),
          name: u.name.length >= 2 ? u.name : `${u.name} (ученик)`,
          email,
          role: 'STUDENT',
          expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000),
          schoolId: u.schoolId,
          invitedById: inviter,
          userId: u.id
        }
      })
      const result = await sendTrialWelcomeEmail({ to: email, name: u.name, teacherName: teacher?.name, inviteLink: `${APP_URL()}/join/${invite.token}`, appUrl: APP_URL(), support: supportContact() })
      // Not sent (no mail service): the invitation waits in People with its link.
      if (result.sent) await prisma.user.update({ where: { id: u.id }, data: { welcomedAt: new Date(), inviteEmail: email } })
      else console.warn('[welcome] invitation not mailed:', result.reason)
    } else {
      const email = realEmail(u.email)
      if (!email) continue
      const result = await sendTrialWelcomeEmail({ to: email, name: u.name, teacherName: teacher?.name, inviteLink: null, appUrl: APP_URL(), support: supportContact() })
      if (result.sent) await prisma.user.update({ where: { id: u.id }, data: { welcomedAt: new Date() } })
      else console.warn('[welcome] not mailed:', result.reason)
    }
  }
}

export function startWelcomeJobs() {
  const run = () => welcomeSweep().catch((error) => console.error('[welcome]', error.message))
  setTimeout(run, 2 * 60 * 1000)
  setInterval(run, 60 * 1000)
}
