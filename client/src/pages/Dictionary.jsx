import { useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { api } from '../api'
import Nav from '../components/Nav'
import DictionaryPanel from '../components/DictionaryPanel'
import { SiteFooter } from '../components/Brand'

// The dictionary as a page of its own (students — the free tier included):
// Russian ⇄ English, with sound, and "+ Vocabulary" into their own words.
export default function Dictionary() {
  const { user } = useAuth()
  const navigate = useNavigate()
  return (
    <div className="page dictionary-page">
      <Nav title="Dictionary" />
      <DictionaryPanel
        onClose={() => navigate('/')}
        onAdd={user.role === 'STUDENT' ? (term) => api.addBoardWords([term]) : undefined}
      />
      <SiteFooter />
    </div>
  )
}
