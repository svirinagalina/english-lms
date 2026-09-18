// Advent Academy wordmark: the double-chevron mark and the name, drawn as
// SVG so it stays crisp at any size on the green ground.
export function Logo({ height = 28 }) {
  return (
    <svg width={height * 1.15} height={height} viewBox="0 0 46 40" fill="none" aria-hidden="true">
      <path d="M2 38 L17 6 L21.5 15.5 L11 38 Z" fill="#fcfbf6" />
      <path d="M17 38 L29 12 L44 38 L35.5 38 L29 25.5 L23 38 Z" fill="#fcfbf6" />
    </svg>
  )
}

export function Brand({ compact = false }) {
  return (
    <a className="brand" href="https://advent-academy.ru" target="_blank" rel="noreferrer" title="Advent Academy">
      <Logo height={compact ? 22 : 28} />
      <span className="brand-name">
        Advent<br />Academy
        {!compact && <small>by Galina Svirina</small>}
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
