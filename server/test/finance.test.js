// Finance: the sums (the tax is a share of the whole amount, the teacher is
// paid per lesson), who may open it, and that a package for a student from
// the landing is recorded by itself.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { migrate, seed, startServer, signedIn, prisma } from './helpers.js'

let server, school, as

before(async () => {
  migrate()
  school = await seed()
  server = await startServer()
  as = {}
  for (const [key, person] of Object.entries(school.people)) as[key] = await signedIn(server.base, person)
})

after(async () => {
  await server?.stop()
  await prisma.$disconnect()
})

test('a sale leaves the amount less the teacher and the tax on the whole amount', async () => {
  const rub = await as.owner.post('/api/finance/incomes', { studentName: 'Igor', paidAt: '2026-10-08', lessons: 9, amountRub: 1899000, currency: 'RUB' })
  assert.equal(rub.status, 201)
  assert.equal(rub.body.income.tax, 'npd')
  assert.equal(rub.body.income.teacher, 900000)
  assert.equal(rub.body.income.taxAmount, 75960, 'НПД 4% of 18 990')
  assert.equal(rub.body.income.net, 923040)

  const eur = await as.owner.post('/api/finance/incomes', { studentName: 'Pavel', paidAt: '2026-10-13', lessons: 9, amountRub: 1899000, currency: 'EUR' })
  assert.equal(eur.body.income.tax, 'es')
  assert.equal(eur.body.income.taxAmount, 379800, 'Spain 20% of 18 990, the teacher not deducted')
  assert.equal(eur.body.income.net, 619200)

  assert.equal((await as.owner.post('/api/finance/expenses', { spentAt: '2026-10-20', amountRub: 500000, note: 'Ads' })).status, 201)
  const all = await as.owner.get('/api/finance')
  assert.equal(all.status, 200)
  assert.equal(all.body.totals.net, 923040 + 619200)
  assert.equal(all.body.totals.left, 923040 + 619200 - 500000)

  const october = await as.owner.get('/api/finance?from=2026-10-10&to=2026-10-31')
  assert.equal(october.body.incomes.length, 1, 'the period filters by the payment day')
})

test('only the owner and the partner open Finance; the partner changes nothing', async () => {
  assert.equal((await as.teacher.get('/api/finance')).status, 403)
  assert.equal((await as.student.get('/api/finance')).status, 403)
  assert.equal((await as.teacher.post('/api/finance/expenses', { spentAt: '2026-10-20', amountRub: 100 })).status, 403)
  const partner = await as.partner.get('/api/finance')
  assert.equal(partner.status, 200)
  assert.equal(partner.body.incomes.length, 0, "sales to students not from his site are not his")
  assert.equal((await as.partner.post('/api/finance/expenses', { spentAt: '2026-10-20', amountRub: 100 })).status, 403)
  // A student of another school cannot be named.
  const other = await as.owner.post('/api/finance/incomes', { studentId: school.people.studentB.id, paidAt: '2026-10-20', lessons: 9, amountRub: 1 })
  assert.equal(other.status, 404)
})

test('a package for a student from the landing goes into Finance by itself', async () => {
  const { student, teacher } = school.people
  await prisma.adventLesson.create({
    data: { adventId: 'fin-1', kind: 'trial', title: 'Trial', startsAt: new Date(), durationMin: 40, status: 'scheduled', teacherId: teacher.id, studentUserId: student.id }
  })
  const res = await as.owner.patch(`/api/billing/students/${student.id}`, { lessonsPaid: 9, priceAmount: 211000, resetCounter: true })
  assert.equal(res.status, 200)
  const finance = await as.owner.get('/api/finance')
  const sale = finance.body.incomes.find((i) => i.studentId === student.id)
  assert.ok(sale, 'recorded')
  assert.equal(sale.source, 'package')
  assert.equal(sale.amountRub, 1899000)
  assert.equal(sale.lessons, 9)
  // Now a site student: the partner sees it.
  assert.ok((await as.partner.get('/api/finance')).body.incomes.some((i) => i.id === sale.id))
})
