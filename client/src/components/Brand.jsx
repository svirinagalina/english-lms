import { Link } from 'react-router-dom'

// Advent Academy wordmark: the double-chevron mark and the name, drawn as
// SVG so it stays crisp at any size on the green ground.
export function Logo({ height = 28 }) {
  return (
    <svg width={height * 0.62} height={height} viewBox="0 0 62 100" fill="none" aria-hidden="true">
      <path d="M7 50 L31 6 L55 50" stroke="#fcfbf6" strokeWidth="9" strokeLinejoin="miter" strokeLinecap="butt" />
      <path d="M7 96 L31 52 L55 96" stroke="#fcfbf6" strokeWidth="9" strokeLinejoin="miter" strokeLinecap="butt" />
    </svg>
  )
}

// The logo leads home inside the platform: Classroom when signed in, the
// landing page otherwise (both are "/").
export function Brand({ compact = false }) {
  return (
    <Link className="brand" to="/" title="Advent Academy — Classroom">
      <Logo height={compact ? 34 : 44} />
      <span className="brand-name">
        Advent<br />Academy
        <small>by Galina Svirina</small>
      </span>
    </Link>
  )
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <span>Advent Academy · by Galina Svirina</span>
      <a href="https://advent-academy.ru" target="_blank" rel="noreferrer" className="muted">advent-academy.ru</a>
    </footer>
  )
}
