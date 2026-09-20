import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'

// "Your lesson is on": shown the moment the teacher starts a call on the
// student's classroom. Polled every ten seconds, and right away when the tab
// comes back to the front.
export default function LiveLesson({ classroomId = null }) {
  const [call, setCall] = useState(null)
  useEffect(() => {
    let stopped = false
    const check = () => api.activeCall().then(({ call }) => { if (!stopped) setCall(call) }).catch(() => {})
    check()
    const timer = setInterval(check, 10000)
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { stopped = true; clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [])
  if (!call || (classroomId && call.classroomId && call.classroomId !== classroomId)) return null
  return (
    <Link className="live-lesson" to={`/call/${call.token}`}>
      <span className="live-dot" aria-hidden="true" />
      <span className="live-text">
        <strong>{call.kind === 'TRIAL' ? 'Your trial lesson has started' : 'Your lesson has started'}</strong>
        <span className="muted">{call.host?.name ?? 'Your teacher'} is waiting in the call · started {new Date(call.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </span>
      <span className="button live-join">Join call</span>
    </Link>
  )
}
