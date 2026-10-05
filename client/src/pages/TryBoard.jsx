import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { api } from '../api'
import Whiteboard from '../components/Whiteboard'
import { openTrialOffer } from '../components/TrialOffer'
import { localBoardSocket } from '../utils/localBoard'

// The free tier's look at the lesson board: every tool works, it is kept in
// this browser only, and "Start call" offers a trial lesson instead.
const at = Date.now()
const line = (id, y, text, extra = {}) => ({ id, type: 'text', color: '#111827', width: 6, x: 60, y, w: 620, fontSize: 20, text, at, ...extra })
const SEED = [
  line('try-title', 40, '— Your lesson board —', { color: '#2563eb', fontSize: 28 }),
  line('try-1', 100, 'In a lesson, you and your teacher write, draw and paste pictures here together, on a video call.'),
  line('try-2', 190, 'Try it: pick Pen or Text below and write anything. Pinch or scroll to zoom, drag the empty board to move around.'),
  line('try-3', 280, 'Double-click (or double-tap) an English word — "improve", "confident" — to hear it and save it to your vocabulary.'),
  line('try-4', 370, 'Press "Start call" at the top to see how a lesson begins.', { color: '#b5539a' })
]

export default function TryBoard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const socketRef = useRef(null)
  if (!socketRef.current) socketRef.current = localBoardSocket(`try-board:${user.id}`, SEED)

  return (
    <div className="lesson-page">
      <div className="view-pane">
        <Whiteboard
          socketRef={socketRef}
          boardId="try-board"
          title="Try the board"
          subtitle="Only you can see this one"
          onClose={() => navigate('/')}
          onStartCall={openTrialOffer}
          // As a student sees it: a double-click on a word opens its card.
          wordPicker
          saveAllMoves
          onAddWords={(words) => api.addBoardWords(words)}
        />
      </div>
    </div>
  )
}
