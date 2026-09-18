import { useEffect, useState } from 'react'

export const REACTIONS = ['👍', '👏', '🎉', '❤️', '😂', '🔥', '💪', '⭐', '🙌', '😊', '💯']

// Emoji that float up the screen for a couple of seconds — everyone's.
export default function Reactions({ socketRef, ready = true }) {
  const [flying, setFlying] = useState([])
  useEffect(() => {
    const socket = socketRef.current
    if (!socket) return
    const onReaction = ({ emoji, name, at }) => {
      const id = `${at}-${Math.random().toString(36).slice(2, 7)}`
      const x = 15 + Math.random() * 70 // percent of the width
      setFlying((list) => [...list.slice(-30), { id, emoji, name, x }])
      setTimeout(() => setFlying((list) => list.filter((f) => f.id !== id)), 2600)
    }
    socket.on('reaction', onReaction)
    return () => socket.off('reaction', onReaction)
  }, [socketRef, ready])
  if (!flying.length) return null
  return (
    <div className="reactions-layer" aria-hidden="true">
      {flying.map((f) => (
        <div key={f.id} className="reaction-fly" style={{ left: `${f.x}%` }}>
          <span className="reaction-emoji">{f.emoji}</span>
          <span className="reaction-name">{f.name}</span>
        </div>
      ))}
    </div>
  )
}
