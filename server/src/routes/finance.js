import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db.js'
import { requireAuth, requireRole } from '../auth.js'
import { limitedToSite, siteStudentIds, studentScope } from '../partnerScope.js'
import { breakdown, financeSettings, saveFinanceSettings, taxFor } from '../finance.js'

// Finance (finance.js): sales to students from the landing, what each leaves
// after the teacher and the tax, and the money spent on advertising. The
// owner keeps it; the partner (view-only, partnerReadOnly) sees the sales of
// students from his site or paying to his card, and the spending.
export const financeRouter = Router()

financeRouter.use(requireAuth, requireRole('OWNER'))

// The partner: only students from his site, or who pay to his card.
async function partnerStudentIds() {
  const site = await siteStudentIds()
  const card = await prisma.user.findMany({ where: { role: 'STUDENT', payToTrialCard: true, payCardId: null }, select: { id: true } })
  return [...new Set([...site, ...card.map((u) => u.id)])]
}

// `from`/`to` are days (YYYY-MM-DD), counted in Moscow time like Payments.
function period(query) {
  const range = {}
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(query.from ?? ''))) range.gte = new Date(`${query.from}T00:00:00+03:00`)
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(query.to ?? ''))) range.lt = new Date(new Date(`${query.to}T00:00:00+03:00`).getTime() + 86400000)
  return Object.keys(range).length ? range : undefined
}

financeRouter.get('/', async (req, res) => {
  const range = period(req.query)
  const partnerIds = limitedToSite(req.user) ? await partnerStudentIds() : null
  const [incomes, expenses, settings, students] = await Promise.all([
    prisma.financeIncome.findMany({
      where: { schoolId: req.user.schoolId, ...(range ? { paidAt: range } : {}), ...(partnerIds ? { studentId: { in: partnerIds } } : {}) },
      orderBy: { paidAt: 'desc' }
    }),
    prisma.financeExpense.findMany({ where: { schoolId: req.user.schoolId, ...(range ? { spentAt: range } : {}) }, orderBy: { spentAt: 'desc' } }),
    financeSettings(),
    prisma.user.findMany({
      where: { schoolId: req.user.schoolId, role: 'STUDENT', ...(await studentScope(req.user)) },
      select: { id: true, name: true },
      orderBy: { name: 'asc' }
    })
  ])
  const rows = incomes.map((row) => ({ ...row, ...breakdown(row) }))
  const sum = (list, key) => list.reduce((total, row) => total + row[key], 0)
  const totals = {
    gross: sum(rows, 'amountRub'),
    teacher: sum(rows, 'teacher'),
    tax: sum(rows, 'taxAmount'),
    net: sum(rows, 'net'),
    expenses: sum(expenses, 'amountRub')
  }
  totals.left = totals.net - totals.expenses
  res.json({ incomes: rows, expenses, totals, settings, students })
})

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const atNoon = (value) => new Date(`${value}T12:00:00+03:00`)

const incomeSchema = z.object({
  studentId: z.string().nullable().optional(),
  studentName: z.string().trim().min(1).max(200).optional(),
  paidAt: day,
  lessons: z.number().int().min(1).max(200),
  amountRub: z.number().int().min(0).max(1_000_000_000),
  currency: z.enum(['RUB', 'EUR', 'USD']).default('RUB'),
  tax: z.enum(['npd', 'es']).optional(),
  taxRate: z.number().min(0).max(100).optional(),
  teacherPerLesson: z.number().int().min(0).max(100_000_000).optional(),
  note: z.string().trim().max(500).nullable().optional()
})

// A sale added by hand (a student who paid outside the platform's own flows).
financeRouter.post('/incomes', async (req, res) => {
  const parsed = incomeSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid data', details: parsed.error.flatten().fieldErrors })
  const data = parsed.data
  let name = data.studentName
  if (data.studentId) {
    const student = await prisma.user.findFirst({ where: { id: data.studentId, schoolId: req.user.schoolId, role: 'STUDENT' }, select: { name: true } })
    if (!student) return res.status(404).json({ error: 'Student not found' })
    name = name ?? student.name
  }
  if (!name) return res.status(400).json({ error: 'Choose a student or write a name' })
  const settings = await financeSettings()
  const tax = data.tax ?? taxFor(data.currency)
  const income = await prisma.financeIncome.create({
    data: {
      schoolId: req.user.schoolId, studentId: data.studentId ?? null, studentName: name, paidAt: atNoon(data.paidAt),
      lessons: data.lessons, amountRub: data.amountRub, currency: data.currency, tax,
      taxRate: data.taxRate ?? (tax === 'npd' ? settings.npdRate : settings.esRate),
      teacherPerLesson: data.teacherPerLesson ?? settings.teacherPerLesson,
      source: 'manual', note: data.note || null
    }
  })
  res.status(201).json({ income: { ...income, ...breakdown(income) } })
})

financeRouter.patch('/incomes/:id', async (req, res) => {
  const parsed = incomeSchema.partial().safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid data', details: parsed.error.flatten().fieldErrors })
  const row = await prisma.financeIncome.findFirst({ where: { id: req.params.id, schoolId: req.user.schoolId } })
  if (!row) return res.status(404).json({ error: 'Not found' })
  const { paidAt, studentId, ...rest } = parsed.data
  const data = { ...rest, ...(paidAt ? { paidAt: atNoon(paidAt) } : {}) }
  if (rest.note !== undefined) data.note = rest.note || null
  // A new regime without a rate takes the rate of that regime.
  if (rest.tax && rest.taxRate === undefined && rest.tax !== row.tax) {
    const settings = await financeSettings()
    data.taxRate = rest.tax === 'npd' ? settings.npdRate : settings.esRate
  }
  const income = await prisma.financeIncome.update({ where: { id: row.id }, data })
  res.json({ income: { ...income, ...breakdown(income) } })
})

financeRouter.delete('/incomes/:id', async (req, res) => {
  const { count } = await prisma.financeIncome.deleteMany({ where: { id: req.params.id, schoolId: req.user.schoolId } })
  if (!count) return res.status(404).json({ error: 'Not found' })
  res.json({ ok: true })
})

const expenseSchema = z.object({
  spentAt: day,
  amountRub: z.number().int().min(1).max(1_000_000_000),
  category: z.string().trim().min(1).max(40).default('ads'),
  note: z.string().trim().max(500).nullable().optional()
})

financeRouter.post('/expenses', async (req, res) => {
  const parsed = expenseSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid data', details: parsed.error.flatten().fieldErrors })
  const { spentAt, note, ...data } = parsed.data
  const expense = await prisma.financeExpense.create({
    data: { ...data, schoolId: req.user.schoolId, spentAt: atNoon(spentAt), note: note || null, byUserId: req.user.id }
  })
  res.status(201).json({ expense })
})

financeRouter.patch('/expenses/:id', async (req, res) => {
  const parsed = expenseSchema.partial().safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid data', details: parsed.error.flatten().fieldErrors })
  const row = await prisma.financeExpense.findFirst({ where: { id: req.params.id, schoolId: req.user.schoolId } })
  if (!row) return res.status(404).json({ error: 'Not found' })
  const { spentAt, note, ...data } = parsed.data
  const expense = await prisma.financeExpense.update({
    where: { id: row.id },
    data: { ...data, ...(spentAt ? { spentAt: atNoon(spentAt) } : {}), ...(note !== undefined ? { note: note || null } : {}) }
  })
  res.json({ expense })
})

financeRouter.delete('/expenses/:id', async (req, res) => {
  const { count } = await prisma.financeExpense.deleteMany({ where: { id: req.params.id, schoolId: req.user.schoolId } })
  if (!count) return res.status(404).json({ error: 'Not found' })
  res.json({ ok: true })
})

// The rates new sales are counted with; sales already recorded keep theirs.
const settingsSchema = z.object({
  teacherPerLesson: z.number().int().min(0).max(100_000_000),
  npdRate: z.number().min(0).max(100),
  esRate: z.number().min(0).max(100),
  packagePrice: z.number().int().min(0).max(1_000_000_000),
  packageLessons: z.number().int().min(1).max(200)
}).partial()

financeRouter.put('/settings', async (req, res) => {
  const parsed = settingsSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid data', details: parsed.error.flatten().fieldErrors })
  res.json({ settings: await saveFinanceSettings(parsed.data) })
})
