// Stripe payments the platform sees by itself: a package paid through the
// platform's Checkout adds its lessons (once); a payment through a plain
// Stripe link adds nothing but is noted for the owners (once).
import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { migrate, seed, startServer, signedIn, prisma, DATABASE_URL } from './helpers.js'

let server, school, as, purchases

const DAY = 86_400_000
let n = 0
const sessionId = () => `cs_test_${Date.now()}_${n++}`

before(async () => {
  migrate()
  school = await seed()
  server = await startServer()
  as = { owner: await signedIn(server.base, school.people.owner), student: await signedIn(server.base, school.people.student) }
  process.env.DATABASE_URL = DATABASE_URL
  purchases = await import('../src/purchases.js')
})

after(async () => {
  await server?.stop()
  await prisma.$disconnect()
  const { prisma: appPrisma } = await import('../src/db.js')
  await appPrisma.$disconnect()
})

// 8 lessons from 10 days ago, 3 of them held: 5 left.
beforeEach(async () => {
  const { student } = school.people
  await prisma.session.deleteMany({ where: { classroom: { studentId: student.id } } })
  await prisma.paymentRecord.deleteMany({ where: { studentId: student.id } })
  await prisma.user.update({ where: { id: student.id }, data: { lessonsPaid: 8, packageStartedAt: new Date(Date.now() - 10 * DAY), heldAdjust: 0, priceAmount: 150000, priceCurrency: 'RUB' } })
  for (const day of [9, 6, 2]) await prisma.session.create({ data: { classroomId: school.rooms.student.id, startedAt: new Date(Date.now() - day * DAY), endedAt: new Date(Date.now() - day * DAY) } })
})

const packageSession = (extra = {}) => ({
  id: sessionId(), mode: 'payment', payment_status: 'paid', amount_total: 13400, currency: 'eur',
  client_reference_id: school.people.student.id,
  metadata: { kind: 'package', studentId: school.people.student.id, lessons: '8', price: '150000', currency: 'RUB', rub: '12000' },
  ...extra
})

const linkSession = (email, extra = {}) => ({
  id: sessionId(), mode: 'payment', payment_status: 'paid', amount_total: 12000, currency: 'eur',
  payment_link: 'plink_test', created: Math.floor(Date.now() / 1000), metadata: {},
  customer_details: { email, name: 'Payer' }, ...extra
})

test('a package paid through Checkout adds its lessons to what was left, once', async () => {
  const session = packageSession()
  const result = await purchases.creditStripeSession(session)
  assert.deepEqual(result, { credited: true, lessons: 8 })
  const pkg = (await as.student.get('/api/billing/me')).body.billing.package
  assert.equal(pkg.lessonsPaid, 13) // 5 left + 8 paid
  assert.equal(pkg.held, 0)
  // The return page and the sweep both see it: the second time adds nothing.
  assert.deepEqual(await purchases.creditStripeSession(session), { already: true })
  assert.equal((await as.student.get('/api/billing/me')).body.billing.package.lessonsPaid, 13)
  const { payments } = (await as.owner.get(`/api/billing/students/${school.people.student.id}/payments`)).body
  const line = payments.find((p) => p.id === session.id)
  assert.equal(line.kind, 'stripe')
  assert.equal(line.lessons, 8)
  assert.match(line.note, /Пакет уроков/)
})

test('an unpaid or foreign session adds nothing', async () => {
  assert.equal(await purchases.creditPackagePurchase(packageSession({ payment_status: 'unpaid' })), null)
  assert.equal(await purchases.creditPackagePurchase(packageSession({ metadata: { plan: 'mentor', studentId: school.people.student.id } })), null)
  assert.equal((await as.student.get('/api/billing/me')).body.billing.package.lessonsPaid, 8)
})

test('a Stripe-link payment is matched by email, noted once, and adds no lessons', async () => {
  const session = linkSession(school.people.student.email.toUpperCase())
  assert.deepEqual(await purchases.noticeLinkPayment(session), { student: school.people.student.id })
  assert.deepEqual(await purchases.noticeLinkPayment(session), { already: true })
  const records = await prisma.paymentRecord.findMany({ where: { studentId: school.people.student.id } })
  assert.equal(records.length, 1)
  assert.equal(records[0].kind, 'stripe-link')
  assert.equal(records[0].lessons, null)
  assert.equal(records[0].amountCents, 12000)
  assert.equal((await as.student.get('/api/billing/me')).body.billing.package.lessonsPaid, 8)
})

test('a Stripe-link payment from an unknown email is not pinned on anyone', async () => {
  assert.deepEqual(await purchases.noticeLinkPayment(linkSession('nobody@example.com')), { student: null })
  assert.equal(await prisma.paymentRecord.count({ where: { kind: 'stripe-link' } }), 0)
})

test('without Stripe set up there is no online package button', async () => {
  assert.equal((await as.student.get('/api/billing/me')).body.billing.packageCheckout, null)
  assert.equal((await as.student.post('/api/billing/me/package-checkout')).status, 400)
})

test('a student set to Stripe sees online payment only, no rouble card', async () => {
  const { student } = school.people
  await prisma.school.update({ where: { id: student.schoolId }, data: { paymentDetails: JSON.stringify({ card: '2200111122223333', cardName: 'Galina card', link: 'https://buy.stripe.com/school', note: 'Thanks!' }) } })
  const before = (await as.student.get('/api/billing/me')).body.billing
  assert.match(before.paymentDetails, /2200111122223333/)
  assert.equal(before.paysStripe, false)
  assert.equal((await as.owner.patch(`/api/billing/students/${student.id}`, { payCardId: 'stripe', payToTrialCard: null })).status, 200)
  const after = (await as.student.get('/api/billing/me')).body.billing
  assert.equal(after.paysStripe, true)
  assert.doesNotMatch(after.paymentDetails, /2200111122223333/)
  assert.match(after.paymentDetails, /buy\.stripe\.com\/school/)
  await as.owner.patch(`/api/billing/students/${student.id}`, { payCardId: null })
})
