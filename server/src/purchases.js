import { prisma } from './db.js'
import { OFFER_PLANS } from './offer.js'
import { setPlan } from './plans.js'
import { notify } from './push.js'
import { sendPaymentReportedEmail } from './mailer.js'
import { stripeKey } from './settings.js'

// Paid lessons added to a student's package: what was left in the current
// package is kept, the new package (left + paid) counts from now. The trial
// limits go. Used for Stripe purchases and payments reported by Advent.
export async function creditLessons(studentId, lessons, { pricePerLesson, currency } = {}) {
  const student = await prisma.user.findUnique({ where: { id: studentId } })
  if (!student) return null
  let left = 0
  if (student.lessonsPaid != null) {
    const held = await prisma.session.count({ where: { classroom: { studentId }, counted: true, ...(student.packageStartedAt ? { startedAt: { gte: student.packageStartedAt } } : {}) } }) + (student.heldAdjust ?? 0)
    left = Math.max(0, student.lessonsPaid - held)
  }
  await prisma.user.update({
    where: { id: studentId },
    data: {
      lessonsPaid: left + lessons,
      packageStartedAt: new Date(),
      heldAdjust: 0,
      paymentReportedAt: null,
      free: false,
      trialAccessUntil: null,
      ...(pricePerLesson && currency ? { priceAmount: pricePerLesson, priceCurrency: currency } : {})
    }
  })
  return { left, total: left + lessons, student }
}

// A trial-offer Checkout session that Stripe says is paid: credited once.
// Mentor adds its lessons; Solo opens the platform (practice) for a month.
export async function creditOfferPurchase(session) {
  if (!session || session.mode !== 'payment' || session.payment_status !== 'paid') return null
  const plan = OFFER_PLANS.find((p) => p.id === session.metadata?.plan)
  const userId = session.metadata?.studentId || session.client_reference_id
  if (!plan || !userId) return null
  try {
    await prisma.offerPurchase.create({ data: { id: session.id, userId, plan: plan.id, lessons: plan.lessons, amountCents: session.amount_total ?? 0, currency: String(session.currency ?? 'eur').toUpperCase(), rub: Number(session.metadata?.rub) || null } })
  } catch {
    return { already: true }
  }
  let note
  const student = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, schoolId: true, studentLinks: { select: { teacher: { select: { id: true, email: true } } } } } })
  if (!student) return null
  if (plan.lessons > 0) {
    const rub = Number(session.metadata?.rub) || plan.price
    const result = await creditLessons(userId, plan.lessons, { pricePerLesson: Math.round((rub * 100) / plan.lessons), currency: 'RUB' })
    note = `Оплачено через Stripe: «${plan.name}», ${plan.lessons} уроков${result?.left ? ` (+${result.left} оставалось)` : ''} — ${((session.amount_total ?? 0) / 100).toFixed(2)} ${String(session.currency).toUpperCase()}. Уроки начислены автоматически.`
  } else {
    const until = new Date(Date.now() + (plan.practiceDays ?? 31) * 86400000)
    await prisma.user.update({ where: { id: userId }, data: { free: true, trialAccessUntil: null } })
    await setPlan(userId, { plan: 'practice', planUntil: until, planSource: 'offer' })
    note = `Оплачено через Stripe: «${plan.name}» — ${((session.amount_total ?? 0) / 100).toFixed(2)} ${String(session.currency).toUpperCase()}. Платформа открыта до ${until.toLocaleDateString('ru-RU')}.`
  }
  const teachers = student.studentLinks.map((l) => l.teacher)
  const owners = await prisma.user.findMany({ where: { schoolId: student.schoolId, role: 'OWNER' }, select: { id: true, email: true } })
  const emails = [...new Set([...teachers, ...owners].map((u) => u.email))]
  if (emails.length) sendPaymentReportedEmail({ to: emails, studentName: student.name, note }).catch(() => {})
  notify([...teachers, ...owners].map((u) => u.id), { title: `Оплата: ${student.name}`, body: note, url: `/people/${student.id}/activity` }).catch(() => {})
  return { credited: true, plan: plan.id, lessons: plan.lessons }
}

// Safety net without a webhook: every 10 minutes the platform asks Stripe for
// the completed Checkout sessions of the last 3 days and credits any it has
// not seen (a student who closed the tab right after paying). Read-only.
async function sweepStripe() {
  const key = stripeKey()
  if (!key) return
  const since = Math.floor(Date.now() / 1000) - 3 * 86400
  const url = `https://api.stripe.com/v1/checkout/sessions?limit=100&status=complete&created[gte]=${since}`
  const response = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`Stripe ${response.status}`)
  const { data } = await response.json()
  for (const session of data ?? []) {
    if (!session.metadata?.plan) continue
    if (await prisma.offerPurchase.findUnique({ where: { id: session.id }, select: { id: true } })) continue
    await creditOfferPurchase(session).catch((error) => console.error('[stripe] credit', session.id, error.message))
  }
}

export function startPurchaseJobs() {
  const run = () => sweepStripe().catch((error) => console.error('[stripe] sweep', error.message))
  setTimeout(run, 90_000)
  setInterval(run, 10 * 60_000)
}
