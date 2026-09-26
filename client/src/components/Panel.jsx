import { useState } from 'react'

// A named, collapsible block for the cabinets: the list lives behind its
// title, so a page is a short stack of headings rather than a long scroll.
// Every visit starts folded (only `defaultOpen` panels — a page's main
// content — start open). What was opened is kept while moving around the
// site, so going into a student and back doesn't fold it again, but not in
// the browser: remembered state used to leave "My boards" spread out on
// every visit after it had been opened once.
const openedThisVisit = new Map()

// Clears what older versions kept in the browser.
try {
  for (const key of Object.keys(localStorage)) if (key.startsWith('panel:')) localStorage.removeItem(key)
} catch { /* private window */ }

export default function Panel({ id, title, count, hint, defaultOpen = false, actions, children, className = '' }) {
  const [open, setOpen] = useState(() => openedThisVisit.get(id) ?? defaultOpen)
  const toggle = () => {
    setOpen((v) => {
      openedThisVisit.set(id, !v)
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
