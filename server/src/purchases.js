import { prisma } from './db.js'
import { OFFER_PLANS } from './offer.js'
import { setPlan } from './plans.js'
import { notify } from './push.js'
import { sendPaymentReportedEmail } from './mailer.js'
import { stripeKey } from './settings.js'
import { creditCoursePurchase } from './coursePurchases.js'
import { sendTo, esc, appUrl } from './telegram.js'

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
  let note, teacherNote
  const student = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, schoolId: true, viaLink: true, inviteEmail: true, studentLinks: { select: { teacher: { select: { id: true, email: true } } } } } })
  if (!student) return null
  // The email they paid with: where the platform invites a trial-link student (afterPayment.js).
  const paidWith = String(session.customer_details?.email ?? '').trim().toLowerCase()
  if (student.viaLink && !student.inviteEmail && paidWith) await prisma.user.update({ where: { id: student.id }, data: { inviteEmail: paidWith } })
  if (plan.lessons > 0) {
    const rub = Number(session.metadata?.rub) || plan.price
    const result = await creditLessons(userId, plan.lessons, { pricePerLesson: Math.round((rub * 100) / plan.lessons), currency: 'RUB' })
    note = `Оплачено через Stripe: «${plan.name}», ${plan.lessons} уроков${result?.left ? ` (+${result.left} оставалось)` : ''} — ${((session.amount_total ?? 0) / 100).toFixed(2)} ${String(session.currency).toUpperCase()}. Уроки начислены автоматически.`
    teacherNote = `Оплачено онлайн: ${plan.lessons} уроков${result?.left ? ` (+${result.left} оставалось)` : ''}. Уроки начислены — можно заниматься.`
  } else {
    const until = new Date(Date.now() + (plan.practiceDays ?? 31) * 86400000)
    await prisma.user.update({ where: { id: userId }, data: { free: true, trialAccessUntil: null } })
    await setPlan(userId, { plan: 'practice', planUntil: until, planSource: 'offer' })
    note = `Оплачено через Stripe: «${plan.name}» — ${((session.amount_total ?? 0) / 100).toFixed(2)} ${String(session.currency).toUpperCase()}. Платформа открыта до ${until.toLocaleDateString('ru-RU')}.`
    teacherNote = `Оплачен доступ к платформе до ${until.toLocaleDateString('ru-RU')}.`
  }
  await tellStaff(student, note, { teacherNote })
  return { credited: true, plan: plan.id, lessons: plan.lessons }
}

// The school's owners hear of a payment by email and push, with the sum;
// `telegram` also sends it to their Telegram (the bot sees lessons being
// added by itself, bot.js → payments(), so a credited payment does not need
// it). The student's teachers get only `teacherNote` — lessons, never sums
// or cards — and nothing when it is null.
async function tellStaff(student, note, { intro = 'Оплата', telegram = false, teacherNote = null } = {}) {
  const owners = await prisma.user.findMany({ where: { schoolId: student.schoolId, role: 'OWNER' }, select: { id: true, email: true, telegramChatId: true } })
  const ownerIds = new Set(owners.map((o) => o.id))
  const teachers = teacherNote ? (student.studentLinks?.map((l) => l.teacher) ?? []).filter((t) => !ownerIds.has(t.id)) : []
  const url = student.id ? `/people/${student.id}/activity` : '/billing'
  if (owners.length) sendPaymentReportedEmail({ to: [...new Set(owners.map((u) => u.email))], studentName: student.name, note, intro }).catch(() => {})
  notify(owners.map((u) => u.id), { title: `${intro}: ${student.name}`, body: note, url }).catch(() => {})
  if (teachers.length) {
    sendPaymentReportedEmail({ to: [...new Set(teachers.map((u) => u.email))], studentName: student.name, note: teacherNote, intro }).catch(() => {})
    notify(teachers.map((u) => u.id), { title: `${intro}: ${student.name}`, body: teacherNote, url }).catch(() => {})
  }
  if (telegram) for (const owner of owners) await sendTo(owner, `💳 ${esc(intro)}: ${esc(student.name)}\n${esc(note)}`, [[{ text: 'Открыть оплаты', url: `${appUrl()}/billing` }]])
}

// A package of lessons paid online from the student's Payment page
// (POST /billing/me/package-checkout): credited once, at the price the
// teacher set, like the trial plans above.
export async function creditPackagePurchase(session) {
  if (!session || session.mode !== 'payment' || session.payment_status !== 'paid' || session.metadata?.kind !== 'package') return null
  const userId = session.metadata?.studentId || session.client_reference_id
  const lessons = Number(session.metadata?.lessons)
  if (!userId || !(Number.isInteger(lessons) && lessons > 0)) return null
  const student = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, schoolId: true, studentLinks: { select: { teacher: { select: { id: true, email: true } } } } } })
  if (!student) return null
  try {
    await prisma.offerPurchase.create({ data: { id: session.id, userId, plan: 'package', lessons, amountCents: session.amount_total ?? 0, currency: String(session.currency ?? 'eur').toUpperCase(), rub: Number(session.metadata?.rub) || null } })
  } catch {
    return { already: true }
  }
  const price = Number(session.metadata?.price)
  const currency = session.metadata?.currency
  const result = await creditLessons(userId, lessons, price > 0 && currency ? { pricePerLesson: price, currency } : {})
  const note = `Оплачено через Stripe: пакет ${lessons} уроков${result?.left ? ` (+${result.left} оставалось)` : ''} — ${((session.amount_total ?? 0) / 100).toFixed(2)} ${String(session.currency).toUpperCase()}. Уроки начислены автоматически.`
  await tellStaff(student, note, { teacherNote: `Оплачено онлайн: ${lessons} уроков${result?.left ? ` (+${result.left} оставалось)` : ''}. Уроки начислены — можно заниматься.` })
  return { credited: true, lessons }
}

// A payment through a plain Stripe link (the school's "Pay online" or a
// student's own link): Stripe knows only the amount and the payer's email.
// The platform cannot tell how many lessons it is for, so it credits
// nothing — it tells the owners, with the student found by that email, and
// notes it in the student's payment history. Once per payment.
export async function noticeLinkPayment(session) {
  if (!session?.payment_link || session.payment_status !== 'paid') return null
  try {
    await prisma.pushSent.create({ data: { key: `stripe-link:${session.id}` } })
  } catch {
    return { already: true }
  }
  const email = String(session.customer_details?.email ?? session.customer_email ?? '').trim()
  const name = session.customer_details?.name ?? ''
  const student = email
    ? await prisma.user.findFirst({
        where: { role: 'STUDENT', OR: [{ email: { equals: email, mode: 'insensitive' } }, { inviteEmail: { equals: email, mode: 'insensitive' } }] },
        select: { id: true, name: true, schoolId: true, studentLinks: { select: { teacher: { select: { id: true, email: true } } } } }
      })
    : null
  const sum = `${((session.amount_total ?? 0) / 100).toFixed(2)} ${String(session.currency ?? '').toUpperCase()}`
  const when = new Date((session.created ?? Date.now() / 1000) * 1000).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })
  if (student) {
    await prisma.paymentRecord.create({ data: { studentId: student.id, kind: 'stripe-link', amountCents: session.amount_total ?? null, currency: String(session.currency ?? '').toUpperCase() || null, card: 'Stripe (ссылка)', note: `${email} · уроки не начислены` } })
    await tellStaff(student, `Оплата по ссылке Stripe: ${sum}, ${when} МСК, почта ${email}. Сколько уроков — платформа не знает: проверьте и начислите уроки в кабинете ученика → Lessons and payment.`, { intro: 'Оплата по ссылке', telegram: true })
    return { student: student.id }
  }
  // Nobody with that email: the owners of the first school (the Stripe
  // account is the platform's, which is that school's) — never other schools.
  const school = await prisma.school.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } })
  if (school) await tellStaff({ id: null, name: name || email || 'неизвестный плательщик', schoolId: school.id }, `Оплата по ссылке Stripe: ${sum}, ${when} МСК, почта ${email || '—'}${name ? `, имя ${name}` : ''}. Ученика с такой почтой на платформе нет — найдите, кто это, и начислите уроки вручную.`, { intro: 'Оплата от неизвестного', telegram: true })
  return { student: null }
}

// Either kind of lesson purchase made through the platform's own Checkout.
export const creditStripeSession = (session) => (session?.metadata?.kind === 'package' ? creditPackagePurchase(session) : creditOfferPurchase(session))

// Safety net without a webhook: every 10 minutes the platform asks Stripe for
// the completed Checkout sessions of the last 3 days and credits any it has
// not seen (a student who closed the tab right after paying), and tells the
// owners of payments made through a plain Stripe link. Read-only on Stripe.
async function sweepStripe() {
  const key = stripeKey()
  if (!key) return
  const since = Math.floor(Date.now() / 1000) - 3 * 86400
  const url = `https://api.stripe.com/v1/checkout/sessions?limit=100&status=complete&created[gte]=${since}`
  const response = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`Stripe ${response.status}`)
  const { data } = await response.json()
  for (const session of data ?? []) {
    if (session.metadata?.courseId) {
      if (await prisma.courseOrder.findUnique({ where: { stripeSessionId: session.id }, select: { id: true } })) continue
      await creditCoursePurchase(session).catch((error) => console.error('[stripe] course credit', session.id, error.message))
      continue
    }
    if (session.payment_link && !session.metadata?.kind && !session.metadata?.plan) {
      await noticeLinkPayment(session).catch((error) => console.error('[stripe] link payment', session.id, error.message))
      continue
    }
    if (!session.metadata?.plan && session.metadata?.kind !== 'package') continue
    if (await prisma.offerPurchase.findUnique({ where: { id: session.id }, select: { id: true } })) continue
    await creditStripeSession(session).catch((error) => console.error('[stripe] credit', session.id, error.message))
  }
}

export function startPurchaseJobs() {
  const run = () => sweepStripe().catch((error) => console.error('[stripe] sweep', error.message))
  setTimeout(run, 90_000)
  setInterval(run, 10 * 60_000)
}
