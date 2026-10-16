import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db.js'
import { requireAuth, requireRole, isAdmin } from '../auth.js'
import { studentScope, isSiteStudent } from '../partnerScope.js'
import { sendPaymentReportedEmail } from '../mailer.js'
import { offerLinks, stripeKey } from '../settings.js'
import { OFFER_PLANS, discountActive } from '../offer.js'
import { guardedFetch } from '../resilience.js'
import { creditOfferPurchase } from '../purchases.js'

export const billingRouter = Router()

billingRouter.use(requireAuth)

// Only https links are accepted: a javascript: or data: URL here would be shown
// to every student of the school and could run in their browser.
const httpsUrl = z
  .string()
  .url()
  .refine((value) => value.startsWith('https://'), { message: 'Link must start with https://' })

// Payment is per lesson: a price, and a package of paid lessons that every
// call with the student uses up. Nothing is tied to the calendar.
const billingSchema = z.object({
  priceAmount: z.number().int().min(0).max(100_000_000).nullable(),
  priceCurrency: z.enum(['RUB', 'USD', 'EUR']),
  paymentLink: httpsUrl.nullable(),
  lessonsPaid: z.number().int().min(0).max(500).nullable(),
  // The package the student is asked to pay for next (lessons).
  packageSize: z.number().int().min(1).max(500).nullable(),
  // Count lessons from now on (a new package), instead of continuing the old count.
  resetCounter: z.boolean(),
  // Lessons held in this package, as the owner corrects it by hand.
  held: z.number().int().min(0).max(1000),
  // The day the package counts from (a lesson given on credit before the
  // payment belongs to the new package: pick that lesson's day).
  packageStartedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  payToTrialCard: z.boolean().nullable(),
  // An extra card's id, or null for the main/after-trial choice above.
  payCardId: z.string().max(40).nullable(),
  // What came in with a new package (cents, in priceCurrency), for the
  // payment history; left out = lessons × price.
  paidAmount: z.number().int().min(0).max(100_000_000).nullable(),
  paidNote: z.string().max(300)
})

const detailsSchema = z.object({
  paymentDetails: z.string().max(2000).nullable(),
  trialPaymentDetails: z.string().max(1000).nullable().optional(),
  extraPaymentCards: z.string().max(4000).nullable().optional()
})

const STUDENT_SELECT = {
  id: true, name: true, email: true,
  priceAmount: true, priceCurrency: true, paymentLink: true,
  lessonsPaid: true, packageStartedAt: true, heldAdjust: true, paymentReportedAt: true, payToTrialCard: true, payCardId: true, packageSize: true
}

export const countedCalls = (student) => prisma.session.count({
  where: {
    classroom: { studentId: student.id },
    counted: true,
    ...(student.packageStartedAt ? { startedAt: { gte: student.packageStartedAt } } : {})
  }
})

// Lessons held since the package started, across every classroom of the
// student (a call that reaches the student counts, wherever it was started).
async function withPackage(student) {
  // The rouble card this student sees: set by hand (owner only), else Maxim's
  // card for a student who came from his site's landing, else Galina's
  // (Galina, 2026-10-16).
  const hadTrial = student.payToTrialCard == null ? await isSiteStudent(student.id) : null
  student = { ...student, paysTrialCard: student.payToTrialCard ?? hadTrial, paysTrialCardAuto: student.payToTrialCard == null }
  const held = await countedCalls(student) + (student.heldAdjust ?? 0)
  const { packageStartedAt, heldAdjust, ...rest } = student
  return {
    ...rest,
    package: {
      lessonsPaid: student.lessonsPaid,
      held,
      remaining: student.lessonsPaid == null ? null : student.lessonsPaid - held,
      startedAt: packageStartedAt
    }
  }
}

// A teacher deals with their own students; the owner with everyone; the
// partner with the students who came from his site (partnerScope.js).
async function reachableStudent(user, id) {
  return prisma.user.findFirst({
    where: {
      id,
      schoolId: user.schoolId,
      role: 'STUDENT',
      ...(isAdmin(user) ? {} : { studentLinks: { some: { teacherId: user.id } } }),
      AND: [await studentScope(user)]
    },
    select: STUDENT_SELECT
  })
}

// The Bank of Russia's official EUR rate for today, so a rouble price can
// be paid in euros at the day's rate. Official XML first, a JSON mirror as
// fallback; cached for an hour.
let rateCache = { at: 0, value: null }
export async function eurRate() {
  if (Date.now() - rateCache.at < 60 * 60 * 1000 && rateCache.value) return rateCache.value
  const parse = async () => {
    try {
      const res = await fetch('https://www.cbr.ru/scripts/XML_daily.asp', { signal: AbortSignal.timeout(6000) })
      const buf = Buffer.from(await res.arrayBuffer())
      const xml = new TextDecoder('windows-1251').decode(buf)
      const date = xml.match(/ValCurs Date="([^"]+)"/)?.[1]
      const m = xml.match(/<CharCode>EUR<\/CharCode>.*?<Value>([\d,]+)<\/Value>/s)
      if (m) return { rate: Number(m[1].replace(',', '.')), date, source: 'cbr.ru' }
    } catch { /* try the mirror */ }
    const res = await fetch('https://www.cbr-xml-daily.ru/daily_json.js', { signal: AbortSignal.timeout(6000) })
    const data = await res.json()
    return { rate: data.Valute.EUR.Value, date: data.Date.slice(0, 10), source: 'cbr-xml-daily.ru' }
  }
  const value = await parse()
  rateCache = { at: Date.now(), value }
  return value
}

// --- Stripe Checkout with the exact amount -------------------------------------
// The plan's rouble price (discounted while the trial window is open) is
// converted to euros at today's Bank of Russia rate and a Checkout Session
// is created for that amount, so the student never types a sum.
const stripeCall = async (path, params) => {
  const key = stripeKey()
  if (!key) throw new Error('Stripe is not configured')
  const response = await guardedFetch('stripe', `https://api.stripe.com/v1${path}`, {
    method: params ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${key}`, ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    body: params ? new URLSearchParams(params).toString() : undefined
  }, { timeoutMs: 15000 })
  const data = await response.json()
  if (!response.ok) throw new Error(data?.error?.message ?? `Stripe returned ${response.status}`)
  return data
}

// Has this trial student paid already (through Stripe, or lessons set by
// hand)? Then the offer is a renewal: "Продлить пакет", full price.
async function paidBefore(userId) {
  if (await prisma.offerPurchase.findFirst({ where: { userId }, select: { id: true } })) return true
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { lessonsPaid: true } })
  return u?.lessonsPaid > 0
}

billingRouter.post('/checkout', async (req, res) => {
  if (req.user.role !== 'STUDENT') return res.status(403).json({ error: 'Students only' })
  if (!stripeKey()) return res.status(503).json({ error: 'Online payment is not set up yet — use the link and enter the amount' })
  const plan = OFFER_PLANS.find((p) => p.id === req.body?.plan)
  if (!plan) return res.status(400).json({ error: 'Unknown plan' })
  const trial = await prisma.trialReport.findFirst({ where: { studentId: req.user.id, publishedAt: { not: null } }, orderBy: { publishedAt: 'desc' } })
  if (!trial) return res.status(403).json({ error: 'The offer is for students after a trial lesson' })
  const student = await prisma.user.findUnique({ where: { id: req.user.id }, select: { email: true, name: true } })
  // The first purchase within three days of the report gets the discount; a
  // renewal is at the full price.
  const purchased = await paidBefore(req.user.id)
  const rub = !purchased && discountActive(trial.publishedAt) ? plan.discounted : plan.price
  let rate
  try { rate = await eurRate() } catch { return res.status(502).json({ error: 'The exchange rate is unavailable right now, try again in a minute' }) }
  const cents = Math.ceil((rub / rate.rate) * 100)
  const origin = process.env.CLIENT_ORIGIN ?? `${req.protocol}://${req.get('host')}`
  try {
    const session = await stripeCall('/checkout/sessions', {
      mode: 'payment',
      'line_items[0][price_data][currency]': 'eur',
      'line_items[0][price_data][unit_amount]': String(cents),
      'line_items[0][price_data][product_data][name]': `Advent Academy — тариф «${plan.name}»`,
      'line_items[0][price_data][product_data][description]': `${rub.toLocaleString('ru-RU')} ₽ по курсу ЦБ РФ ${rate.rate} ₽/€ на ${rate.date}`,
      'line_items[0][quantity]': '1',
      // A trial-link account has no real email: Stripe asks for one itself.
      ...(/\.invalid$/i.test(student.email ?? '') ? {} : { customer_email: student.email }),
      client_reference_id: req.user.id,
      'metadata[studentId]': req.user.id,
      'metadata[plan]': plan.id,
      'metadata[rub]': String(rub),
      success_url: `${origin}/billing?paid=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/billing?paid=0`
    })
    res.json({ url: session.url, amount: cents / 100, currency: 'EUR', rub, rate })
  } catch (error) {
    res.status(502).json({ error: `Stripe: ${error.message}` })
  }
})

// Back from Stripe: confirm the session was paid, and note it for the teacher.
billingRouter.get('/checkout/verify', async (req, res) => {
  const id = typeof req.query.session_id === 'string' ? req.query.session_id : ''
  if (!id || !stripeKey()) return res.status(400).json({ error: 'No session' })
  try {
    const session = await stripeCall(`/checkout/sessions/${encodeURIComponent(id)}`)
    if (session.client_reference_id !== req.user.id) return res.status(404).json({ error: 'Not your payment' })
    const paid = session.payment_status === 'paid'
    // Credited here or by the webhook, whichever comes first (once).
    const credit = paid ? await creditOfferPurchase(session) : null
    res.json({ paid, credited: Boolean(credit), amount: session.amount_total / 100, currency: session.currency })
  } catch (error) {
    res.status(502).json({ error: `Stripe: ${error.message}` })
  }
})

billingRouter.get('/rates', async (req, res) => {
  try {
    res.json({ eur: await eurRate() })
  } catch (error) {
    res.status(502).json({ error: 'The exchange rate is unavailable right now' })
  }
})

// After a trial lesson the rouble card (and its holder) come from the trial
// details; everything else — the euro link, the note — stays the school's.
// The card a student pays to: an extra card set for them by hand, else the
// after-trial card (set by hand, or automatically after a trial), else the
// school's main card.
function studentDetails(school, user, hadTrial) {
  const extra = extraCards(school.extraPaymentCards).find((c) => c.id === user.payCardId)
  if (extra) return withTrialCard(school.paymentDetails, JSON.stringify(extra))
  return (user.payToTrialCard ?? hadTrial) ? withTrialCard(school.paymentDetails, school.trialPaymentDetails) : school.paymentDetails
}

// The card a student pays to, as staff call it: "Dmitry card · 8702".
const MAIN_CARD_NAME = 'Galina card'
const TRIAL_CARD_NAME = 'Maxim card'
async function cardLabel(studentId) {
  const user = await prisma.user.findUnique({ where: { id: studentId }, select: { payToTrialCard: true, payCardId: true, school: { select: { paymentDetails: true, trialPaymentDetails: true, extraPaymentCards: true } } } })
  if (!user) return null
  const { school } = user
  const parse = (raw) => { try { return JSON.parse(raw ?? 'null') ?? {} } catch { return {} } }
  const tail = (card) => (card ? ` · ${String(card).replace(/\D/g, '').slice(-4)}` : '')
  const extra = extraCards(school.extraPaymentCards).find((c) => c.id === user.payCardId)
  if (extra) return `${extra.name || 'Card'}${tail(extra.card)}`
  const hadTrial = user.payToTrialCard ?? await isSiteStudent(studentId)
  const trial = parse(school.trialPaymentDetails)
  if (hadTrial && trial.card) return `${trial.cardName || TRIAL_CARD_NAME}${tail(trial.card)}`
  const main = parse(school.paymentDetails)
  return `${main.cardName || MAIN_CARD_NAME}${tail(main.card)}`
}

const extraCards = (raw) => {
  try { const list = JSON.parse(raw ?? '[]'); return Array.isArray(list) ? list.filter((c) => c?.id && c?.card) : [] } catch { return [] }
}

function withTrialCard(main, trial) {
  let t = null
  try { t = trial ? JSON.parse(trial) : null } catch { t = null }
  if (!t?.card) return main
  let m = {}
  try { m = main ? JSON.parse(main) : {} } catch { m = { note: main } }
  return JSON.stringify({ ...m, card: t.card, cardNote: t.cardNote ?? '', cardName: t.cardName ?? '' })
}

// What the signed-in student needs in order to pay. A student who came
// through a trial lesson (a published report) also gets the offer: the
// plans with the discount deadline and the payment links from Settings.
billingRouter.get('/me', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { ...STUDENT_SELECT, school: { select: { paymentDetails: true, trialPaymentDetails: true, extraPaymentCards: true, name: true } } }
  })
  if (!user) return res.status(401).json({ error: 'Not authenticated' })

  const { school, ...student } = user
  const view = await withPackage(student)
  const trial = await prisma.trialReport.findFirst({ where: { studentId: user.id, publishedAt: { not: null } }, orderBy: { publishedAt: 'desc' }, select: { id: true, publishedAt: true, generated: true } })
  res.json({
    billing: {
      priceAmount: view.priceAmount,
      priceCurrency: view.priceCurrency,
      paymentLink: view.paymentLink,
      packageSize: view.packageSize,
      package: view.package,
      paymentReportedAt: view.paymentReportedAt,
      paymentDetails: studentDetails(school, user, view.paysTrialCard),
      schoolName: school.name,
      trial: trial ? { reportId: trial.id, publishedAt: trial.publishedAt, level: trial.generated?.level ?? null, links: offerLinks(), purchased: await paidBefore(user.id) } : null
    }
  })
})

// "I have paid": remembered on the student and mailed to their teachers,
// who confirm by setting the package. Once per hour, so a double click
// does not send two letters.
billingRouter.post('/me/paid', async (req, res) => {
  if (req.user.role !== 'STUDENT') return res.status(403).json({ error: 'Students only' })
  // How many lessons they paid for (the form asks), plus an optional note.
  const lessons = Number.isInteger(req.body?.lessons) && req.body.lessons > 0 && req.body.lessons <= 500 ? req.body.lessons : null
  const extra = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 300) : ''
  const note = [lessons ? `Оплачено уроков: ${lessons}` : '', extra].filter(Boolean).join(' · ')
  const student = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { id: true, name: true, viaLink: true, paymentReportedAt: true, studentLinks: { select: { teacher: { select: { email: true } } } } }
  })
  // A trial-link student leaves their own email: once the payment is in, the
  // platform invites them there (afterPayment.js).
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  if (student.viaLink && email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Проверьте почту' })
    await prisma.user.update({ where: { id: student.id }, data: { inviteEmail: email } })
  }
  if (student.paymentReportedAt && Date.now() - student.paymentReportedAt.getTime() < 60 * 60 * 1000) {
    return res.json({ reportedAt: student.paymentReportedAt, mailed: false })
  }
  const updated = await prisma.user.update({ where: { id: student.id }, data: { paymentReportedAt: new Date() }, select: { paymentReportedAt: true } })
  await prisma.paymentRecord.create({ data: { studentId: student.id, kind: 'reported', lessons, note: extra || null, card: await cardLabel(student.id) } })
  const teachers = [...new Set(student.studentLinks.map((l) => l.teacher.email))]
  let mailed = false
  if (teachers.length) {
    const result = await sendPaymentReportedEmail({ to: teachers, studentName: student.name, note })
    mailed = result.sent
  }
  res.json({ reportedAt: updated.paymentReportedAt, mailed })
})

// Seen it: clear the "reports a payment" mark after setting the package.
billingRouter.post('/students/:id/seen', requireRole('OWNER', 'PARTNER', 'TEACHER'), async (req, res) => {
  const student = await reachableStudent(req.user, req.params.id)
  if (!student) return res.status(404).json({ error: 'Student not found' })
  await prisma.user.update({ where: { id: student.id }, data: { paymentReportedAt: null } })
  res.json({ ok: true })
})

// One student's money and teachers, for the settings block shown in their
// cabinet and on their person page.
billingRouter.get('/students/:id', requireRole('OWNER', 'PARTNER', 'TEACHER'), async (req, res) => {
  const student = await reachableStudent(req.user, req.params.id)
  if (!student) return res.status(404).json({ error: 'Student not found' })
  const links = await prisma.teacherStudent.findMany({ where: { studentId: student.id }, select: { teacher: { select: { id: true, name: true } } } })
  res.json({ student: { ...(await withPackage(student)), teachers: links.map((l) => l.teacher) } })
})

billingRouter.get('/students', requireRole('OWNER', 'PARTNER', 'TEACHER'), async (req, res) => {
  const students = await prisma.user.findMany({
    where: {
      schoolId: req.user.schoolId,
      role: 'STUDENT',
      ...(isAdmin(req.user) ? {} : { studentLinks: { some: { teacherId: req.user.id } } }),
      ...(await studentScope(req.user))
    },
    select: STUDENT_SELECT,
    orderBy: { name: 'asc' }
  })
  res.json({ students: await Promise.all(students.map(withPackage)) })
})

billingRouter.patch('/students/:id', requireRole('OWNER', 'PARTNER', 'TEACHER'), async (req, res) => {
  const parsed = billingSchema.partial().safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid data', details: parsed.error.flatten().fieldErrors })
  }

  const student = await reachableStudent(req.user, req.params.id)
  if (!student) return res.status(404).json({ error: 'Student not found' })

  const { resetCounter, held, packageStartedAt, paidAmount, paidNote, ...data } = parsed.data
  // Which card a student pays to is the owner's call alone.
  if (req.user.role !== 'OWNER') { delete data.payToTrialCard; delete data.payCardId }
  // A date is the start of that day in Moscow time, where the school counts.
  if (packageStartedAt !== undefined) data.packageStartedAt = packageStartedAt ? new Date(`${packageStartedAt}T00:00:00+03:00`) : null
  if (resetCounter) { data.packageStartedAt = new Date(); data.heldAdjust = 0 }
  // A new start date with no held number: count the calls from that day as they are.
  if (packageStartedAt !== undefined && held === undefined) data.heldAdjust = 0
  if (held !== undefined) {
    const calls = resetCounter ? 0 : await countedCalls({ ...student, packageStartedAt: data.packageStartedAt !== undefined ? data.packageStartedAt : student.packageStartedAt })
    data.heldAdjust = held - calls
  }
  // A new package answers the student's "I have paid".
  if (resetCounter || data.lessonsPaid !== undefined) data.paymentReportedAt = null
  // Paid lessons lift a trial student's three-day limit.
  if (data.lessonsPaid > 0) { data.free = false; data.trialAccessUntil = null }

  const updated = await prisma.user.update({ where: { id: student.id }, data, select: STUDENT_SELECT })
  // A payment for the history: a new package (another start day) with
  // lessons in it, or more lessons in the current one.
  const before = student.lessonsPaid ?? 0
  const after = updated.lessonsPaid ?? 0
  const newPackage = (resetCounter || packageStartedAt !== undefined) && String(updated.packageStartedAt) !== String(student.packageStartedAt)
  const lessons = newPackage ? after : after - before
  if (lessons > 0) {
    const auto = updated.priceAmount != null ? updated.priceAmount * lessons : null
    await prisma.paymentRecord.create({
      data: {
        studentId: student.id, kind: 'package', lessons,
        amountCents: paidAmount ?? auto, currency: updated.priceCurrency,
        card: await cardLabel(student.id), note: paidNote?.trim() || null, byUserId: req.user.id
      }
    })
  }
  res.json({ student: await withPackage(updated) })
})

// The student's payments, newest first: packages set by staff, Stripe
// purchases, the student's own «I have paid». A student with a package
// from before the history existed shows that package as one line.
billingRouter.get('/students/:id/payments', requireRole('OWNER', 'PARTNER', 'TEACHER'), async (req, res) => {
  const student = await reachableStudent(req.user, req.params.id)
  if (!student) return res.status(404).json({ error: 'Student not found' })
  const [records, stripe] = await Promise.all([
    prisma.paymentRecord.findMany({ where: { studentId: student.id }, orderBy: { createdAt: 'desc' }, take: 200 }),
    prisma.offerPurchase.findMany({ where: { userId: student.id }, orderBy: { createdAt: 'desc' } })
  ])
  const byIds = [...new Set(records.map((r) => r.byUserId).filter(Boolean))]
  const names = Object.fromEntries((await prisma.user.findMany({ where: { id: { in: byIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]))
  const plans = Object.fromEntries(OFFER_PLANS.map((p) => [p.id, p.name]))
  const payments = [
    ...records.map((r) => ({ id: r.id, kind: r.kind, at: r.createdAt, lessons: r.lessons, amountCents: r.amountCents, currency: r.currency, card: r.card, note: r.note, by: names[r.byUserId] ?? null })),
    ...stripe.map((p) => ({ id: p.id, kind: 'stripe', at: p.createdAt, lessons: p.lessons || null, amountCents: p.amountCents, currency: p.currency, card: 'Stripe (online)', note: `${plans[p.plan] ?? p.plan}${p.rub ? ` · ${p.rub.toLocaleString('ru-RU')} ₽` : ''}`, by: null }))
  ].sort((a, b) => new Date(b.at) - new Date(a.at))
  if (!payments.some((p) => p.kind !== 'reported') && student.lessonsPaid > 0) {
    payments.push({ id: 'current', kind: 'current', at: student.packageStartedAt, lessons: student.lessonsPaid, amountCents: student.priceAmount != null ? student.priceAmount * student.lessonsPaid : null, currency: student.priceCurrency, card: await cardLabel(student.id), note: null, by: null })
  }
  res.json({ payments })
})

// A line entered by mistake.
billingRouter.delete('/students/:id/payments/:recordId', requireRole('OWNER'), async (req, res) => {
  const student = await reachableStudent(req.user, req.params.id)
  if (!student) return res.status(404).json({ error: 'Student not found' })
  await prisma.paymentRecord.deleteMany({ where: { id: req.params.recordId, studentId: student.id } })
  res.json({ ok: true })
})

billingRouter.patch('/school', requireRole('OWNER'), async (req, res) => {
  const parsed = detailsSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid data' })

  await prisma.school.update({
    where: { id: req.user.schoolId },
    data: {
      paymentDetails: parsed.data.paymentDetails,
      ...(parsed.data.trialPaymentDetails !== undefined ? { trialPaymentDetails: parsed.data.trialPaymentDetails } : {}),
      ...(parsed.data.extraPaymentCards !== undefined ? { extraPaymentCards: parsed.data.extraPaymentCards } : {})
    }
  })

  res.json({ ok: true })
})

billingRouter.get('/school', requireRole('OWNER', 'PARTNER', 'TEACHER'), async (req, res) => {
  const school = await prisma.school.findUnique({
    where: { id: req.user.schoolId },
    select: { paymentDetails: true, trialPaymentDetails: true, extraPaymentCards: true }
  })
  res.json({ paymentDetails: school?.paymentDetails ?? null, trialPaymentDetails: school?.trialPaymentDetails ?? null, extraPaymentCards: school?.extraPaymentCards ?? null })
})
