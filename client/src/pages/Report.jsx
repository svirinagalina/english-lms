import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../AuthContext'
import { Logo } from '../components/Brand'
import { OFFER, formatRub, discountDeadline } from '../offer'
import { isNativeApp } from '../utils/native'
import { downloadReportPdf } from '../utils/reportPdf'
import '../styles/report.css'

// The level report after a trial lesson: a branded, printable page in
// Russian (it is for the student), with the test results at the end.
export default function Report() {
  const { id } = useParams()
  const { user } = useAuth()
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const articleRef = useRef(null)
  const savePdf = async () => {
    if (!articleRef.current) return
    setSaving(true)
    try {
      await downloadReportPdf(articleRef.current, `Advent Academy — ${report.student} — план.pdf`)
    } catch (err) {
      setError(`Could not build the PDF: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    api.trialReport(id).then(({ report }) => setReport(report)).catch((err) => setError(err.message))
  }, [id])

  if (error) return <div className="centered"><div className="card"><p className="error">{error}</p><Link className="button" to="/">Back</Link></div></div>
  if (!report) return <div className="centered">Loading…</div>
  const g = report.generated
  if (!g) return <div className="centered"><div className="card"><p className="muted">The report has not been generated yet.</p><Link className="button" to={`/classroom/${report.classroomId}`}>Back</Link></div></div>

  const isStaff = user.role !== 'STUDENT'
  const date = new Date(report.publishedAt ?? report.updatedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
  const marked = report.items.filter((i) => i.result)
  const levelBase = g.level.replace('+', '')
  const LEVEL_NAMES = { A1: 'Beginner', A2: 'Pre-Intermediate', B1: 'Intermediate', B2: 'Upper-Intermediate', C1: 'Advanced' }
  const deadline = discountDeadline(report.publishedAt ?? report.updatedAt).label

  return (
    <div className="report-page">
      <div className="report-toolbar no-print">
        <Link className="ghost back-link" to={isStaff ? `/classroom/${report.classroomId}` : '/'}>← Back</Link>
        <div className="row-actions">
          {isStaff && !report.publishedAt && <span className="paid-badge mid">Draft — the student does not see it yet</span>}
          <button className="ghost" onClick={savePdf} disabled={saving}>{saving ? 'Готовим PDF…' : 'Скачать PDF'}</button>
          {!isStaff && <Link className="button" to="/billing">Перейти к оплате</Link>}
        </div>
      </div>

      <article className="report" ref={articleRef}>
        <header className="report-head">
          <div className="report-brand">
            <Logo />
            <div>
              <strong>Advent Academy</strong>
              <small>by Galina Svirina</small>
            </div>
          </div>
          <div className="report-meta">
            <div className="report-kicker">Отчёт по пробному уроку</div>
            <h1>{report.student}</h1>
            <div className="muted">{date} · преподаватель {report.teacher}</div>
          </div>
        </header>

        <section className="report-level">
          <div className="level-badge">
            <span className="level-code">{g.level}</span>
            <span className="level-name">{LEVEL_NAMES[levelBase] ?? ''}</span>
          </div>
          <div className="level-text">
            <h2>Ваш уровень сейчас</h2>
            <p>{g.summary}</p>
            {g.counts && (
              <div className="level-scale">
                {['A1', 'A2', 'B1', 'B2'].map((l) => {
                  const rate = g.estimate?.rates?.[l]
                  return (
                    <div key={l} className={`scale-step ${l === levelBase ? 'current' : ''}`}>
                      <div className="scale-bar"><div className="scale-fill" style={{ width: `${rate ?? 0}%` }} /></div>
                      <div className="scale-label">{l}{rate != null ? ` · ${rate}%` : ''}</div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </section>

        {g.strengths?.length > 0 && (
          <section className="report-block">
            <h2>Что уже получается</h2>
            <ul className="report-list good">{g.strengths.map((s) => <li key={s}>{s}</li>)}</ul>
          </section>
        )}

        {g.focus?.length > 0 && (
          <section className="report-block">
            <h2>Темы, которые требуют внимания</h2>
            <div className="focus-grid">
              {g.focus.map((f) => (
                <div key={f.topic} className="focus-card">
                  <strong>{f.topic}</strong>
                  <p>{f.why}</p>
                  {f.example && <div className="focus-example">{f.example}</div>}
                </div>
              ))}
            </div>
          </section>
        )}

        {g.mistakeTopics?.length > 0 && (
          <section className="report-block">
            <h2>Из тетради ошибок</h2>
            <p className="muted">Темы, которые повторялись на уроках: {g.mistakeTopics.join(' · ')}</p>
          </section>
        )}

        {g.recommendations?.length > 0 && (
          <section className="report-block">
            <h2>Рекомендации</h2>
            <ol className="report-list">{g.recommendations.map((r) => <li key={r}>{r}</li>)}</ol>
          </section>
        )}

        {g.plan?.length > 0 && (
          <section className="report-block">
            <h2>План на первый месяц</h2>
            <ol className="report-list plan">{g.plan.map((p) => <li key={p}>{p}</li>)}</ol>
          </section>
        )}

        {marked.length > 0 && (
          <section className="report-block">
            <h2>Результаты теста</h2>
            <p className="muted">{g.counts.right} верно · {g.counts.partly} частично · {g.counts.wrong} с ошибкой из {g.counts.answered}</p>
            <table className="report-table">
              <tbody>
                {report.items.map((i) => (
                  <tr key={i.n} className={i.result ?? 'skip'}>
                    <td className="n">{i.n}</td>
                    <td><div>{i.ru}</div><div className="muted">{i.en}</div></td>
                    <td className="topic">{i.topic}</td>
                    <td className="mark">{i.result === 'ok' ? '✓' : i.result === 'partly' ? '±' : i.result === 'no' ? '✗' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section className="report-block report-platform">
          <h2>Как вы будете заниматься между уроками</h2>
          <p className="muted">Урок с преподавателем — только часть обучения. Всё остальное — на платформе Advent Academy, в любое удобное время.</p>
          <div className="platform-cards">
            <div className="platform-card wide">
              <img src="/ielts/platform-practice.jpg" alt="" loading="lazy" />
              <div>
                <strong>Грамматика — не только на уроке</strong>
                <p>Специальный тренажёр по авторской методике Галины Свириной: короткие упражнения на каждую тему, чтобы конструкции доводились до автоматизма, а не просто были понятны. Открывается кнопкой «Trainer» в вашем кабинете.</p>
              </div>
            </div>
            <div className="platform-card">
              <span className="platform-icon">🎙️</span>
              <strong>Голосовой ИИ-собеседник</strong>
              <p>Разговорная практика с голосовым ИИ-чатботом: говорите на английском вслух, без стеснения и в своём темпе. Он тоже в разделе «Trainer».</p>
            </div>
            <div className="platform-card">
              <span className="platform-icon">🔁</span>
              <strong>Новые слова с интервальным повторением</strong>
              <p>Слова с уроков попадают в ваш словарь, а платформа напоминает повторить каждое именно тогда, когда оно начинает забываться.</p>
            </div>
            <div className="platform-card">
              <span className="platform-icon">📒</span>
              <strong>Тетрадь ошибок — понятная аналитика прогресса</strong>
              <p>Все ошибки с уроков сохраняются в разделе «Mistake notebook». Повторяйте их перед следующим занятием, чтобы не допускать те же ошибки снова, и следите, как их становится меньше.</p>
            </div>
            <div className="platform-card">
              <span className="platform-icon">✨</span>
              <strong>Подсказки ИИ по вашим ошибкам</strong>
              <p>На основе ваших ошибок ИИ подсказывает, какие грамматические темы в разделе Practice стоит повторить в первую очередь.</p>
            </div>
          </div>
        </section>

        {/* Prices and the way to pay are for the website: the App Store
            allows no way to an outside payment from inside the app. */}
        {!isNativeApp() && <section className="report-offer">
          <h2>{OFFER.heading}</h2>
          <p>{OFFER.intro}</p>
          <p>{OFFER.intro2}</p>
          <div className="offer-ribbon">⏳ Скидка {OFFER.discountPercent}% на первую покупку — {OFFER.discountDays} дня, до {deadline}</div>

          <dl className="offer-facts">
            <div><dt>Формат</dt><dd>{OFFER.format}</dd></div>
            <div><dt>Между занятиями</dt><dd>{OFFER.between}</dd></div>
            <div><dt>Ваш уровень по итогам урока</dt><dd>{g.level}</dd></div>
            <div><dt>Повторяющиеся ошибки</dt><dd>{[...(g.focusTopics ?? []), ...(g.mistakeTopics ?? [])].slice(0, 3).join(' · ') || '—'}</dd></div>
            <div><dt>Скидка для вас</dt><dd>{OFFER.discountPercent}% на первую покупку, {OFFER.discountDays} дня</dd></div>
          </dl>

          <h3>Форматы и цены</h3>
          <div className="offer-plans">
            {OFFER.plans.map((plan) => (
              <div key={plan.id} className={`offer-plan ${plan.recommended ? 'mine' : ''}`}>
                {plan.recommended && <div className="offer-badge">Рекомендуем по итогам урока</div>}
                <div className="offer-plan-name">{plan.name}</div>
                <div className="muted">{plan.line}</div>
                <div className="offer-price"><s>{formatRub(plan.price)}/мес</s> <strong>≈{formatRub(plan.discounted)}</strong> /мес</div>
                <ul>{plan.includes.map((i) => <li key={i}>{i}</li>)}</ul>
              </div>
            ))}
          </div>
          <p className="muted">{OFFER.expertNote}</p>
          <p><strong>{OFFER.guarantee}</strong></p>
          <Link className="offer-cta" to={OFFER.ctaLink}>{OFFER.ctaText}</Link>
          <div className="muted small-hint">Оплатить можно картой онлайн или переводом в рублях — реквизиты на странице оплаты.</div>
          <div className="muted small-hint">{OFFER.expiry}</div>
        </section>}

        <footer className="report-foot">
          <div>Advent Academy · lms.advent-academy.online</div>
          <div>Ждём вас на занятиях!</div>
        </footer>
      </article>
    </div>
  )
}
