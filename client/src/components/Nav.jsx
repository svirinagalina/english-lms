import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { Brand } from './Brand'
import { Avatar } from './Avatar'
import DictionaryPanel from './DictionaryPanel'

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
  const [dictionaryOpen, setDictionaryOpen] = useState(false)
  const staff = user.role !== 'STUDENT'

  const admin = user.role === 'OWNER' || user.role === 'PARTNER'
  const links = [{ to: '/classroom', label: 'Classroom' }, { to: '/courses', label: 'Courses' }]

  if (user.role !== 'STUDENT') {
    links.push(
      { to: '/timetable', label: 'Timetable' },
      { to: '/practice', label: 'Practice' },
      { to: '/vocabulary', label: 'Vocabulary' },
      { to: '/progress', label: 'Progress' }
    )
  } else {
    links.push(
      { to: '/timetable', label: 'My Schedule' },
      { to: '/practice', label: 'Practice' },
      { to: '/vocabulary', label: 'Vocabulary' },
      { to: '/billing', label: 'Payment' }
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

      <nav className="nav-links">
        {links.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className={`nav-link ${(pathname === link.to || pathname.startsWith(link.to + '/') || (link.to === '/classroom' && pathname === '/')) ? 'active' : ''}`}
          >
            {link.label}
          </Link>
        ))}
        {staff && (
          <button className={`ghost ${dictionaryOpen ? 'active' : ''}`} onClick={() => setDictionaryOpen((v) => !v)} title="Any word or phrase, Russian ⇄ English">Dictionary</button>
        )}
        <Link to="/profile" className={`nav-link ${pathname === '/profile' ? 'active' : ''}`} title="Your name, email, password, picture and contacts">Profile</Link>
        <button className="ghost" onClick={logout}>Sign out</button>
      </nav>
      {dictionaryOpen && <DictionaryPanel onClose={() => setDictionaryOpen(false)} />}
    </header>
  )
}
