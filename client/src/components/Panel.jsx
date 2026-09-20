import { useState } from 'react'

// A named, collapsible block for the cabinets: the list lives behind its
// title, so a page is a short stack of headings rather than a long scroll.
// Whether a panel is open is remembered per browser under `id`.
const KEY = (id) => `panel:${id}`

const remembered = (id, fallback) => {
  try {
    const value = localStorage.getItem(KEY(id))
    return value === null ? fallback : value === '1'
  } catch { return fallback }
}

export default function Panel({ id, title, count, hint, defaultOpen = false, actions, children, className = '' }) {
  const [open, setOpen] = useState(() => remembered(id, defaultOpen))
  const toggle = () => {
    setOpen((v) => {
      try { localStorage.setItem(KEY(id), v ? '0' : '1') } catch { /* private window */ }
      return !v
    })
  }
  return (
    <section className={`panel ${open ? 'open' : ''} ${className}`}>
      <div className="panel-head">
        <button type="button" className="panel-toggle" onClick={toggle} aria-expanded={open}>
          <span className="panel-chevron" aria-hidden="true">▸</span>
          <span className="panel-title">{title}</span>
          {count != null && <span className="panel-count">{count}</span>}
          {hint && !open && <span className="panel-hint muted">{hint}</span>}
        </button>
        {actions && <div className="panel-actions">{actions}</div>}
      </div>
      {open && <div className="panel-body">{children}</div>}
    </section>
  )
}
