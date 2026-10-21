import { useEffect, useRef, useState } from 'react'
import { Routes, Route, Navigate, useSearchParams, useLocation, useNavigate } from 'react-router-dom'
import { api } from './api'
import { useAuth } from './AuthContext'
import { trackSection, sectionOf } from './utils/activity'
import Login from './pages/Login'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Register from './pages/Register'
import Signup from './pages/Signup'
import Dictionary from './pages/Dictionary'
import TryBoard from './pages/TryBoard'
import TrialOffer from './components/TrialOffer'
import { setUpPush } from './utils/native'
import Classrooms from './pages/Classrooms'
import Classroom from './pages/Classroom'
import HomeworkDocs from './pages/HomeworkDocs'
import Practice from './pages/Practice'
import Trainer from './pages/Trainer'
import UnitPractice from './pages/UnitPractice'
import Plans from './pages/Plans'
import { isNativeApp } from './utils/native'
import Landing from './pages/Landing'
import VerifyEmail from './pages/VerifyEmail'
import Author from './pages/Author'
import MistakePractice from './pages/MistakePractice'
import Vocabulary from './pages/Vocabulary'
import VocabSet from './pages/VocabSet'
import People from './pages/People'
import Billing from './pages/Billing'
import Report from './pages/Report'
import Settings from './pages/Settings'
import Join from './pages/Join'
import Stats from './pages/Stats'
import Call from './pages/Call'
import Content from './pages/Content'
import AudioCheck from './pages/AudioCheck'
import Profile from './pages/Profile'
import Todo from './pages/Todo'
import Timetable from './pages/Timetable'
import TeacherLessons from './pages/TeacherLessons'
import Ielts from './pages/Ielts'
import PersonActivity from './pages/PersonActivity'
import TrialReportsPage from './pages/TrialReportsPage'
import Courses from './pages/Courses'
import Course from './pages/Course'
import ToeflResults from './pages/ToeflResults'
import LessonLink from './pages/LessonLink'
import TelegramLogin from './pages/TelegramLogin'
import TrialBooking from './pages/TrialBooking'
import FinishSignup from './pages/FinishSignup'
import TrialOver from './pages/TrialOver'

// After a trial's three days without paying, only the report and Payment open.
const OPEN_AFTER_TRIAL = /^\/(billing|report\/|plans)/
function RequireAuth({ children, roles }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="centered">Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  if (user.needsSignup) return <Navigate to="/finish-signup" replace />
  if (user.trialOver && !OPEN_AFTER_TRIAL.test(location.pathname)) return <Navigate to="/trial-over" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />
  return children
}

// The site's address: the platform for those signed in, the landing page
// with "Create an account" / "Sign in" for everyone else (the app opens
// straight on sign-in, as before).
function HomeRoute() {
  const { user, loading } = useAuth()
  // The first lesson links from the Advent site were /?advent=<id>.
  const [params] = useSearchParams()
  if (params.get('advent')) return <Navigate to={`/lesson/${encodeURIComponent(params.get('advent'))}`} replace />
  if (loading) return <div className="centered">Loading…</div>
  if (!user) return isNativeApp() ? <Navigate to="/login" replace /> : <Landing />
  if (user.needsSignup) return <Navigate to="/finish-signup" replace />
  if (user.trialOver) return <Navigate to="/trial-over" replace />
  return <Classrooms />
}

// After signing in, a call link (/login?next=/call/…) leads straight to the call.
function LoginRoute() {
  const { user } = useAuth()
  const [params] = useSearchParams()
  const next = params.get('next')
  // Our own path only: '//host' and '/\host' both lead off the site.
  const safeNext = next && /^\/(?![\\/])/.test(next) ? next : '/'
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

// In the iOS app: once signed in, the phone registers for notifications,
// and a tapped notification opens its page (a call, the board, practice).
function usePush(user) {
  const navigate = useNavigate()
  useEffect(() => {
    if (user) setUpPush((url) => navigate(url))
  }, [user?.id])
}

export default function App() {
  const { user, loading } = useAuth()
  const stale = useFreshBuild()
  usePush(user)
  const location = useLocation()
  // Which section the signed-in person opened (the owner's activity view).
  useEffect(() => {
    const section = user && sectionOf(location.pathname)
    if (section) trackSection(section)
  }, [user?.id, location.pathname])

  if (loading) return <div className="centered">Loading…</div>

  return (
    <>
    {stale && (
      <div className="update-toast">
        A new version is ready. <button onClick={() => window.location.reload()}>Reload</button>
      </div>
    )}
    <TrialOffer />
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/signup" element={user ? <Navigate to="/" replace /> : <Signup />} />
      <Route path="/dictionary" element={<RequireAuth><Dictionary /></RequireAuth>} />
      <Route path="/try-board" element={<RequireAuth><TryBoard /></RequireAuth>} />
      <Route path="/forgot" element={user ? <Navigate to="/" replace /> : <ForgotPassword />} />
      <Route path="/reset/:token" element={<ResetPassword />} />
      <Route path="/verify/:token" element={<VerifyEmail />} />
      <Route path="/author" element={<Author />} />
      <Route path="/ielts" element={<Ielts />} />
      <Route path="/register" element={user ? <Navigate to="/" replace /> : <Register />} />
      <Route path="/join/:token" element={user ? <Navigate to="/" replace /> : <Join />} />
      <Route path="/call/:token" element={<Call />} />
      <Route path="/lesson/:token" element={<LessonLink />} />
      <Route path="/tg-login/:token" element={<TelegramLogin />} />
      <Route path="/trial" element={<TrialBooking />} />
      <Route path="/finish-signup" element={<FinishSignup />} />
      <Route path="/trial-over" element={<TrialOver />} />
      <Route path="/" element={<HomeRoute />} />
      <Route path="/plans" element={<RequireAuth><Plans /></RequireAuth>} />
      <Route path="/classroom" element={<RequireAuth><Classrooms /></RequireAuth>} />
      <Route path="/classroom/:id" element={<RequireAuth><Classroom /></RequireAuth>} />
      <Route path="/classroom/:id/homework" element={<RequireAuth><HomeworkDocs /></RequireAuth>} />
      <Route path="/classroom/:id/homework/:docId" element={<RequireAuth><HomeworkDocs /></RequireAuth>} />
      <Route path="/courses" element={<RequireAuth><Courses /></RequireAuth>} />
      <Route path="/courses/:courseId" element={<RequireAuth><Course /></RequireAuth>} />
      <Route path="/toefl" element={<RequireAuth><ToeflResults /></RequireAuth>} />
      <Route path="/practice" element={<RequireAuth><Practice /></RequireAuth>} />
      <Route path="/trainer" element={<RequireAuth><Trainer /></RequireAuth>} />
      <Route path="/practice/mistakes" element={<RequireAuth><MistakePractice /></RequireAuth>} />
      <Route path="/practice/:id" element={<RequireAuth><UnitPractice /></RequireAuth>} />
      <Route path="/vocabulary" element={<RequireAuth><Vocabulary /></RequireAuth>} />
      <Route path="/vocabulary/:id" element={<RequireAuth><VocabSet /></RequireAuth>} />
      <Route path="/people" element={<RequireAuth roles={['OWNER', 'PARTNER']}><People /></RequireAuth>} />
      <Route path="/people/teachers/:id" element={<RequireAuth roles={['OWNER', 'PARTNER']}><TeacherLessons /></RequireAuth>} />
      <Route path="/trial-reports" element={<RequireAuth><TrialReportsPage /></RequireAuth>} />
      <Route path="/people/:id/activity" element={<RequireAuth><PersonActivity /></RequireAuth>} />
      <Route path="/progress" element={<RequireAuth><Stats /></RequireAuth>} />
      <Route path="/progress/:id" element={<RequireAuth><Stats /></RequireAuth>} />
      <Route path="/billing" element={<RequireAuth><Billing /></RequireAuth>} />
      <Route path="/report/:id" element={<RequireAuth><Report /></RequireAuth>} />
      <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
      <Route path="/audio-check" element={<RequireAuth><AudioCheck /></RequireAuth>} />
      <Route path="/todo" element={<RequireAuth roles={['OWNER']}><Todo /></RequireAuth>} />
      {/* Calendar merged into Timetable (2026-09-27) — old links/bookmarks still land somewhere useful. */}
      <Route path="/calendar" element={<Navigate to="/timetable" replace />} />
      <Route path="/timetable" element={<RequireAuth><Timetable /></RequireAuth>} />
      <Route path="/settings" element={<RequireAuth roles={['OWNER']}><Settings /></RequireAuth>} />
      <Route path="/content" element={<RequireAuth roles={['OWNER', 'PARTNER']}><Content /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  )
}
