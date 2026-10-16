import { prisma } from './db.js'

// Galina, 2026-10-14: the partner (Maxim) has nothing to do with her own
// students. He sees only the students who came from his site (a booking from
// it) — in People, Payments, Progress, the cabinets, activity, reports and the
// bot's payment messages. Staff, the content section and the rest of the
// partner's powers are unchanged; the owner still sees everyone.

export const limitedToSite = (user) => user?.role === 'PARTNER'

// Every student who has a booking from Maxim's site.
export async function siteStudentIds() {
  const rows = await prisma.adventLesson.findMany({
    where: { source: { not: 'platform' }, studentUserId: { not: null } },
    select: { studentUserId: true },
    distinct: ['studentUserId']
  })
  return rows.map((r) => r.studentUserId)
}

// One student: did they come from Maxim's site (the landing)?
export async function isSiteStudent(studentId) {
  if (!studentId) return false
  return Boolean(await prisma.adventLesson.findFirst({ where: { source: { not: 'platform' }, studentUserId: studentId }, select: { id: true } }))
}

// Does this student pay to Maxim's card (the after-trial card)? A card set by
// hand wins; otherwise students from his site's landing do (as withPackage
// in billing.js decides). An extra card (Dmitry…) is never Maxim's.
export async function paysMaximCard(studentId) {
  const u = await prisma.user.findUnique({ where: { id: studentId }, select: { payCardId: true, payToTrialCard: true } })
  if (!u || u.payCardId) return false
  return u.payToTrialCard ?? await isSiteStudent(studentId)
}

// A `where` piece for a query on students: nothing for the owner/teachers.
export async function studentScope(user) {
  if (!limitedToSite(user)) return {}
  return { id: { in: await siteStudentIds() } }
}

// For a query on people of every role: staff stay, students only the site's.
export async function peopleScope(user) {
  if (!limitedToSite(user)) return {}
  return { OR: [{ role: { not: 'STUDENT' } }, { id: { in: await siteStudentIds() } }] }
}

// For a query on classrooms (one per teacher–student pair).
export async function classroomScope(user) {
  if (!limitedToSite(user)) return {}
  return { studentId: { in: await siteStudentIds() } }
}

export async function maySeeStudent(user, studentId) {
  if (!limitedToSite(user) || !studentId) return true
  return Boolean(await prisma.adventLesson.findFirst({ where: { studentUserId: studentId, source: { not: 'platform' } }, select: { id: true } }))
}
