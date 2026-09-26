import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { Brand } from './Brand'
import { Avatar } from './Avatar'
import { api } from '../api'
import { isNativeApp } from '../utils/native'

// Whether the Advent trainer is connected: asked once per page load, and
// again when Settings connects or disconnects it (refreshTrainerStatus).
let trainerStatus = null
const trainerConnected = () => (trainerStatus ??= api.adventStatus().then((s) => s.connected).catch(() => false))
export function refreshTrainerStatus() {
  trainerStatus = null
  window.dispatchEvent(new Event('trainer-status'))
}

const ROLE_LABEL = {
  OWNER: 'administrator',
  TEACHER: 'teacher',
  STUDENT: 'student',
  PARTNER: 'partner'
}

// `back` is where the ← Back link leads on inner pages (a student, a unit, a set).
export default function Nav({ title, back }) {
  const { user, logout } = useAuth()
  const { pathname } = useLocation()
  const [trainer, setTrainer] = useState(false)
  useEffect(() => {
    let live = true
    const check = () => trainerConnected().then((on) => { if (live) setTrainer(on) })
    check()
    window.addEventListener('trainer-status', check)
    return () => { live = false; window.removeEventListener('trainer-status', check) }
  }, [])

  // The sections sit folded under one Menu button: the full list used to
  // wrap over two or three rows at the top of every page.
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  useEffect(() => { setMenuOpen(false) }, [pathname])
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e) => { if (!menuRef.current?.contains(e.target)) setMenuOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey) }
  }, [menuOpen])

  const admin = user.role === 'OWNER' || user.role === 'PARTNER'
  const links = [{ to: '/classroom', label: 'Classroom' }, { to: '/courses', label: 'Courses' }]

  if (user.role !== 'STUDENT') {
    links.push(
      { to: '/timetable', label: 'Timetable' },
      { to: '/practice', label: 'Practice' },
      ...(trainer ? [{ to: '/trainer', label: 'Trainer' }] : []),
      { to: '/vocabulary', label: 'Vocabulary' },
      { to: '/progress', label: 'Progress' }
    )
  } else if (user.free) {
    // The free tier: what is open, and the board to try.
    links.push(
      { to: '/try-board', label: 'Try the board' },
      { to: '/practice', label: 'Practice' },
      ...(trainer ? [{ to: '/trainer', label: 'Trainer' }] : []),
      { to: '/vocabulary', label: 'Vocabulary' },
      { to: '/dictionary', label: 'Dictionary' }
    )
  } else {
    links.push(
      { to: '/timetable', label: 'My Schedule' },
      { to: '/practice', label: 'Practice' },
      ...(trainer ? [{ to: '/trainer', label: 'Trainer' }] : []),
      { to: '/vocabulary', label: 'Vocabulary' },
      { to: '/dictionary', label: 'Dictionary' },
      // Paying is on the website: the App Store does not allow leading to
      // an outside payment from inside the app.
      ...(isNativeApp() ? [] : [{ to: '/billing', label: 'Payment' }])
    )
  }

  if (user.role === 'TEACHER') links.push({ to: '/billing', label: 'Payments' })

  if (admin) {
    links.push({ to: '/people', label: 'People' }, { to: '/billing', label: 'Payments' }, { to: '/content', label: 'Content' })
    if (user.role === 'OWNER') {
      links.push({ to: '/settings', label: 'Settings' })
      // Personal section (todos and calendar) only for owner
      links.push({ to: '/todo', label: 'Todo' }, { to: '/calendar', label: 'Calendar' })
    }
  }

  const isActive = (link) => pathname === link.to || pathname.startsWith(link.to + '/') || (link.to === '/classroom' && pathname === '/')
  const current = links.find(isActive)

  return (
    <header className="topbar">
      <div className="nav-identity brand-row">
        {back && <Link className="ghost back-link" to={back}>← Back</Link>}
        <Brand compact />
        <div>
          <strong>{title ?? user.schoolName ?? 'School'}</strong>
          <Link className="muted nav-me" to="/profile" title="My profile: name, email, password, picture">
            {' · '}<Avatar user={user} size={22} className="nav-avatar" /> {user.name} ({ROLE_LABEL[user.role]})
          </Link>
        </div>
      </div>

      <nav className="nav-menu" ref={menuRef}>
        <button type="button" className={`nav-menu-button ${menuOpen ? 'open' : ''}`} onClick={() => setMenuOpen((v) => !v)} aria-expanded={menuOpen} aria-haspopup="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          {current?.label ?? (pathname === '/profile' ? 'Profile' : 'Menu')}
        </button>
        {menuOpen && (
          <div className="nav-menu-list">
            {links.map((link) => (
              <Link key={link.to} to={link.to} className={`nav-link ${isActive(link) ? 'active' : ''}`}>{link.label}</Link>
            ))}
            <div className="nav-menu-sep" />
            <Link to="/profile" className={`nav-link ${pathname === '/profile' ? 'active' : ''}`} title="Your name, email, password, picture and contacts">Profile</Link>
            <button type="button" className="nav-link nav-signout" onClick={logout}>Sign out</button>
          </div>
        )}
      </nav>
    </header>
  )
}
