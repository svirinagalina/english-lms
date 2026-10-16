import { Router } from 'express'
import { createHash, randomBytes } from 'crypto'
import { z } from 'zod'
import { prisma } from './db.js'
import { hashPassword, isAdmin } from './auth.js'
import { stripeKey, supportContact } from './settings.js'
import { guardedFetch, rateLimit } from './resilience.js'
import { eurRate } from './routes/billing.js'
import { sendCourseOpenedEmail, sendCourseTransferEmail, sendPaymentReportedEmail } from './mailer.js'
import { notify } from './push.js'
import { sendTo, esc } from './telegram.js'

// Courses sold on their own (Galina, 2026-10-16: the IELTS page's "Купить"
// — Stripe or a rouble transfer, then access). A course with `priceRub` is
// for sale; a purchase opens it for `accessDays` to the buyer's email:
//  · Stripe: credited at once (return from Checkout, the webhook, or the
//    10-minute sweep in purchases.js — whichever comes first, once).
//  · Transfer: the buyer reports it, the owners get a note, an admin presses
//    "Открыть доступ" on the course page.
// No account yet → one is made (a free student, no teacher) and the letter
// carries a "choose a password" link; an existing account just gets access.

const APP_URL = () => (process.env.APP_URL ?? process.env.CLIENT_ORIGIN ?? 'https://lms.advent-academy.online').replace(/\/$/, '')
const PASSWORD_LINK_DAYS = 14
const DEFAULT_ACCESS_DAYS = 122 // four months
const hashToken = (token) => createHash('sha256').update(token).digest('hex')
const cleanEmail = (email) => String(email ?? '').trim().toLowerCase()
const validEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

// Open to this person? Staff and students with a teacher (`free` = false)
// have every course; a self-signed-up account needs a purchase.
export async function canOpenCourse(user, courseId) {
  if (user.role !== 'STUDENT' || !user.free) return true
  const access = await prisma.courseAccess.findUnique({ where: { courseId_userId: { courseId, userId: user.id } }, select: { until: true } })
  return Boolean(access && access.until > new Date())
}

export async function grantCourse({ course, email, name, source }) {
  email = cleanEmail(email)
  if (!validEmail(email)) throw new Error('Check the email address')
  let user = await prisma.user.findUnique({ where: { email } })
  let passwordLink = null
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name: String(name ?? '').trim().slice(0, 100) || email.split('@')[0],
        // Nobody knows this password: the letter's link sets the real one.
        passwordHash: await hashPassword(randomBytes(24).toString('hex')),
        role: 'STUDENT',
        free: true,
        emailVerified: false,
        schoolId: course.skillset.schoolId
      }
    })
    const token = randomBytes(32).toString('base64url')
    await prisma.passwordReset.create({ data: { tokenHash: hashToken(token), userId: user.id, expiresAt: new Date(Date.now() + PASSWORD_LINK_DAYS * 86400000) } })
    passwordLink = `${APP_URL()}/reset/${token}`
  }
  // A second purchase extends what is left.
  const days = course.accessDays ?? DEFAULT_ACCESS_DAYS
  const existing = await prisma.courseAccess.findUnique({ where: { courseId_userId: { courseId: course.id, userId: user.id } } })
  const from = existing && existing.until > new Date() ? existing.until : new Date()
  const until = new Date(from.getTime() + days * 86400000)
  await prisma.courseAccess.upsert({
    where: { courseId_userId: { courseId: course.id, userId: user.id } },
    create: { courseId: course.id, userId: user.id, until, source },
    update: { until, source }
  })
  const mail = await sendCourseOpenedEmail({ to: email, name: user.name, courseTitle: course.title, until, passwordLink, courseLink: `${APP_URL()}/courses/${course.id}`, support: supportContact() })
  if (!mail.sent) console.warn('[course] access letter not sent:', mail.reason)
  return { user, until, mailed: mail.sent, passwordLink }
}

const loadCourse = (id) => prisma.course.findUnique({ where: { id }, include: { skillset: true } })

async function tellOwners(schoolId, { title, body, url, email }) {
  const owners = await prisma.user.findMany({ where: { schoolId, role: { in: ['OWNER', 'PARTNER'] } }, select: { id: true, email: true, telegramChatId: true } })
  if (email) await email(owners.map((o) => o.email)).catch(() => {})
  notify(owners.map((o) => o.id), { title, body, url }).catch(() => {})
  for (const owner of owners) sendTo(owner, `<b>${esc(title)}</b>\n${esc(body)}`, [[{ text: 'Открыть курс', url: `${APP_URL()}${url}` }]]).catch(() => {})
}

// A Checkout session for a course that Stripe says is paid: credited once.
export async function creditCoursePurchase(session) {
  if (!session || session.mode !== 'payment' || session.payment_status !== 'paid' || !session.metadata?.courseId) return null
  const course = await loadCourse(session.metadata.courseId)
  if (!course) return null
  const email = cleanEmail(session.customer_details?.email ?? session.customer_email)
  const name = session.customer_details?.name ?? ''
  let order
  try {
    order = await prisma.courseOrder.create({
      data: { courseId: course.id, method: 'stripe', status: 'granted', name: name || email, email, rub: Number(session.metadata.rub) || course.priceRub || 0, amountCents: session.amount_total ?? null, currency: String(session.currency ?? 'eur').toUpperCase(), stripeSessionId: session.id, handledAt: new Date() }
    })
  } catch {
    return { already: true }
  }
  const result = await grantCourse({ course, email, name, source: 'stripe' })
  await prisma.courseOrder.update({ where: { id: order.id }, data: { userId: result.user.id } })
  const note = `Оплачено через Stripe: курс «${course.title}» — ${((session.amount_total ?? 0) / 100).toFixed(2)} ${String(session.currency).toUpperCase()}, ${email}. Доступ открыт автоматически до ${result.until.toLocaleDateString('ru-RU')}.`
  await tellOwners(course.skillset.schoolId, { title: `Курс куплен: ${name || email}`, body: note, url: `/courses/${course.id}`, email: (to) => sendPaymentReportedEmail({ to, studentName: name || email, note }) })
  return { credited: true }
}

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

// --- Public: the buy dialog on the website ------------------------------------------
export const courseShopRouter = Router()

courseShopRouter.get('/:id', async (req, res) => {
  const course = await prisma.course.findUnique({
    where: { id: req.params.id },
    include: { skillset: { include: { school: { select: { paymentDetails: true } } } } }
  })
  if (!course?.priceRub) return res.status(404).json({ error: 'This course is not for sale' })
  res.json({
    id: course.id,
    title: course.title,
    priceRub: course.priceRub,
    accessDays: course.accessDays ?? DEFAULT_ACCESS_DAYS,
    stripe: Boolean(stripeKey()),
    paymentDetails: course.skillset.school.paymentDetails
  })
})

// Back from Stripe (no sign-in needed: the session id is the proof).
courseShopRouter.get('/checkout/verify', async (req, res) => {
  const id = typeof req.query.session_id === 'string' ? req.query.session_id : ''
  if (!id || !stripeKey()) return res.status(400).json({ error: 'No session' })
  try {
    const session = await stripeCall(`/checkout/sessions/${encodeURIComponent(id)}`)
    if (!session.metadata?.courseId) return res.status(404).json({ error: 'Not a course payment' })
    const paid = session.payment_status === 'paid'
    if (paid) await creditCoursePurchase(session)
    res.json({ paid, email: session.customer_details?.email ?? null })
  } catch (error) {
    res.status(502).json({ error: `Stripe: ${error.message}` })
  }
})

courseShopRouter.post('/:id/checkout', rateLimit({ windowMs: 10 * 60_000, max: 20 }), async (req, res) => {
  const course = await loadCourse(req.params.id)
  if (!course?.priceRub) return res.status(404).json({ error: 'This course is not for sale' })
  if (!stripeKey()) return res.status(503).json({ error: 'Оплата картой пока не настроена — выберите перевод в рублях' })
  let rate
  try { rate = await eurRate() } catch { return res.status(502).json({ error: 'Курс валют сейчас недоступен, попробуйте через минуту' }) }
  const cents = Math.ceil((course.priceRub / rate.rate) * 100)
  const origin = process.env.CLIENT_ORIGIN ?? `${req.protocol}://${req.get('host')}`
  const back = typeof req.body?.back === 'string' && /^\/[\w\-/]*$/.test(req.body.back) ? req.body.back : '/ielts'
  try {
    const session = await stripeCall('/checkout/sessions', {
      mode: 'payment',
      'line_items[0][price_data][currency]': 'eur',
      'line_items[0][price_data][unit_amount]': String(cents),
      'line_items[0][price_data][product_data][name]': `Advent Academy — курс «${course.title}»`,
      'line_items[0][price_data][product_data][description]': `${course.priceRub.toLocaleString('ru-RU')} ₽ по курсу ЦБ РФ ${rate.rate} ₽/€ на ${rate.date}`,
      'line_items[0][quantity]': '1',
      'metadata[courseId]': course.id,
      'metadata[rub]': String(course.priceRub),
      success_url: `${origin}${back}?paid=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${back}#tariffs`
    })
    res.json({ url: session.url })
  } catch (error) {
    res.status(502).json({ error: `Stripe: ${error.message}` })
  }
})

const transferSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().max(160).transform(cleanEmail).refine(validEmail, 'Проверьте почту'),
  messenger: z.string().trim().max(120).optional().transform((v) => v || null),
  note: z.string().trim().max(500).optional().transform((v) => v || null),
  website: z.string().optional()
})

courseShopRouter.post('/:id/transfer', rateLimit({ windowMs: 60 * 60_000, max: 8, message: 'Слишком много заявок с этого адреса, попробуйте позже' }), async (req, res) => {
  const parsed = transferSchema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Проверьте форму' })
  const { website, ...data } = parsed.data
  if (website) return res.status(201).json({ ok: true })
  const course = await loadCourse(req.params.id)
  if (!course?.priceRub) return res.status(404).json({ error: 'This course is not for sale' })
  const order = await prisma.courseOrder.create({ data: { ...data, courseId: course.id, method: 'transfer', rub: course.priceRub } })
  const url = `/courses/${course.id}`
  await tellOwners(course.skillset.schoolId, {
    title: `Перевод за курс: ${order.name}`,
    body: `${order.rub.toLocaleString('ru-RU')} ₽, ${order.email}${order.messenger ? `, ${order.messenger}` : ''}. Проверьте и откройте доступ.`,
    url,
    email: (to) => sendCourseTransferEmail({ to, order, courseTitle: course.title, link: `${APP_URL()}${url}` })
  })
  res.status(201).json({ ok: true })
})

// --- Admin: on the course page ------------------------------------------------------
export const courseSalesRouter = Router({ mergeParams: true })
const adminOnly = (req, res, next) => (isAdmin(req.user) ? next() : res.status(403).json({ error: 'Not allowed' }))
courseSalesRouter.use(adminOnly)

async function ownCourse(req, res) {
  const course = await loadCourse(req.params.courseId)
  if (!course || course.skillset.schoolId !== req.user.schoolId) { res.status(404).json({ error: 'Course not found' }); return null }
  return course
}

courseSalesRouter.get('/', async (req, res) => {
  const course = await ownCourse(req, res)
  if (!course) return
  const [orders, accesses] = await Promise.all([
    prisma.courseOrder.findMany({ where: { courseId: course.id }, orderBy: { createdAt: 'desc' }, take: 200 }),
    prisma.courseAccess.findMany({ where: { courseId: course.id }, orderBy: { until: 'desc' }, include: { user: { select: { id: true, name: true, email: true } } } })
  ])
  res.json({ priceRub: course.priceRub, accessDays: course.accessDays ?? DEFAULT_ACCESS_DAYS, orders, accesses })
})

courseSalesRouter.patch('/', async (req, res) => {
  const course = await ownCourse(req, res)
  if (!course) return
  const parsed = z.object({ priceRub: z.number().int().min(1).max(10_000_000).nullable(), accessDays: z.number().int().min(1).max(3650) }).safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ error: 'Check the price and the days' })
  await prisma.course.update({ where: { id: course.id }, data: parsed.data })
  res.json(parsed.data)
})

// Open the course to an email (a transfer that arrived, or by hand).
courseSalesRouter.post('/grant', async (req, res) => {
  const course = await ownCourse(req, res)
  if (!course) return
  const orderId = typeof req.body?.orderId === 'string' ? req.body.orderId : null
  const order = orderId ? await prisma.courseOrder.findFirst({ where: { id: orderId, courseId: course.id } }) : null
  const email = order?.email ?? req.body?.email
  const name = order?.name ?? req.body?.name
  try {
    const result = await grantCourse({ course, email, name, source: order ? order.method : 'manual' })
    if (order) await prisma.courseOrder.update({ where: { id: order.id }, data: { status: 'granted', handledAt: new Date(), userId: result.user.id } })
    res.json({ until: result.until, mailed: result.mailed, passwordLink: result.mailed ? null : result.passwordLink })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

courseSalesRouter.post('/orders/:orderId/dismiss', async (req, res) => {
  const course = await ownCourse(req, res)
  if (!course) return
  await prisma.courseOrder.updateMany({ where: { id: req.params.orderId, courseId: course.id, status: 'pending' }, data: { status: 'dismissed', handledAt: new Date() } })
  res.json({ ok: true })
})

courseSalesRouter.delete('/access/:userId', async (req, res) => {
  const course = await ownCourse(req, res)
  if (!course) return
  await prisma.courseAccess.deleteMany({ where: { courseId: course.id, userId: req.params.userId } })
  res.json({ ok: true })
})
