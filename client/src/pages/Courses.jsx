import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../AuthContext'
import Nav from '../components/Nav'
import Panel from '../components/Panel'
import { SiteFooter } from '../components/Brand'

export default function Courses() {
  const [skillsets, setSkillsets] = useState(null)
  const [error, setError] = useState('')
  const { user } = useAuth()

  useEffect(() => {
    api.listSkillsets().then(setSkillsets).catch((err) => setError(err.message))
  }, [])

  if (error) return <div className="page"><Nav title="Courses" /><div className="error">{error}</div></div>
  if (!skillsets) return <div className="centered">Loading…</div>

  return (
    <div className="page">
      <Nav title="Courses" />
      {error && <div className="error">{error}</div>}

      {skillsets.length === 0 && (
        <p className="muted">No courses yet.</p>
      )}

      {skillsets.map((skillset) => (
        <Panel key={skillset.id} id={`courses:${skillset.id}`} title={skillset.name} count={skillset.courses.length} defaultOpen>
          <div className="list">
            {skillset.courses.map((course) => (
              <Link key={course.id} className="row set-row student-link" to={`/courses/${course.id}`}>
                <div>
                  <strong>{course.title}</strong>
                  {course.description && <div className="muted">{course.description}</div>}
                </div>
              </Link>
            ))}
          </div>
        </Panel>
      ))}
      {user.role === 'OWNER' && (
        <Panel id="courses:sleep" title="Sleep & meditation" defaultOpen>
          <div className="list">
            <Link className="row set-row student-link" to="/sleep-stories">
              <div>
                <strong>Sleep stories</strong>
                <div className="muted">English bedtime and meditation stories, read aloud. Only you can see this section for now.</div>
              </div>
            </Link>
          </div>
        </Panel>
      )}
      <SiteFooter />
    </div>
  )
}
