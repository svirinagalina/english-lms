import { useEffect, useRef, useState } from 'react'
import { Routes, Route, Navigate, useSearchParams, useLocation } from 'react-router-dom'
import { api } from './api'
import { useAuth } from './AuthContext'
import Login from './pages/Login'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Register from './pages/Register'
import Classrooms from './pages/Classrooms'
import Classroom from './pages/Classroom'
import Practice from './pages/Practice'
import UnitPractice from './pages/UnitPractice'
import MistakePractice from './pages/MistakePractice'
import Vocabulary from './pages/Vocabulary'
import VocabSet from './pages/VocabSet'
import People from './pages/People'
import Billing from './pages/Billing'
import Report from './pages/Report'
import Join from './pages/Join'
import Stats from './pages/Stats'
import Call from './pages/Call'
import Content from './pages/Content'

function RequireAuth({ children, roles }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="centered">Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />
  return children
}

// After signing in, a call link (/login?next=/call/…) leads straight to the call.
function LoginRoute() {
  const { user } = useAuth()
  const [params] = useSearchParams()
  const next = params.get('next')
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/'
  return user ? <Navigate to={safeNext} replace /> : <Login />
}

// A tab left open across a deploy keeps running the old bundle; on the next
// page change it notices the new build and reloads.
function useFreshBuild() {
  const { pathname } = useLocation()
  const known = useRef(null)
  const [stale, setStale] = useState(false)
  const check = (reloadIfNew) => api.version().then(({ build }) => {
    if (known.current === null) known.current = build
    else if (known.current !== build) {
      if (reloadIfNew) window.location.reload()
      else setStale(true)
    }
  }).catch(() => {})
  // On a page change a new build reloads at once; while the user stays on
  // one page (a call, a board) it is only offered, every minute.
  useEffect(() => { check(true) }, [pathname])
  useEffect(() => {
    const timer = setInterval(() => check(false), 60000)
    return () => clearInterval(timer)
  }, [])
  return stale
}

export default function App() {
  const { user, loading } = useAuth()
  const stale = useFreshBuild()

  if (loading) return <div className="centered">Loading…</div>

  return (
    <>
    {stale && (
      <div className="update-toast">
        A new version is ready. <button onClick={() => window.location.reload()}>Reload</button>
      </div>
    )}
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/forgot" element={user ? <Navigate to="/" replace /> : <ForgotPassword />} />
      <Route path="/reset/:token" element={<ResetPassword />} />
      <Route path="/register" element={user ? <Navigate to="/" replace /> : <Register />} />
      <Route path="/join/:token" element={user ? <Navigate to="/" replace /> : <Join />} />
      <Route path="/call/:token" element={<Call />} />
      <Route path="/" element={<RequireAuth><Classrooms /></RequireAuth>} />
      <Route path="/classroom" element={<RequireAuth><Classrooms /></RequireAuth>} />
      <Route path="/classroom/:id" element={<RequireAuth><Classroom /></RequireAuth>} />
      <Route path="/practice" element={<RequireAuth><Practice /></RequireAuth>} />
      <Route path="/practice/mistakes" element={<RequireAuth><MistakePractice /></RequireAuth>} />
      <Route path="/practice/:id" element={<RequireAuth><UnitPractice /></RequireAuth>} />
      <Route path="/vocabulary" element={<RequireAuth><Vocabulary /></RequireAuth>} />
      <Route path="/vocabulary/:id" element={<RequireAuth><VocabSet /></RequireAuth>} />
      <Route path="/people" element={<RequireAuth><People /></RequireAuth>} />
      <Route path="/progress" element={<RequireAuth><Stats /></RequireAuth>} />
      <Route path="/progress/:id" element={<RequireAuth><Stats /></RequireAuth>} />
      <Route path="/billing" element={<RequireAuth><Billing /></RequireAuth>} />
      <Route path="/report/:id" element={<RequireAuth><Report /></RequireAuth>} />
      <Route path="/content" element={<RequireAuth roles={['OWNER', 'PARTNER']}><Content /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  )
}
