import { Component } from 'react'
import { api } from '../api'

// Reports a page error to the server diagnostics (who, where, what device) so
// a "blank green screen" can be read in the log instead of guessed at.
const sent = new Set()
export function reportClientError(kind, error, extra = {}) {
  const message = String(error?.message ?? error ?? 'unknown').slice(0, 380)
  const key = `${kind}:${message}:${location.pathname}`
  if (sent.has(key) || sent.size > 20) return
  sent.add(key)
  api.diag({
    kind,
    message,
    details: { path: location.pathname.slice(0, 120), stack: String(error?.stack ?? '').split('\n').slice(0, 4).join(' | ').slice(0, 290), ...extra },
    device: `${navigator.userAgent} · ${window.innerWidth}x${window.innerHeight}`.slice(0, 300)
  })
}

if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => reportClientError('page.error', e.error ?? e.message))
  window.addEventListener('unhandledrejection', (e) => reportClientError('page.rejection', e.reason))
}

// Instead of an empty page: say what happened and offer a reload.
export default class ErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) {
    reportClientError('page.crash', error, { component: String(info?.componentStack ?? '').split('\n').filter(Boolean).slice(0, 3).join(' < ').slice(0, 290) })
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="auth-page">
        <div className="card">
          <h1>Что-то пошло не так</h1>
          <p className="muted">Страница не смогла открыться. Мы уже получили сообщение об ошибке. Попробуйте обновить страницу.</p>
          <button type="button" onClick={() => window.location.reload()}>Обновить</button>
        </div>
      </div>
    )
  }
}
