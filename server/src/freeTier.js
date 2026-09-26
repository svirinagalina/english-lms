import { prisma } from './db.js'

// The free tier (a self-signed-up user with no teacher, `User.free`) opens
// about 30% of the school's content: the first grammar units in book order
// and the oldest shared vocabulary sets — at least one of each. The rest is
// listed but locked, with the offer of a trial lesson.
export const FREE_SHARE = 0.3
export const freeCount = (total) => Math.max(1, Math.round(total * FREE_SHARE))

export async function openUnitIds(schoolId) {
  const units = await prisma.unit.findMany({ where: { schoolId }, orderBy: { position: 'asc' }, select: { id: true } })
  return units.slice(0, freeCount(units.length)).map((u) => u.id)
}

export async function openSetIds(schoolId) {
  const sets = await prisma.vocabSet.findMany({ where: { schoolId, ownerId: null }, orderBy: { createdAt: 'asc' }, select: { id: true } })
  return sets.slice(0, freeCount(sets.length)).map((s) => s.id)
}
