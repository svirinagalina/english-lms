import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../AuthContext'
import { openTrialOffer, openPlanOffer } from './TrialOffer'

// The first screen of a free account (signed up in the app, no teacher yet):
// what is open, what a lesson looks like, and the way to a trial lesson.
export default function FreeHome() {
  const { user } = useAuth()
  const [units, setUnits] = useState(null)
  const [sets, setSets] = useState(null)
  const [trainer, setTrainer] = useState(false)
  const [starting, setStarting] = useState(false)
  const navigate = useNavigate()
  const access = user.access ?? {}
  // A Calls plan: one's own call, the link to send to the guests.
  const startCall = async () => {
    if (!access.calls) { openPlanOffer('calls'); return }
    if (starting) return
    setStarting(true)
    try {
      const { call } = await api.createCall({ title: `${user.name}'s call` })
      navigate(`/call/${call.token}`)
    } catch { setStarting(false) }
  }

  useEffect(() => {
    api.listUnits().then(({ units }) => setUnits(units)).catch(() => setUnits([]))
    api.listVocabSets().then(({ sets }) => setSets(sets)).catch(() => setSets([]))
    api.adventStatus().then(({ connected }) => setTrainer(connected)).catch(() => {})
  }, [])

  const open = units?.filter((u) => !u.locked) ?? []
  const nextUnit = open.find((u) => u.solved < u.total) ?? open[0]
  const due = sets?.reduce((n, s) => n + s.due, 0) ?? 0
  const requested = user.trialRequestedAt

  return (
    <>
      <div className="free-plan">
        <p>
          {access.plan ? (
            <><strong>{{ practice: 'Practice', calls: 'Calls', all: 'Everything' }[access.plan]} plan</strong>{' '}
            <span className="muted">до {new Date(access.planUntil).toLocaleDateString('ru-RU')}</span></>
          ) : (
            <><strong>Free plan.</strong>{' '}
            <span className="muted">
              {units ? `${open.length} из ${units.length} тем грамматики` : 'Часть грамматики'}, 20 проверок ИИ в день, словарь, свои слова и пробный доступ к разговорному тренажёру.
            </span></>
          )}
        </p>
        <div className="free-plan-actions">
          <Link className="button" to="/plans">{access.plan ? 'My plan' : 'See plans'}</Link>
          <button type="button" className="ghost" onClick={openTrialOffer}>{requested ? 'Trial lesson requested ✓' : 'Book a trial lesson'}</button>
        </div>
      </div>

      <section>
        <div className="tiles-grid">
          <button type="button" className="tile accent tile-button" onClick={startCall}>
            <span className="tile-kicker">Video calls {access.calls ? '' : '🔒'}</span>
            <strong>{starting ? 'Starting…' : 'Start a call'}</strong>
            <span className="muted">{access.calls ? 'Свой звонок с доской и Writing — отправьте ссылку, гости заходят бесплатно.' : 'Свои видеозвонки — в тарифе Calls. Зайти в звонок, куда вас пригласили, можно бесплатно.'}</span>
          </button>

          <Link className="tile" to="/try-board">
            <span className="tile-kicker">Lessons</span>
            <strong>Try the lesson board</strong>
            <span className="muted">Пишите, рисуйте, двигайте элементы — и посмотрите, как начинается видеоурок.</span>
          </Link>

          <Link className="tile" to={nextUnit ? `/practice/${nextUnit.id}` : '/practice'}>
            <span className="tile-kicker">Practice</span>
            <strong>Train your grammar</strong>
            <span className="muted">
              {nextUnit ? `${nextUnit.title} · сделано ${nextUnit.solved} из ${nextUnit.total}` : units === null ? 'Загрузка…' : 'Темы грамматики'}
            </span>
          </Link>

          <Link className="tile" to="/dictionary">
            <span className="tile-kicker">Dictionary</span>
            <strong>Look up a word</strong>
            <span className="muted">Русский ⇄ английский, с произношением. Сохраняйте слова, чтобы выучить их.</span>
          </Link>

          <Link className="tile" to={due > 0 ? '/vocabulary?review=1' : '/vocabulary'}>
            <span className="tile-kicker">Vocabulary</span>
            <strong>Learn and revise new words</strong>
            <span className="muted">{due > 0 ? `${due} на повторение` : 'Ваши сохранённые слова и наборы слов'}</span>
          </Link>

          {trainer && (
            <Link className="tile" to="/trainer">
              <span className="tile-kicker">Speaking</span>
              <strong>Practice speaking</strong>
              <span className="muted">Говорите с тренажёром и получайте исправления — пробный доступ бесплатный.</span>
            </Link>
          )}

        </div>
      </section>
    </>
  )
}
