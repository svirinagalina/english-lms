import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../AuthContext'
import { Logo } from '../components/Brand'
import { OFFER, formatRub } from '../offer'
import '../styles/report.css'

// The level report after a trial lesson: a branded, printable page in
// Russian (it is for the student), with the test results at the end.
export default function Report() {
  const { id } = useParams()
  const { user } = useAuth()
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')

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
  // The discount runs for a few days from publication (Moscow time).
  const since = new Date(report.publishedAt ?? report.updatedAt)
  const until = new Date(since.getTime() + OFFER.discountDays * 24 * 60 * 60 * 1000)
  const deadline = `${until.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Moscow' })}, ${until.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' })} МСК`
  const withGalina = /галин|galin/i.test(report.teacher ?? '')

  return (
    <div className="report-page">
      <div className="report-toolbar no-print">
        <Link className="ghost back-link" to={`/classroom/${report.classroomId}`}>← Back</Link>
        <div className="row-actions">
          {isStaff && !report.publishedAt && <span className="paid-badge mid">Draft — the student does not see it yet</span>}
          <button onClick={() => window.print()}>Save as PDF / Print</button>
        </div>
      </div>

      <article className="report">
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

        <section className="report-offer">
          <div className="offer-kicker">После бесплатного урока · индивидуальное обучение</div>
          <h2>Урок закончился. Дальше — план, собранный под ваши ошибки</h2>
          <p>Преподаватель уже услышал, как вы говорите, и увидел, где рассыпается грамматика. Следующий шаг — занятия один на один два раза в неделю по этому плану, а не по программе группы.</p>
          <div className="offer-ribbon">⏳ Скидка {OFFER.discountPercent}% на первую покупку — {OFFER.discountDays} дня, до {deadline}</div>

          <dl className="offer-facts">
            <div><dt>Формат</dt><dd>{OFFER.format}</dd></div>
            <div><dt>Между занятиями</dt><dd>{OFFER.between}</dd></div>
            <div><dt>Ваш уровень по итогам урока</dt><dd>{g.level}</dd></div>
            <div><dt>Повторяющиеся ошибки</dt><dd>{[...(g.focusTopics ?? []), ...(g.mistakeTopics ?? [])].slice(0, 3).join(' · ') || '—'}</dd></div>
            <div><dt>Скидка для вас</dt><dd>{OFFER.discountPercent}% на первую покупку, {OFFER.discountDays} дня</dd></div>
          </dl>

          <h3>Почему не группа</h3>
          <p className="muted">Правила вы уже учили. В разговоре — паузы и самопоправки. Вот где обычно теряется результат.</p>
          <div className="offer-grid">
            {OFFER.whyNotGroup.map((w) => <div key={w.title} className="offer-card"><strong>{w.title}</strong><p>{w.text}</p></div>)}
          </div>

          <h3>Форматы и цены</h3>
          <p className="muted">План под ваши ошибки, отчёт после каждого урока, тренажёр между занятиями — в обоих форматах. Разница в том, кто ведёт.</p>
          <div className="offer-plans">
            {[OFFER.mentor, OFFER.expert].map((plan) => {
              const mine = plan === (withGalina ? OFFER.expert : OFFER.mentor)
              return (
                <div key={plan.name} className={`offer-plan ${mine ? 'mine' : ''}`}>
                  {mine && <div className="offer-badge">Ваш преподаватель с сегодняшнего урока</div>}
                  <div className="offer-plan-name">{plan.name}</div>
                  <div className="muted">{plan.line}</div>
                  <div className="offer-price"><s>{formatRub(plan.price)}/мес</s> <strong>≈{formatRub(plan.discounted)}</strong> /мес</div>
                  <ul>{plan.includes.map((i) => <li key={i}>{i}</li>)}</ul>
                </div>
              )
            })}
          </div>
          <p className="muted">Есть ещё «{OFFER.solo.name}» — {formatRub(OFFER.solo.price)}/мес {OFFER.solo.line}.</p>
          <p className="muted">Отчёт после каждого урока и голосовой тренажёр между занятиями — входят в оба формата с преподавателем, не дополнительно.</p>
          <p><strong>{OFFER.guarantee}</strong></p>
          <a className="offer-cta" href={OFFER.ctaLink}>{OFFER.ctaText}</a>
          <div className="muted small-hint">Через {OFFER.discountDays} дня скидка сгорает и не восстанавливается.</div>
        </section>

        <footer className="report-foot">
          <div>Advent Academy · lms.advent-academy.online</div>
          <div>Ждём вас на занятиях!</div>
        </footer>
      </article>
    </div>
  )
}
