import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../AuthContext'

const ROLE_LABEL = {
  OWNER: 'administrator',
  TEACHER: 'teacher',
  STUDENT: 'student'
}

export default function Nav({ title }) {
  const { user, logout } = useAuth()
  const { pathname } = useLocation()

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

  if (user.role === 'OWNER') {
    links.push({ to: '/people', label: 'People' }, { to: '/billing', label: 'Payments' })
  }

  return (
    <header className="topbar">
      <div className="nav-identity">
        <strong>{title ?? user.schoolName ?? 'School'}</strong>
        <span className="muted"> · {user.name} ({ROLE_LABEL[user.role]})</span>
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
