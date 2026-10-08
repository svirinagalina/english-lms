import { Link } from 'react-router-dom'
import { useAuth } from '../AuthContext'

// A person's name that opens their full analytics (/people/:id/activity)
// for staff; for everyone else it is just the name.
export default function PersonLink({ id, name, children, className = '' }) {
  const { user } = useAuth()
  const label = children ?? <strong>{name}</strong>
  if (!id || !user || user.role === 'STUDENT') return label
  return (
    <Link className={`person-link ${className}`} to={`/people/${id}/activity`} onClick={(e) => e.stopPropagation()} title="Open analytics">
      {label}
    </Link>
  )
}
