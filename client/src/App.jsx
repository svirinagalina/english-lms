import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import Login from './pages/Login'
import Register from './pages/Register'
import Classrooms from './pages/Classrooms'
import Classroom from './pages/Classroom'
import Practice from './pages/Practice'
import UnitPractice from './pages/UnitPractice'
import Vocabulary from './pages/Vocabulary'
import VocabSet from './pages/VocabSet'
import People from './pages/People'
import Billing from './pages/Billing'
import Join from './pages/Join'

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
      <Route path="/join/:token" element={user ? <Navigate to="/" replace /> : <Join />} />
      <Route path="/" element={<RequireAuth><Classrooms /></RequireAuth>} />
      <Route path="/classroom" element={<RequireAuth><Classrooms /></RequireAuth>} />
      <Route path="/classroom/:id" element={<RequireAuth><Classroom /></RequireAuth>} />
      <Route path="/practice" element={<RequireAuth><Practice /></RequireAuth>} />
      <Route path="/practice/:id" element={<RequireAuth><UnitPractice /></RequireAuth>} />
      <Route path="/vocabulary" element={<RequireAuth><Vocabulary /></RequireAuth>} />
      <Route path="/vocabulary/:id" element={<RequireAuth><VocabSet /></RequireAuth>} />
      <Route path="/people" element={<RequireAuth><People /></RequireAuth>} />
      <Route path="/billing" element={<RequireAuth><Billing /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
