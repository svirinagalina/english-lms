import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './AuthContext'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import '@fontsource/inter/400.css'
import '@fontsource/inter/700.css'
import '@fontsource/inter/400-italic.css'
import '@fontsource/inter/700-italic.css'
import './styles.css'
import './styles/glow.css'

// Dots light up around the pointer (styles/glow.css), only while it is over
// the empty background, not the menu or the page's content. The position goes
// into two CSS variables, at most once a frame.
const CONTENT = '.topbar, .page, .card, .lesson-page, .view-pane, .whiteboard, .call-page, .modal, dialog, .update-toast'
if (window.matchMedia?.('(hover: hover)').matches) {
  const root = document.documentElement
  let frame = 0
  let last = null
  window.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse') return
    last = event
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      root.style.setProperty('--mx', `${last.clientX}px`)
      root.style.setProperty('--my', `${last.clientY}px`)
      const over = last.target instanceof Element && last.target.closest(CONTENT)
      root.classList.toggle('pointer-in', !over)
    })
  }, { passive: true })
  document.addEventListener('pointerleave', () => root.classList.remove('pointer-in'))
  window.addEventListener('blur', () => root.classList.remove('pointer-in'))
}

import { reloadForNewVersion } from './utils/reload'

window.addEventListener('vite:preloadError', (event) => { if (reloadForNewVersion()) event.preventDefault() })

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)
