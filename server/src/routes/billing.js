import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db.js'
import { requireAuth, requireRole, isAdmin } from '../auth.js'
import { sendPaymentReportedEmail } from '../mailer.js'
import { offerLinks, stripeKey } from '../settings.js'
import { OFFER_PLANS, discountActive } from '../offer.js'
import { guardedFetch } from '../resilience.js'

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
  // Count lessons from now on (a new package), instead of continuing the old count.
  resetCounter: z.boolean(),
  payToTrialCard: z.boolean().nullable()
})

const detailsSchema = z.object({
  paymentDetails: z.string().max(2000).nullable(),
  trialPaymentDetails: z.string().max(1000).nullable().optional()
})

const STUDENT_SELECT = {
  id: true, name: true, email: true,
  priceAmount: true, priceCurrency: true, paymentLink: true,
  lessonsPaid: true, packageStartedAt: true, paymentReportedAt: true, payToTrialCard: true
}

// Lessons held since the package started, across every classroom of the
// student (a call that reaches the student counts, wherever it was started).
async function withPackage(student) {
  // The rouble card this student sees: set by hand, else after-trial once
  // a trial report has been published for them.
  const hadTrial = student.payToTrialCard == null
    ? Boolean(await prisma.trialReport.findFirst({ where: { studentId: student.id, publishedAt: { not: null } }, select: { id: true } }))
    : null
  student = { ...student, paysTrialCard: student.payToTrialCard ?? hadTrial, paysTrialCardAuto: student.payToTrialCard == null }
  const held = await prisma.session.count({
    where: {
      classroom: { studentId: student.id },
      counted: true,
      ...(student.packageStartedAt ? { startedAt: { gte: student.packageStartedAt } } : {})
    }
  })
  const { packageStartedAt, ...rest } = student
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

// A teacher deals with their own students; the owner and partner with everyone.
async function reachableStudent(user, id) {
  return prisma.user.findFirst({
    where: {
      id,
      schoolId: user.schoolId,
      role: 'STUDENT',
      ...(isAdmin(user) ? {} : { studentLinks: { some: { teacherId: user.id } } })
    },
    select: STUDENT_SELECT
  })
}

// The Bank of Russia's official EUR rate for today, so a rouble price can
// be paid in euros at the day's rate. Official XML first, a JSON mirror as
// fallback; cached for an hour.
let rateCache = { at: 0, value: null }
async function eurRate() {
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

billingRouter.post('/checkout', async (req, res) => {
  if (req.user.role !== 'STUDENT') return res.status(403).json({ error: 'Students only' })
  if (!stripeKey()) return res.status(503).json({ error: 'Online payment is not set up yet — use the link and enter the amount' })
  const plan = OFFER_PLANS.find((p) => p.id === req.body?.plan)
  if (!plan) return res.status(400).json({ error: 'Unknown plan' })
  const trial = await prisma.trialReport.findFirst({ where: { studentId: req.user.id, publishedAt: { not: null } }, orderBy: { publishedAt: 'desc' } })
  if (!trial) return res.status(403).json({ error: 'The offer is for students after a trial lesson' })
  const student = await prisma.user.findUnique({ where: { id: req.user.id }, select: { email: true, name: true } })
  const rub = discountActive(trial.publishedAt) ? plan.discounted : plan.price
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
      customer_email: student.email,
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
    if (paid) {
      const student = await prisma.user.findUnique({ where: { id: req.user.id }, select: { id: true, name: true, paymentReportedAt: true, studentLinks: { select: { teacher: { select: { email: true } } } } } })
      const note = `Оплачено через Stripe: тариф ${session.metadata?.plan ?? ''}, ${(session.amount_total / 100).toFixed(2)} ${String(session.currency).toUpperCase()} (${session.metadata?.rub ?? ''} ₽)`
      await prisma.user.update({ where: { id: req.user.id }, data: { paymentReportedAt: new Date() } })
      const teachers = [...new Set(student.studentLinks.map((l) => l.teacher.email))]
      if (teachers.length) sendPaymentReportedEmail({ to: teachers, studentName: student.name, note }).catch(() => {})
    }
    res.json({ paid, amount: session.amount_total / 100, currency: session.currency })
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
function withTrialCard(main, trial) {
  let t = null
  try { t = trial ? JSON.parse(trial) : null } catch { t = null }
  if (!t?.card) return main
  let m = {}
  try { m = main ? JSON.parse(main) : {} } catch { m = { note: main } }
  return JSON.stringify({ ...m, card: t.card, cardNote: t.cardNote ?? '' })
}

// What the signed-in student needs in order to pay. A student who came
// through a trial lesson (a published report) also gets the offer: the
// plans with the discount deadline and the payment links from Settings.
billingRouter.get('/me', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { ...STUDENT_SELECT, school: { select: { paymentDetails: true, trialPaymentDetails: true, name: true } } }
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
      package: view.package,
      paymentReportedAt: view.paymentReportedAt,
      paymentDetails: (user.payToTrialCard ?? Boolean(trial)) ? withTrialCard(school.paymentDetails, school.trialPaymentDetails) : school.paymentDetails,
      schoolName: school.name,
      trial: trial ? { reportId: trial.id, publishedAt: trial.publishedAt, level: trial.generated?.level ?? null, links: offerLinks() } : null
    }
  })
})

// "I have paid": remembered on the student and mailed to their teachers,
// who confirm by setting the package. Once per hour, so a double click
// does not send two letters.
billingRouter.post('/me/paid', async (req, res) => {
  if (req.user.role !== 'STUDENT') return res.status(403).json({ error: 'Students only' })
  const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 300) : ''
  const student = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { id: true, name: true, paymentReportedAt: true, studentLinks: { select: { teacher: { select: { email: true } } } } }
  })
  if (student.paymentReportedAt && Date.now() - student.paymentReportedAt.getTime() < 60 * 60 * 1000) {
    return res.json({ reportedAt: student.paymentReportedAt, mailed: false })
  }
  const updated = await prisma.user.update({ where: { id: student.id }, data: { paymentReportedAt: new Date() }, select: { paymentReportedAt: true } })
  const teachers = [...new Set(student.studentLinks.map((l) => l.teacher.email))]
  let mailed = false
  if (teachers.length) {
    const result = await sendPaymentReportedEmail({ to: teachers, studentName: student.name, note })
    mailed = result.sent
  }
  res.json({ reportedAt: updated.paymentReportedAt, mailed })
})

// Seen it: clear the "reports a payment" mark after setting the package.
billingRouter.post('/students/:id/seen', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const student = await reachableStudent(req.user, req.params.id)
  if (!student) return res.status(404).json({ error: 'Student not found' })
  await prisma.user.update({ where: { id: student.id }, data: { paymentReportedAt: null } })
  res.json({ ok: true })
})

billingRouter.get('/students', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const students = await prisma.user.findMany({
    where: {
      schoolId: req.user.schoolId,
      role: 'STUDENT',
      ...(isAdmin(req.user) ? {} : { studentLinks: { some: { teacherId: req.user.id } } })
    },
    select: STUDENT_SELECT,
    orderBy: { name: 'asc' }
  })
  res.json({ students: await Promise.all(students.map(withPackage)) })
})

billingRouter.patch('/students/:id', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const parsed = billingSchema.partial().safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid data', details: parsed.error.flatten().fieldErrors })
  }

  const student = await reachableStudent(req.user, req.params.id)
  if (!student) return res.status(404).json({ error: 'Student not found' })

  const { resetCounter, ...data } = parsed.data
  if (resetCounter) data.packageStartedAt = new Date()
  // A new package answers the student's "I have paid".
  if (resetCounter || data.lessonsPaid !== undefined) data.paymentReportedAt = null

  const updated = await prisma.user.update({ where: { id: student.id }, data, select: STUDENT_SELECT })
  res.json({ student: await withPackage(updated) })
})

billingRouter.patch('/school', requireRole('OWNER'), async (req, res) => {
  const parsed = detailsSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid data' })

  await prisma.school.update({
    where: { id: req.user.schoolId },
    data: { paymentDetails: parsed.data.paymentDetails, ...(parsed.data.trialPaymentDetails !== undefined ? { trialPaymentDetails: parsed.data.trialPaymentDetails } : {}) }
  })

  res.json({ ok: true })
})

billingRouter.get('/school', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const school = await prisma.school.findUnique({
    where: { id: req.user.schoolId },
    select: { paymentDetails: true, trialPaymentDetails: true }
  })
  res.json({ paymentDetails: school?.paymentDetails ?? null, trialPaymentDetails: school?.trialPaymentDetails ?? null })
})
