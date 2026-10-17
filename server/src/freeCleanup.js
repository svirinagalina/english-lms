import { prisma } from './db.js'
import { unenrollStudent } from './advent.js'

// Free accounts are removed a month after their last access (Galina,
// 2026-10-17: «раз в день удалять бесплатных учеников без преподавателя
// через 30 дней после регистрации; у кого был тариф или курс — через 30 дней
// после его окончания. Только на сайте»). Last access = the latest of
// sign-up, the end of a plan and the end of a bought course. A student with
// a teacher is never free, and one with a teacher link is skipped anyway.
const DAY = 24 * 60 * 60 * 1000
export const FREE_KEEP_DAYS = 30
const realEmail = (email) => (email && !/\.invalid$/i.test(email) ? email : null)

export async function removeOldFreeUsers(now = new Date()) {
  const cutoff = new Date(now.getTime() - FREE_KEEP_DAYS * DAY)
  const candidates = await prisma.user.findMany({
    where: { role: 'STUDENT', free: true, createdAt: { lt: cutoff }, studentLinks: { none: {} } },
    select: { id: true, name: true, email: true, createdAt: true, planUntil: true }
  })
  const removed = []
  for (const user of candidates) {
    const course = await prisma.courseAccess.findFirst({ where: { userId: user.id }, orderBy: { until: 'desc' }, select: { until: true } })
    const last = Math.max(user.createdAt.getTime(), user.planUntil?.getTime() ?? 0, course?.until.getTime() ?? 0)
    if (last >= cutoff.getTime()) continue
    try {
      await prisma.user.delete({ where: { id: user.id } })
      if (realEmail(user.email)) unenrollStudent(user.email)
      removed.push(user.name)
    } catch (error) {
      console.error('[free-cleanup]', user.id, error.message)
    }
  }
  if (removed.length) console.log(`[free-cleanup] removed ${removed.length} free account(s): ${removed.join(', ')}`)
  return removed
}

// Only on the site (NODE_ENV=production), so a local dev server never wipes
// test accounts; FREE_CLEANUP=on runs it elsewhere for a test.
export function startFreeCleanup() {
  if (process.env.NODE_ENV !== 'production' && process.env.FREE_CLEANUP !== 'on') return
  const run = () => removeOldFreeUsers().catch((error) => console.error('[free-cleanup]', error.message))
  setTimeout(run, 5 * 60 * 1000)
  setInterval(run, DAY)
}
