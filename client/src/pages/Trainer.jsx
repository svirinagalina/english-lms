import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Nav from '../components/Nav'
import { api } from '../api'
import { useAuth } from '../AuthContext'

// The Advent trainer inside the platform. The student is signed in there by
// their email through a one-time link the server asks for each time this page
// opens (it lives five minutes, so it is never kept or reused).
export default function Trainer() {
  const { user } = useAuth()
  const [url, setUrl] = useState(null)
  const [error, setError] = useState('')
  const [notConnected, setNotConnected] = useState(false)

  useEffect(() => {
    let live = true
    api.trainerLink()
      .then(({ url }) => { if (live) setUrl(url) })
      .catch((err) => {
        if (!live) return
        if (/not connected/i.test(err.message)) setNotConnected(true)
        else setError(err.message)
      })
    return () => { live = false }
  }, [])

  return (
    <div className="trainer-page">
      <Nav title="Trainer" back="/classroom" />
      {url && (
        // allow="microphone" or the browser won't let the trainer hear the student.
        <iframe className="trainer-frame" src={url} title="Advent trainer" allow="microphone; autoplay; clipboard-write" allowFullScreen />
      )}
      {!url && !error && !notConnected && <p className="muted trainer-note">Opening the trainer…</p>}
      {notConnected && (
        <p className="muted trainer-note">
          The trainer isn’t connected yet.{user.role === 'OWNER' ? <> Add its key in <Link to="/settings">Settings</Link>.</> : ' Ask your teacher.'}
        </p>
      )}
      {error && <div className="error trainer-note">Could not open the trainer: {error}</div>}
    </div>
  )
}
