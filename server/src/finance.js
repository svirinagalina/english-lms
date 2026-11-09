import { prisma } from './db.js'
import { isSiteStudent } from './partnerScope.js'

// Finance (Galina, 2026-10-30): what each package sold to a student from the
// landing (Maxim's site) leaves once the teacher and the tax are paid, and
// what goes on advertising. The tax is a share of the whole amount — the
// teachers work for the school by contract and are not deducted for the tax
// office: roubles → НПД 4%, euros → Spain 20%.

export const FINANCE_DEFAULTS = { teacherPerLesson: 100000, npdRate: 4, esRate: 20, packagePrice: 1899000, packageLessons: 9 }

export async function financeSettings() {
  const row = await prisma.platformSetting.findUnique({ where: { key: 'finance' } })
  let saved = {}
  try { saved = row ? JSON.parse(row.value) : {} } catch { /* the defaults */ }
  return { ...FINANCE_DEFAULTS, ...saved }
}

export async function saveFinanceSettings(values) {
  const value = JSON.stringify({ ...(await financeSettings()), ...values })
  await prisma.platformSetting.upsert({ where: { key: 'finance' }, update: { value }, create: { key: 'finance', value } })
  return financeSettings()
}

export const taxFor = (currency) => (currency === 'RUB' ? 'npd' : 'es')

// One sale: the teacher's share, the tax and what is left, in kopecks.
export function breakdown(row) {
  const teacher = row.lessons * row.teacherPerLesson
  const tax = Math.round((row.amountRub * row.taxRate) / 100)
  return { teacher, taxAmount: tax, net: row.amountRub - teacher - tax }
}

// Roubles for one unit of `currency` at the Central Bank's rate of that day.
export async function cbrRate(currency, date) {
  const d = new Date(date)
  const day = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  const response = await fetch(`https://www.cbr.ru/scripts/XML_daily.asp?date_req=${day}`, { signal: AbortSignal.timeout(5000) })
  if (!response.ok) return null
  // windows-1251: the names come out garbled, the codes and numbers don't.
  const text = Buffer.from(await response.arrayBuffer()).toString('latin1')
  const match = text.match(new RegExp(`<CharCode>${currency}</CharCode><Nominal>(\\d+)</Nominal><Name>[^<]*</Name><Value>([\\d,]+)</Value>`))
  return match ? Number(match[2].replace(',', '.')) / Number(match[1]) : null
}

// A package paid by a student from the landing goes into Finance by itself,
// once per payment (`sourceId`). Roubles as paid; another currency at the
// Central Bank's rate of the day (or `rub`, when the payment already says
// it); with no amount at all, the package price from the settings. Never
// throws: a payment must not fail over its bookkeeping.
export async function recordLandingSale({ studentId, lessons, currency, amountMinor, rub, source, sourceId, paidAt = new Date() }) {
  try {
    if (!(lessons > 0) || !(await isSiteStudent(studentId))) return null
    if (sourceId && (await prisma.financeIncome.findUnique({ where: { sourceId } }))) return null
    const student = await prisma.user.findUnique({ where: { id: studentId }, select: { name: true, schoolId: true } })
    if (!student) return null
    const settings = await financeSettings()
    const cur = String(currency || 'RUB').toUpperCase()
    let amountRub = null
    let note = null
    if (cur === 'RUB' && amountMinor > 0) amountRub = amountMinor
    else if (rub > 0) amountRub = Math.round(rub * 100)
    else if (amountMinor > 0) {
      const rate = await cbrRate(cur, paidAt).catch(() => null)
      if (rate) { amountRub = Math.round(amountMinor * rate); note = `Курс ЦБ: ${rate.toFixed(4)} ₽` }
    }
    if (amountRub == null) {
      amountRub = Math.round((settings.packagePrice / settings.packageLessons) * lessons)
      note = 'Сумма не пришла — взята цена пакета'
    }
    const tax = taxFor(cur)
    return await prisma.financeIncome.create({
      data: {
        schoolId: student.schoolId, studentId, studentName: student.name, paidAt, lessons, amountRub,
        currency: cur, amountOriginal: cur !== 'RUB' && amountMinor > 0 ? amountMinor : null,
        tax, taxRate: tax === 'npd' ? settings.npdRate : settings.esRate, teacherPerLesson: settings.teacherPerLesson,
        source, sourceId: sourceId ?? null, note
      }
    })
  } catch (error) {
    console.error('[finance] record sale', error.message)
    return null
  }
}
