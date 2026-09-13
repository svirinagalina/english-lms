import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Lesson from './pages/Lesson'

function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="centered">Loading…</div>
  return user ? children : <Navigate to="/login" replace />
}

export default function App() {
  const { user, loading } = useAuth()

  if (loading) return <div className="centered">Loading…</div>

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to="/" replace /> : <Register />} />
      <Route path="/" element={<RequireAuth><Dashboard /></RequireAuth>} />
      <Route path="/lesson/:id" element={<RequireAuth><Lesson /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
