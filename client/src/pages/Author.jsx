import { Link } from 'react-router-dom'
import { Brand, SiteFooter } from '../components/Brand'

// "Автор курса и платформы" — linked from the landing page.
export default function Author() {
  return (
    <div className="landing">
      <header className="landing-head">
        <Link to="/" aria-label="На главную"><Brand /></Link>
        <Link className="button ghost landing-signin" to="/login">Войти</Link>
      </header>
      <main className="author-page">
        <span className="landing-eyebrow">Автор курса и платформы</span>
        <h1>Галина Свирина</h1>
        <p className="landing-lead">
          Преподаватель английского языка, основатель Advent Academy и автор учебника <strong>EnglishTime</strong> —
          34 темы грамматики от настоящего времени до косвенной речи, с тысячами упражнений на перевод.
        </p>
        <div className="author-points">
          <div className="tile">
            <span className="tile-kicker">Методика</span>
            <strong>Упражнения из авторского учебника</strong>
            <span className="muted">Вся грамматика на платформе построена на EnglishTime. ИИ-ментор проверяет ответы так, как их проверял бы преподаватель: принимает любой верный вариант и объясняет ошибку по-русски.</span>
          </div>
          <div className="tile">
            <span className="tile-kicker">Платформа</span>
            <strong>Сделана для своих уроков</strong>
            <span className="muted">Звонки, доска, словарь и практика появились из ежедневной работы с учениками — чтобы всё нужное для урока и самостоятельных занятий было в одном месте.</span>
          </div>
        </div>
        <div className="landing-actions">
          <Link className="button big" to="/signup">Начать бесплатно</Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
