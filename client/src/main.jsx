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

// The background grid lights up around the pointer (styles/glow.css): the
// position goes into two CSS variables, at most once a frame.
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
      root.classList.add('pointer-in')
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
