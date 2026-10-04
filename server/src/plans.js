// Self-service plans for people who signed up by themselves (`User.free`).
// Staff and students with a teacher have everything; a free account gets
// what its active plan includes, on top of the free tier (freeTier.js).
//
//   practice — the whole grammar, every vocabulary set, unlimited AI checks,
//              the speaking trainer in full
//   calls    — hosting one's own video calls (guests join free)
//   all      — both
import { prisma } from './db.js'
import { advent, adventEnabled } from './advent.js'

export const PLANS = {
  practice: { name: 'Practice', features: ['practice'], eur: { month: 490, year: 3900 }, rub: { month: 390, year: 3290 } },
  calls: { name: 'Calls', features: ['calls'], eur: { month: 590, year: 4900 }, rub: { month: 490, year: 3990 } },
  all: { name: 'Everything', features: ['practice', 'calls'], eur: { month: 890, year: 6900 }, rub: { month: 690, year: 5490 } }
}
export const PLAN_IDS = Object.keys(PLANS)
export const PERIODS = ['month', 'year']

// Free tier limits.
export const FREE_AI_CHECKS_PER_DAY = 20

export const planActive = (user) => Boolean(user?.plan && PLANS[user.plan] && user.planUntil && new Date(user.planUntil) > new Date())

// What this person may use. `user` needs role, free, plan, planUntil.
export function entitlements(user) {
  if (!user) return { practice: false, calls: false }
  if (!user.free) return { practice: true, calls: true }
  const features = planActive(user) ? PLANS[user.plan].features : []
  return { practice: features.includes('practice'), calls: features.includes('calls') }
}

// The view of a plan sent to the browser.
export const planView = (user) => ({
  plan: planActive(user) ? user.plan : null,
  planUntil: planActive(user) ? user.planUntil : null,
  planSource: planActive(user) ? user.planSource ?? null : null,
  canManage: Boolean(user?.stripeSubscriptionId && planActive(user)),
  ...entitlements(user)
})

// AI checks a free person without Practice has used today (in memory: a
// restart forgives the day, which is fine for a courtesy limit).
const aiUse = new Map() // userId → { day, count }
const today = () => new Date().toISOString().slice(0, 10)
export function aiChecksLeft(user) {
  if (entitlements(user).practice) return Infinity
  const entry = aiUse.get(user.id)
  const used = entry?.day === today() ? entry.count : 0
  return Math.max(0, FREE_AI_CHECKS_PER_DAY - used)
}
export function useAiCheck(user) {
  if (entitlements(user).practice) return
  const entry = aiUse.get(user.id)
  aiUse.set(user.id, { day: today(), count: (entry?.day === today() ? entry.count : 0) + 1 })
}

// The speaking trainer (Maxim's) follows the plan: full access while
// Practice is paid, back to its own trial when it ends.
export async function syncTrainer(userId) {
  if (!adventEnabled()) return
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true, free: true, plan: true, planUntil: true } })
  if (!user?.free) return // students with a teacher are handled by enrollStudent
  try {
    if (entitlements(user).practice) {
      await advent('POST', '/session', { email: user.email, name: user.name })
      await advent('POST', '/access', { email: user.email, name: user.name, full: new Date(user.planUntil).toISOString().slice(0, 10), pro: null, order_id: 'platform-plan' })
    } else {
      await advent('POST', '/access', { email: user.email, full: null, pro: null })
    }
  } catch (error) {
    console.warn(`Trainer access sync failed: ${error.message}`)
  }
}

// Sets (or clears) a person's plan and keeps the trainer in step.
export async function setPlan(userId, { plan, planUntil, planSource, stripeCustomerId, stripeSubscriptionId }) {
  const data = { plan: plan ?? null, planUntil: planUntil ?? null, planSource: planSource ?? null }
  if (stripeCustomerId !== undefined) data.stripeCustomerId = stripeCustomerId
  if (stripeSubscriptionId !== undefined) data.stripeSubscriptionId = stripeSubscriptionId
  const user = await prisma.user.update({ where: { id: userId }, data })
  syncTrainer(userId)
  return user
}

// Once an hour: plans that ran out lose the trainer's full access.
export function startPlanSweep() {
  const sweep = async () => {
    const expired = await prisma.user.findMany({ where: { free: true, plan: { not: null }, planUntil: { lt: new Date() } }, select: { id: true } })
    for (const { id } of expired) {
      await prisma.user.update({ where: { id }, data: { plan: null, planSource: null } })
      await syncTrainer(id)
    }
  }
  setTimeout(() => sweep().catch(() => {}), 60 * 1000)
  setInterval(() => sweep().catch(() => {}), 60 * 60 * 1000)
}
