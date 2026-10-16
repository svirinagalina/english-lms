// Stripe subscriptions for the self-service plans (plans.js).
//
// Setup (Settings → "Set up subscriptions", owner only) creates in the
// owner's Stripe account one product per plan with a monthly and a yearly
// EUR price (found again by lookup_key, so it is safe to run twice), and a
// webhook to /api/stripe/webhook whose signing secret is stored encrypted.
// A person subscribes through Stripe Checkout; the webhook (and the return
// from Checkout, so nobody waits for it) sets plan + planUntil from the
// subscription, renewals extend it, a cancellation lets it run out.
import express, { Router } from 'express'
import { createHmac, timingSafeEqual } from 'crypto'
import { prisma } from './db.js'
import { stripeKey, encrypt, decrypt } from './settings.js'
import { PLANS, PLAN_IDS, PERIODS, setPlan } from './plans.js'
import { requireAuth, requireRole } from './auth.js'
import { guardedFetch } from './resilience.js'
import { creditOfferPurchase } from './purchases.js'
import { creditCoursePurchase } from './coursePurchases.js'

const lookupKey = (plan, period) => `lms_${plan}_${period}`

async function stripe(path, params, method) {
  const key = stripeKey()
  if (!key) throw Object.assign(new Error('Stripe is not configured'), { countsAsFailure: false })
  const flat = params && new URLSearchParams(flatten(params)).toString()
  const verb = method ?? (params ? 'POST' : 'GET')
  const url = `https://api.stripe.com/v1${path}${verb === 'GET' && flat ? `?${flat}` : ''}`
  const response = await guardedFetch('stripe', url, {
    method: verb,
    headers: { Authorization: `Bearer ${key}`, ...(verb === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    body: verb === 'POST' && flat ? flat : undefined
  }, { timeoutMs: 20000 })
  const data = await response.json()
  if (!response.ok) throw new Error(data?.error?.message ?? `Stripe returned ${response.status}`)
  return data
}
// { a: { b: 1 }, c: [x] } → { 'a[b]': 1, 'c[0]': x }, the form Stripe reads.
function flatten(value, prefix = '', out = {}) {
  if (value === undefined || value === null) return out
  if (typeof value !== 'object') { out[prefix] = String(value); return out }
  for (const [k, v] of Object.entries(value)) flatten(v, prefix ? `${prefix}[${k}]` : k, out)
  return out
}

// --- Webhook secret --------------------------------------------------------------
let webhookSecret = null
let portalConfig = null
export async function loadSubscriptionSettings() {
  const row = await prisma.platformSetting.findUnique({ where: { key: 'stripe.webhook' } })
  try { webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || (row ? decrypt(row.value) : null) } catch { webhookSecret = null }
  portalConfig = (await prisma.platformSetting.findUnique({ where: { key: 'stripe.portal' } }))?.value ?? null
}
export const subscriptionsReady = () => Boolean(stripeKey() && webhookSecret)

// --- Setup -----------------------------------------------------------------------
export async function setupSubscriptions(origin) {
  const existing = await stripe('/prices', { active: true, limit: 100, lookup_keys: PLAN_IDS.flatMap((p) => PERIODS.map((t) => lookupKey(p, t))) })
  const found = new Set(existing.data.map((p) => p.lookup_key))
  for (const plan of PLAN_IDS) {
    const missing = PERIODS.filter((period) => !found.has(lookupKey(plan, period)))
    if (!missing.length) continue
    const product = await stripe('/products', { name: `Advent Academy — ${PLANS[plan].name}`, metadata: { lms_plan: plan } })
    for (const period of missing) {
      await stripe('/prices', {
        product: product.id, currency: 'eur', unit_amount: PLANS[plan].eur[period],
        recurring: { interval: period }, lookup_key: lookupKey(plan, period), metadata: { lms_plan: plan, period }
      })
    }
  }
  // Our own customer-portal configuration (the account may already have one
  // for other products): change plan or period between these prices, change
  // the card, cancel at period end, invoices. Found again by its metadata.
  const prices = await stripe('/prices', { active: true, limit: 100, lookup_keys: PLAN_IDS.flatMap((p) => PERIODS.map((t) => lookupKey(p, t))) })
  const byProduct = new Map()
  for (const price of prices.data) byProduct.set(price.product, [...(byProduct.get(price.product) ?? []), price.id])
  const features = {
    customer_update: { enabled: true, allowed_updates: ['email', 'name'] },
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    subscription_cancel: { enabled: true, mode: 'at_period_end' },
    subscription_update: {
      enabled: true,
      default_allowed_updates: ['price'],
      proration_behavior: 'create_prorations',
      products: [...byProduct].map(([product, ids]) => ({ product, prices: ids }))
    }
  }
  const portals = await stripe('/billing_portal/configurations', { limit: 100 })
  const ours = portals.data.find((c) => c.metadata?.lms === 'plans')
  const portal = ours
    ? await stripe(`/billing_portal/configurations/${ours.id}`, { features, business_profile: { headline: 'Advent Academy' } })
    : await stripe('/billing_portal/configurations', { features, business_profile: { headline: 'Advent Academy' }, metadata: { lms: 'plans' } })
  await prisma.platformSetting.upsert({ where: { key: 'stripe.portal' }, create: { key: 'stripe.portal', value: portal.id }, update: { value: portal.id } })
  portalConfig = portal.id
  const url = `${origin}/api/stripe/webhook`
  const hooks = await stripe('/webhook_endpoints', { limit: 100 })
  const events = ['checkout.session.completed', 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'invoice.paid']
  const mine = hooks.data.find((h) => h.url === url)
  // A secret is only shown when an endpoint is created: an old endpoint we
  // no longer have the secret for is replaced.
  if (mine && webhookSecret) {
    await stripe(`/webhook_endpoints/${mine.id}`, { enabled_events: events })
  } else {
    if (mine) await stripe(`/webhook_endpoints/${mine.id}`, null, 'DELETE')
    const created = await stripe('/webhook_endpoints', { url, enabled_events: events, description: 'Advent Academy LMS plans' })
    await prisma.platformSetting.upsert({ where: { key: 'stripe.webhook' }, create: { key: 'stripe.webhook', value: encrypt(created.secret) }, update: { value: encrypt(created.secret) } })
    webhookSecret = created.secret
  }
  return { prices: PLAN_IDS.length * PERIODS.length, webhook: url }
}

// --- Applying a subscription to its person -----------------------------------------
const periodEnd = (sub) => sub.current_period_end ?? Math.max(0, ...(sub.items?.data ?? []).map((i) => i.current_period_end ?? 0))

async function applySubscription(sub) {
  const userId = sub.metadata?.userId
  // What is paid for now: the price's lookup key (lms_<plan>_<period>) — a
  // switch in the customer portal changes the price, not our metadata.
  const fromPrice = (sub.items?.data ?? []).map((item) => item.price?.lookup_key?.match(/^lms_(\w+?)_(month|year)$/)?.[1]).find((p) => PLANS[p])
  const plan = fromPrice ?? sub.metadata?.plan
  if (!userId || !PLANS[plan]) return
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, stripeSubscriptionId: true } })
  if (!user) return
  // A newer subscription replaced this one: the old one's events don't count.
  if (user.stripeSubscriptionId && user.stripeSubscriptionId !== sub.id && sub.status !== 'active' && sub.status !== 'trialing') return
  const live = ['active', 'trialing', 'past_due'].includes(sub.status)
  const end = periodEnd(sub)
  // A day of grace past the period end covers a renewal that is a little late.
  const until = live && end ? new Date((end + 24 * 60 * 60) * 1000) : sub.status === 'canceled' ? new Date() : null
  await setPlan(userId, {
    plan: until && until > new Date() ? plan : null,
    planUntil: until,
    planSource: 'stripe',
    stripeCustomerId: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
    stripeSubscriptionId: sub.id
  })
}

function verifySignature(raw, header) {
  if (!webhookSecret || !header) return false
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=')).filter((kv) => kv.length === 2).map(([k, v]) => [k, v]))
  const signatures = header.split(',').filter((kv) => kv.startsWith('v1=')).map((kv) => kv.slice(3))
  const t = Number(parts.t)
  if (!t || Math.abs(Date.now() / 1000 - t) > 600) return false
  const expected = createHmac('sha256', webhookSecret).update(`${t}.${raw}`).digest()
  return signatures.some((sig) => {
    const given = Buffer.from(sig, 'hex')
    return given.length === expected.length && timingSafeEqual(given, expected)
  })
}

// Mounted before express.json: the signature is over the raw body.
export const stripeWebhook = Router()
stripeWebhook.post('/', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
  const raw = req.body.toString('utf8')
  if (!verifySignature(raw, req.get('stripe-signature'))) return res.status(400).send('bad signature')
  let event
  try { event = JSON.parse(raw) } catch { return res.status(400).send('bad json') }
  try {
    const object = event.data?.object
    if (event.type.startsWith('customer.subscription.')) await applySubscription(object)
    else if (event.type === 'checkout.session.completed' && object.subscription) await applySubscription(await stripe(`/subscriptions/${object.subscription}`))
    // A trial-offer purchase (one payment): lessons or a month of the platform.
    // A course bought on the website.
    else if (event.type === 'checkout.session.completed' && object.mode === 'payment' && object.metadata?.courseId) await creditCoursePurchase(object)
    else if (event.type === 'checkout.session.completed' && object.mode === 'payment') await creditOfferPurchase(object)
    else if (event.type === 'invoice.paid') {
      const subId = object.subscription ?? object.parent?.subscription_details?.subscription
      if (subId) await applySubscription(await stripe(`/subscriptions/${subId}`))
    }
    res.json({ received: true })
  } catch (error) {
    console.error('[stripe] webhook', event.type, error.message)
    res.status(500).send('error')
  }
})

// --- Routes for the plans page --------------------------------------------------
export const plansRouter = Router()
plansRouter.use(requireAuth)

plansRouter.get('/', (req, res) => {
  res.json({
    plans: PLAN_IDS.map((id) => ({ id, name: PLANS[id].name, features: PLANS[id].features, eur: PLANS[id].eur, rub: PLANS[id].rub })),
    online: subscriptionsReady()
  })
})

plansRouter.post('/subscribe', async (req, res) => {
  const { plan, period } = req.body ?? {}
  if (!PLANS[plan] || !PERIODS.includes(period)) return res.status(400).json({ error: 'Choose a plan' })
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { id: true, email: true, free: true, plan: true, planUntil: true, planSource: true, stripeCustomerId: true, stripeSubscriptionId: true } })
  if (!user.free) return res.status(400).json({ error: 'You study with a teacher — everything is already open' })
  if (!subscriptionsReady()) return res.status(503).json({ error: 'Online payment is not set up yet' })
  // Already paying through Stripe: changes go through the billing portal.
  if (user.stripeSubscriptionId && user.planSource === 'stripe' && user.planUntil && new Date(user.planUntil) > new Date()) {
    return res.status(409).json({ error: 'You already have a subscription — change it under "Manage subscription"', manage: true })
  }
  const origin = process.env.CLIENT_ORIGIN ?? `${req.protocol}://${req.get('host')}`
  try {
    const prices = await stripe('/prices', { lookup_keys: [lookupKey(plan, period)], active: true })
    const price = prices.data[0]
    if (!price) return res.status(503).json({ error: 'This plan is not set up in Stripe yet' })
    const session = await stripe('/checkout/sessions', {
      mode: 'subscription',
      line_items: [{ price: price.id, quantity: 1 }],
      ...(user.stripeCustomerId ? { customer: user.stripeCustomerId } : { customer_email: user.email }),
      client_reference_id: user.id,
      subscription_data: { metadata: { userId: user.id, plan } },
      metadata: { userId: user.id, plan },
      allow_promotion_codes: true,
      success_url: `${origin}/plans?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/plans`
    })
    res.json({ url: session.url })
  } catch (error) {
    res.status(502).json({ error: `Stripe: ${error.message}` })
  }
})

// Back from Checkout: apply the subscription now rather than wait for the webhook.
plansRouter.get('/verify', async (req, res) => {
  const id = typeof req.query.session_id === 'string' ? req.query.session_id : ''
  if (!id) return res.status(400).json({ error: 'No session' })
  try {
    const session = await stripe(`/checkout/sessions/${encodeURIComponent(id)}`)
    if (session.client_reference_id !== req.user.id) return res.status(404).json({ error: 'Not your payment' })
    if (session.subscription) await applySubscription(await stripe(`/subscriptions/${session.subscription}`))
    const user = await prisma.user.findUnique({ where: { id: req.user.id } })
    res.json({ ok: true, plan: user.plan, planUntil: user.planUntil })
  } catch (error) {
    res.status(502).json({ error: `Stripe: ${error.message}` })
  }
})

// Stripe's own page to change plan, update the card, cancel, get invoices.
plansRouter.post('/portal', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { stripeCustomerId: true } })
  if (!user?.stripeCustomerId) return res.status(400).json({ error: 'No subscription yet' })
  const origin = process.env.CLIENT_ORIGIN ?? `${req.protocol}://${req.get('host')}`
  try {
    const session = await stripe('/billing_portal/sessions', { customer: user.stripeCustomerId, return_url: `${origin}/plans`, ...(portalConfig ? { configuration: portalConfig } : {}) })
    res.json({ url: session.url })
  } catch (error) {
    res.status(502).json({ error: `Stripe: ${error.message}` })
  }
})

// Owner: create the products, prices and webhook in Stripe.
plansRouter.post('/setup', requireRole('OWNER'), async (req, res) => {
  const origin = process.env.CLIENT_ORIGIN ?? `${req.protocol}://${req.get('host')}`
  if (/localhost|127\.0\.0\.1/.test(origin)) return res.status(400).json({ error: 'Set up from the live site, not a local copy' })
  try {
    res.json(await setupSubscriptions(origin))
  } catch (error) {
    res.status(502).json({ error: `Stripe: ${error.message}` })
  }
})
plansRouter.get('/setup', requireRole('OWNER'), (req, res) => res.json({ stripe: Boolean(stripeKey()), ready: subscriptionsReady() }))

// Owner/admin: a plan paid another way (card in roubles) — set by hand.
plansRouter.put('/manual/:userId', requireRole('OWNER'), async (req, res) => {
  const { plan, until } = req.body ?? {}
  const target = await prisma.user.findFirst({ where: { id: req.params.userId, schoolId: req.user.schoolId, free: true } })
  if (!target) return res.status(404).json({ error: 'Not found' })
  if (plan === null) {
    await setPlan(target.id, { plan: null, planUntil: null, planSource: null })
    return res.json({ ok: true })
  }
  const date = new Date(`${until}T23:59:59`)
  if (!PLANS[plan] || Number.isNaN(date.getTime()) || date < new Date()) return res.status(400).json({ error: 'Choose a plan and a date in the future' })
  await setPlan(target.id, { plan, planUntil: date, planSource: 'manual' })
  res.json({ ok: true })
})
