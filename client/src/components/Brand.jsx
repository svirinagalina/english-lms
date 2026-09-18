// Advent Academy wordmark: the double-chevron mark and the name, drawn as
// SVG so it stays crisp at any size on the green ground.
export function Logo({ height = 28 }) {
  return (
    <svg width={height * 0.62} height={height} viewBox="0 0 62 100" fill="none" aria-hidden="true">
      <path d="M12 50 L36 6 L60 50" stroke="#fcfbf6" strokeWidth="9" strokeLinejoin="miter" strokeLinecap="butt" />
      <path d="M2 96 L26 52 L50 96" stroke="#fcfbf6" strokeWidth="9" strokeLinejoin="miter" strokeLinecap="butt" />
    </svg>
  )
}

export function Brand({ compact = false }) {
  return (
    <a className="brand" href="https://advent-academy.ru" target="_blank" rel="noreferrer" title="Advent Academy">
      <Logo height={compact ? 34 : 44} />
      <span className="brand-name">
        Advent<br />Academy
        <small>by Galina Svirina</small>
      </span>
    </a>
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
