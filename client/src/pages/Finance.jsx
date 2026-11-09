import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../AuthContext'
import { api } from '../api'
import Nav from '../components/Nav'
import Panel from '../components/Panel'
import PersonLink from '../components/PersonLink'

// Finance: packages sold to students from the landing (recorded by the
// server when they pay, or added here), what each leaves after the teacher
// and the tax, and the money spent on advertising. Amounts are kopecks on
// the wire, roubles in the fields.
const rub = (kopecks) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 }).format((kopecks ?? 0) / 100)
const toKopecks = (value) => Math.round(Number(String(value).replace(/\s/g, '').replace(',', '.')) * 100)
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' })
const dayOf = (iso) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' })
const monthOf = (iso) => dayOf(iso).slice(0, 7)
const monthLabel = (ym) => new Date(`${ym}-15`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
const TAX = { npd: 'Russia · НПД', es: 'Spain' }
const SOURCE = { seed: 'Package', stripe: 'Stripe', advent: 'Advent site', package: 'Package (set by hand)', manual: 'Added by hand' }

const emptySale = (settings) => ({
  studentId: '', studentName: '', paidAt: today(), lessons: String(settings?.packageLessons ?? 9),
  amount: settings ? String(settings.packagePrice / 100) : '', currency: 'RUB', tax: 'npd', note: ''
})
const emptyExpense = () => ({ spentAt: today(), amount: '', note: '' })

export default function Finance() {
  const { user } = useAuth()
  const owner = user.role === 'OWNER'
  const [data, setData] = useState(null)
  const [month, setMonth] = useState('all')
  const [error, setError] = useState('')
  const [sale, setSale] = useState(null)
  const [editingSale, setEditingSale] = useState(null)
  const [expense, setExpense] = useState(emptyExpense())
  const [rates, setRates] = useState(null)
  const [savedRates, setSavedRates] = useState(false)

  const load = () => api.finance().then((d) => {
    setData(d)
    setRates({
      teacherPerLesson: String(d.settings.teacherPerLesson / 100), npdRate: String(d.settings.npdRate), esRate: String(d.settings.esRate),
      packagePrice: String(d.settings.packagePrice / 100), packageLessons: String(d.settings.packageLessons)
    })
  }).catch((err) => setError(err.message))
  useEffect(() => { load() }, [])

  const months = useMemo(() => {
    if (!data) return []
    const all = new Set([...data.incomes.map((i) => monthOf(i.paidAt)), ...data.expenses.map((e) => monthOf(e.spentAt))])
    return [...all].sort().reverse()
  }, [data])

  if (error && !data) return <div className="page"><Nav title="Finance" /><div className="error">{error}</div></div>
  if (!data) return <div className="centered">Loading…</div>

  const incomes = month === 'all' ? data.incomes : data.incomes.filter((i) => monthOf(i.paidAt) === month)
  const expenses = month === 'all' ? data.expenses : data.expenses.filter((e) => monthOf(e.spentAt) === month)
  const sum = (list, key) => list.reduce((total, row) => total + row[key], 0)
  const totals = { gross: sum(incomes, 'amountRub'), teacher: sum(incomes, 'teacher'), tax: sum(incomes, 'taxAmount'), net: sum(incomes, 'net'), expenses: sum(expenses, 'amountRub') }
  totals.left = totals.net - totals.expenses

  const run = async (action) => {
    setError('')
    try { await action(); await load() } catch (err) { setError(err.message) }
  }

  const saleBody = (form) => ({
    ...(form.studentId ? { studentId: form.studentId } : {}),
    ...(form.studentName.trim() ? { studentName: form.studentName.trim() } : {}),
    paidAt: form.paidAt, lessons: Number(form.lessons), amountRub: toKopecks(form.amount),
    currency: form.currency, tax: form.tax, note: form.note.trim() || null
  })

  const startEdit = (row) => setEditingSale({
    id: row.id, studentId: '', studentName: row.studentName, paidAt: dayOf(row.paidAt), lessons: String(row.lessons),
    amount: String(row.amountRub / 100), currency: row.currency, tax: row.tax, taxRate: String(row.taxRate),
    teacherPerLesson: String(row.teacherPerLesson / 100), note: row.note ?? ''
  })

  return (
    <div className="page finance-page">
      <Nav title="Finance" />
      {error && <div className="error">{error}</div>}

      <div className="finance-bar">
        <select value={month} onChange={(e) => setMonth(e.target.value)}>
          <option value="all">All time</option>
          {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
        <span className="muted">Sales to students from the landing — new payments are added by themselves.</span>
      </div>

      <div className="finance-cards">
        <div className="finance-card"><span>Revenue</span><strong>{rub(totals.gross)}</strong></div>
        <div className="finance-card"><span>Teachers</span><strong>−{rub(totals.teacher)}</strong></div>
        <div className="finance-card"><span>Taxes</span><strong>−{rub(totals.tax)}</strong></div>
        <div className="finance-card main"><span>Net income</span><strong>{rub(totals.net)}</strong></div>
        <div className="finance-card"><span>Advertising</span><strong>−{rub(totals.expenses)}</strong></div>
        <div className={`finance-card ${totals.left < 0 ? 'minus' : ''}`}><span>Left after advertising</span><strong>{rub(totals.left)}</strong></div>
      </div>

      <Panel id="finance-sales" title="Sales" count={incomes.length} defaultOpen
        actions={owner && !sale && <button type="button" onClick={() => setSale(emptySale(data.settings))}>+ Add a sale</button>}>
        {sale && (
          <SaleForm form={sale} setForm={setSale} students={data.students} settings={data.settings} withStudent
            onCancel={() => setSale(null)}
            onSave={() => run(async () => { await api.addFinanceIncome(saleBody(sale)); setSale(null) })} />
        )}
        {incomes.length === 0 && !sale && <p className="muted">No sales in this period.</p>}
        {incomes.length > 0 && (
          <div className="finance-scroll">
            <table className="finance-table">
              <thead><tr><th>Date</th><th>Student</th><th>Lessons</th><th>Paid</th><th>Teacher</th><th>Tax</th><th>Net</th>{owner && <th />}</tr></thead>
              <tbody>
                {incomes.map((row) => editingSale?.id === row.id ? (
                  <tr key={row.id}><td colSpan={owner ? 8 : 7}>
                    <SaleForm form={editingSale} setForm={setEditingSale} settings={data.settings} withRates
                      onCancel={() => setEditingSale(null)}
                      onSave={() => run(async () => {
                        await api.updateFinanceIncome(row.id, {
                          ...saleBody(editingSale), taxRate: Number(editingSale.taxRate), teacherPerLesson: toKopecks(editingSale.teacherPerLesson)
                        })
                        setEditingSale(null)
                      })} />
                  </td></tr>
                ) : (
                  <tr key={row.id}>
                    <td>{new Date(row.paidAt).toLocaleDateString('ru-RU')}</td>
                    <td>
                      {row.studentId ? <PersonLink id={row.studentId} name={row.studentName} /> : <strong>{row.studentName}</strong>}
                      <div className="muted">{SOURCE[row.source] ?? row.source}{row.currency !== 'RUB' ? ` · paid in ${row.currency}` : ''}{row.note ? ` · ${row.note}` : ''}</div>
                    </td>
                    <td>{row.lessons}</td>
                    <td>{rub(row.amountRub)}</td>
                    <td className="finance-minus">−{rub(row.teacher)}<div className="muted">{rub(row.teacherPerLesson)} × {row.lessons}</div></td>
                    <td className="finance-minus">−{rub(row.taxAmount)}<div className="muted">{TAX[row.tax] ?? row.tax} {row.taxRate}%</div></td>
                    <td><strong>{rub(row.net)}</strong></td>
                    {owner && (
                      <td className="finance-actions">
                        <button type="button" className="ghost" onClick={() => startEdit(row)}>Edit</button>
                        <button type="button" className="ghost" onClick={() => window.confirm(`Delete the sale to ${row.studentName}?`) && run(() => api.deleteFinanceIncome(row.id))}>Delete</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel id="finance-expenses" title="Advertising" count={expenses.length} defaultOpen>
        {owner && (
          <form className="finance-form" onSubmit={(e) => {
            e.preventDefault()
            run(async () => {
              await api.addFinanceExpense({ spentAt: expense.spentAt, amountRub: toKopecks(expense.amount), category: 'ads', note: expense.note.trim() || null })
              setExpense(emptyExpense())
            })
          }}>
            <label>Date<input type="date" value={expense.spentAt} onChange={(e) => setExpense({ ...expense, spentAt: e.target.value })} required /></label>
            <label>Amount, ₽<input inputMode="decimal" value={expense.amount} onChange={(e) => setExpense({ ...expense, amount: e.target.value })} placeholder="5000" required /></label>
            <label className="wide">What for<input value={expense.note} onChange={(e) => setExpense({ ...expense, note: e.target.value })} placeholder="Yandex Direct, Telegram ads…" /></label>
            <button type="submit" disabled={!(toKopecks(expense.amount) > 0)}>Add expense</button>
          </form>
        )}
        {expenses.length === 0 && <p className="muted">Nothing spent in this period.</p>}
        {expenses.length > 0 && (
          <table className="finance-table">
            <thead><tr><th>Date</th><th>What for</th><th>Amount</th>{owner && <th />}</tr></thead>
            <tbody>
              {expenses.map((row) => (
                <tr key={row.id}>
                  <td>{new Date(row.spentAt).toLocaleDateString('ru-RU')}</td>
                  <td>{row.note || 'Advertising'}</td>
                  <td className="finance-minus">−{rub(row.amountRub)}</td>
                  {owner && <td className="finance-actions"><button type="button" className="ghost" onClick={() => window.confirm('Delete this expense?') && run(() => api.deleteFinanceExpense(row.id))}>Delete</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {owner && rates && (
        <Panel id="finance-rates" title="Rates" hint="for new sales; recorded ones keep their own">
          <form className="finance-form" onSubmit={(e) => {
            e.preventDefault()
            run(async () => {
              await api.saveFinanceSettings({
                teacherPerLesson: toKopecks(rates.teacherPerLesson), npdRate: Number(rates.npdRate), esRate: Number(rates.esRate),
                packagePrice: toKopecks(rates.packagePrice), packageLessons: Number(rates.packageLessons)
              })
              setSavedRates(true)
              setTimeout(() => setSavedRates(false), 2500)
            })
          }}>
            <label>Teacher per lesson, ₽<input inputMode="decimal" value={rates.teacherPerLesson} onChange={(e) => setRates({ ...rates, teacherPerLesson: e.target.value })} /></label>
            <label>Russia (НПД), %<input inputMode="decimal" value={rates.npdRate} onChange={(e) => setRates({ ...rates, npdRate: e.target.value })} /></label>
            <label>Spain, %<input inputMode="decimal" value={rates.esRate} onChange={(e) => setRates({ ...rates, esRate: e.target.value })} /></label>
            <label>Package price, ₽<input inputMode="decimal" value={rates.packagePrice} onChange={(e) => setRates({ ...rates, packagePrice: e.target.value })} /></label>
            <label>Lessons in a package<input inputMode="numeric" value={rates.packageLessons} onChange={(e) => setRates({ ...rates, packageLessons: e.target.value })} /></label>
            <button type="submit">{savedRates ? 'Saved ✓' : 'Save rates'}</button>
          </form>
          <p className="muted">The tax is taken from the whole amount paid. Roubles → НПД, euros → Spain. The package price is used when a payment comes without a sum.</p>
        </Panel>
      )}
    </div>
  )
}

function SaleForm({ form, setForm, students, settings, withStudent, withRates, onSave, onCancel }) {
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })
  // A new regime brings its own rate along.
  const setTax = (tax) => setForm((f) => ({ ...f, tax, ...(withRates ? { taxRate: String(tax === 'npd' ? settings.npdRate : settings.esRate) } : {}) }))
  const valid = (form.studentId || form.studentName.trim()) && Number(form.lessons) > 0 && toKopecks(form.amount) >= 0 && form.amount !== ''
  return (
    <form className="finance-form" onSubmit={(e) => { e.preventDefault(); if (valid) onSave() }}>
      {withStudent && (
        <label className="wide">Student
          <select value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value, studentName: '' })}>
            <option value="">— not on the platform —</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      )}
      {(!withStudent || !form.studentId) && <label className="wide">Name<input value={form.studentName} onChange={set('studentName')} required={!form.studentId} /></label>}
      <label>Date<input type="date" value={form.paidAt} onChange={set('paidAt')} required /></label>
      <label>Lessons<input inputMode="numeric" value={form.lessons} onChange={set('lessons')} required /></label>
      <label>Paid, ₽<input inputMode="decimal" value={form.amount} onChange={set('amount')} required /></label>
      <label>Paid in
        <select value={form.currency} onChange={(e) => { const currency = e.target.value; setForm((f) => ({ ...f, currency })); setTax(currency === 'RUB' ? 'npd' : 'es') }}>
          <option value="RUB">Roubles</option><option value="EUR">Euro</option><option value="USD">Dollars</option>
        </select>
      </label>
      <label>Tax
        <select value={form.tax} onChange={(e) => setTax(e.target.value)}>
          <option value="npd">Russia · НПД</option><option value="es">Spain</option>
        </select>
      </label>
      {withRates && <label>Tax, %<input inputMode="decimal" value={form.taxRate} onChange={set('taxRate')} /></label>}
      {withRates && <label>Teacher per lesson, ₽<input inputMode="decimal" value={form.teacherPerLesson} onChange={set('teacherPerLesson')} /></label>}
      <label className="wide">Note<input value={form.note} onChange={set('note')} /></label>
      <div className="finance-form-buttons">
        <button type="submit" disabled={!valid}>Save</button>
        <button type="button" className="ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}
