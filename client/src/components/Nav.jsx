import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { Brand } from './Brand'

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

  const admin = user.role === 'OWNER' || user.role === 'PARTNER'
  const links = [{ to: '/classroom', label: 'Classroom' }]

  if (user.role !== 'STUDENT') {
    links.push(
      { to: '/practice', label: 'Practice' },
      { to: '/vocabulary', label: 'Vocabulary' },
      { to: '/progress', label: 'Progress' }
    )
  } else {
    links.push(
      { to: '/practice', label: 'Practice' },
      { to: '/vocabulary', label: 'Vocabulary' },
      { to: '/billing', label: 'Payment' }
    )
  }

  if (user.role === 'TEACHER') links.push({ to: '/billing', label: 'Payments' })

  if (admin) {
    links.push({ to: '/people', label: 'People' }, { to: '/billing', label: 'Payments' }, { to: '/content', label: 'Content' })
    if (user.role === 'OWNER') links.push({ to: '/settings', label: 'Settings' })
  }

  return (
    <header className="topbar">
      <div className="nav-identity brand-row">
        {back && <Link className="ghost back-link" to={back}>← Back</Link>}
        <Brand compact />
        <div>
          <strong>{title ?? user.schoolName ?? 'School'}</strong>
          <span className="muted"> · {user.name} ({ROLE_LABEL[user.role]})</span>
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
        <button className="ghost" onClick={logout}>Sign out</button>
      </nav>
    </header>
  )
}
