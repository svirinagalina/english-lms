import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'
import Nav from '../components/Nav'
import Panel from '../components/Panel'
import { SiteFooter } from '../components/Brand'
import PersonLink from '../components/PersonLink'

const formatDate = (value) => (value ? new Date(value).toLocaleDateString() : '—')

function AccuracyBadge({ value }) {
  if (value == null) return <span className="muted">no attempts</span>
  const tone = value >= 75 ? 'active' : value >= 50 ? 'mid' : ''
  return <span className={`paid-badge ${tone}`}>{value}%</span>
}

function StudentList() {
  const [students, setStudents] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.statsStudents()
      .then(({ students }) => setStudents(students))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="centered">Loading…</div>

  return (
    <div className="page">
      <Nav title="Progress" />
      {error && <div className="error">{error}</div>}

      <Panel id="stats:students" title="Students" count={students.length} defaultOpen>
        {students.length === 0 && <p className="muted">No students yet. Once a student practises, their accuracy and weak topics show here.</p>}
        <div className="list">
          {students.map((student) => (
            <Link key={student.id} className="row unit-row" to={`/progress/${student.id}`}>
              <div className="unit-main">
                <PersonLink id={student.id} name={student.name} />
                <div className="muted">
                  {student.total} attempts · {student.recentTotal} in the last 30 days
                  {student.lastActive && ` · last ${formatDate(student.lastActive)}`}
                </div>
                {student.weakTopics.length > 0 && (
                  <div className="mistake-tags" style={{ marginTop: 8 }}>
                    {student.weakTopics.map((label) => (
                      <span key={label} className="mistake-tag">{label}</span>
                    ))}
                  </div>
                )}
              </div>
              <AccuracyBadge value={student.accuracy} />
            </Link>
          ))}
        </div>
      </Panel>
    </div>
  )
}

function StudentDetail({ id }) {
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.statsStudent(id)
      .then(setReport)
      .catch((err) => setError(err.message))
  }, [id])

  if (error) {
    return (
      <div className="centered">
        <div className="card">
          <h2>Cannot load</h2>
          <p className="error">{error}</p>
          <Link className="button" to="/progress">Back</Link>
        </div>
      </div>
    )
  }

  if (!report) return <div className="centered">Loading…</div>

  return (
    <div className="page">
      <Nav title={report.student.name} back="/progress" />

      <section>
        <div className="stat-row">
          <div className="stat-box">
            <strong>{report.accuracy ?? '—'}{report.accuracy != null && '%'}</strong>
            <span className="muted">accuracy</span>
          </div>
          <div className="stat-box">
            <strong>{report.total}</strong>
            <span className="muted">attempts</span>
          </div>
          <div className="stat-box">
            <strong>{report.recentTotal}</strong>
            <span className="muted">last 30 days</span>
          </div>
          <div className="stat-box">
            <strong>{formatDate(report.lastActive)}</strong>
            <span className="muted">last active</span>
          </div>
        </div>
      </section>

      {report.suggestions.length > 0 && (
        <Panel id="stats:work" title="What to work on" count={report.suggestions.length} defaultOpen>
          <div className="list">
            {report.suggestions.map((item) => (
              <div key={item.topic} className="row column suggestion">
                <strong>{item.label}</strong>
                <div className="muted">
                  Revisit:{' '}
                  {item.units.map((unit, index) => (
                    <span key={unit.id}>
                      {index > 0 && ' · '}
                      <Link to={`/practice/${unit.id}`}>{unit.title}</Link>
                      {' '}<span className="muted">({unit.exercises} exercises)</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {report.weakTopics.length > 0 && (
        <Panel id="stats:topics" title="Mistakes by topic" count={report.weakTopics.length}>
          <div className="list">
            {report.weakTopics.map((topic) => (
              <div key={topic.topic} className="row">
                <div>
                  <strong>{topic.label}</strong>
                  <div className="muted">
                    {topic.count} {topic.count === 1 ? 'mistake' : 'mistakes'}
                    {topic.recent > 0 && ` · ${topic.recent} recent`}
                    {' '}· met {topic.exposure} times
                  </div>
                </div>
                <span className={`paid-badge ${topic.errorRate < 30 ? 'active' : topic.errorRate < 60 ? 'mid' : ''}`}>
                  {topic.errorRate}% wrong
                </span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {report.units.length > 0 && (
        <Panel id="stats:units" title="By chapter" count={report.units.length}>
          <div className="list">
            {report.units.map((unit) => (
              <div key={unit.id} className="row">
                <div className="unit-main">
                  <strong>{unit.title}</strong>
                  <div className="muted">{unit.solved} of {unit.total} solved · {unit.attempts} attempts</div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${Math.round((unit.solved / unit.total) * 100)}%` }} />
                  </div>
                </div>
                <AccuracyBadge value={unit.accuracy} />
              </div>
            ))}
          </div>
        </Panel>
      )}

      {report.recentMistakes.length > 0 && (
        <Panel id="stats:recent" title="Recent mistakes" count={report.recentMistakes.length}>
          <div className="list">
            {report.recentMistakes.map((item, index) => (
              <div key={index} className="row column">
                <div className="muted">{item.prompt}</div>
                <div className="mistake-pair">
                  <span className="mistake-wrong">{item.answer}</span>
                  <span className="muted">→</span>
                  <span>{item.expected}</span>
                </div>
                {item.topics.length > 0 && (
                  <div className="mistake-tags">
                    {item.topics.map((label) => <span key={label} className="mistake-tag">{label}</span>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Panel>
      )}

      {report.total === 0 && (
        <p className="muted" style={{ marginTop: 24 }}>This student has not done any exercises yet.</p>
      )}
      <SiteFooter />
    </div>
  )
}

export default function Stats() {
  const { id } = useParams()
  return id ? <StudentDetail id={id} /> : <StudentList />
}
