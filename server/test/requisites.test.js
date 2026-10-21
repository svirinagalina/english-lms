// The school's cards and payment links are the owner's and the partner's:
// a teacher sees lessons, prices and amounts, never which card or link.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { migrate, seed, startServer, signedIn, prisma } from './helpers.js'

let server, school, as

before(async () => {
  migrate()
  school = await seed()
  server = await startServer()
  as = { owner: await signedIn(server.base, school.people.owner), teacher: await signedIn(server.base, school.people.teacher) }
  await prisma.school.update({ where: { id: school.people.owner.schoolId }, data: { paymentDetails: JSON.stringify({ card: '2200111122223333', cardName: 'Galina card' }) } })
  await prisma.user.update({ where: { id: school.people.student.id }, data: { paymentLink: 'https://buy.stripe.com/test', priceAmount: 150000, lessonsPaid: 4 } })
  await prisma.paymentRecord.create({ data: { studentId: school.people.student.id, kind: 'package', lessons: 4, amountCents: 600000, currency: 'RUB', card: 'Galina card · 3333' } })
})

after(async () => {
  await server?.stop()
  await prisma.$disconnect()
})

test('a teacher cannot read the school cards', async () => {
  assert.equal((await as.teacher.get('/api/billing/school')).status, 403)
  assert.match(JSON.stringify((await as.owner.get('/api/billing/school')).body), /2200111122223333/)
})

test('a teacher sees the student\'s lessons and price but no card or link', async () => {
  const id = school.people.student.id
  const mine = (await as.teacher.get(`/api/billing/students/${id}`)).body.student
  assert.equal(mine.priceAmount, 150000)
  assert.equal(mine.package.lessonsPaid, 4)
  for (const key of ['paymentLink', 'payToTrialCard', 'payCardId', 'paysTrialCard']) assert.equal(key in mine, false, key)
  const list = (await as.teacher.get('/api/billing/students')).body.students
  assert.equal(list.some((s) => 'paymentLink' in s), false)
  const people = (await as.teacher.get('/api/users')).body.people
  assert.equal(people.some((p) => p.paymentLink), false)
  const { payments } = (await as.teacher.get(`/api/billing/students/${id}/payments`)).body
  assert.equal(payments[0].amountCents, 600000)
  assert.equal(payments[0].card, null)
  // The owner sees them all.
  assert.equal((await as.owner.get(`/api/billing/students/${id}`)).body.student.paymentLink, 'https://buy.stripe.com/test')
  assert.equal((await as.owner.get(`/api/billing/students/${id}/payments`)).body.payments[0].card, 'Galina card · 3333')
})

test('a teacher saving the student\'s lessons does not touch the payment link', async () => {
  const id = school.people.student.id
  const res = await as.teacher.patch(`/api/billing/students/${id}`, { lessonsPaid: 6, paymentLink: null })
  assert.equal(res.status, 200)
  const user = await prisma.user.findUnique({ where: { id } })
  assert.equal(user.lessonsPaid, 6)
  assert.equal(user.paymentLink, 'https://buy.stripe.com/test')
})
