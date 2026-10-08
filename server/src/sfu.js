import jwt from 'jsonwebtoken'
import { sfuSwitchedOn } from './settings.js'

// The media server (LiveKit, srv3-livekit): with it everyone in a call sends
// once to the server, which forwards to the others and recovers lost packets
// — instead of each person sending to each other person directly. Used when
// the server is configured (LIVEKIT_URL/_API_KEY/_API_SECRET) and the owner
// switched it on in Settings. The browser joins the LiveKit room named after
// the call with its socket id as identity, so tracks map onto the socket
// peers the call already knows.
export const sfuConfigured = () => Boolean(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET)
export const sfuEnabled = () => sfuConfigured() && sfuSwitchedOn()

export function sfuJoin({ room, identity, name }) {
  const token = jwt.sign(
    { name, video: { room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: false } },
    process.env.LIVEKIT_API_SECRET,
    { issuer: process.env.LIVEKIT_API_KEY, subject: identity, jwtid: identity, expiresIn: '8h' }
  )
  return { url: process.env.LIVEKIT_URL, token }
}

// Takes one connection out of the media server room. The browser's media
// link to LiveKit lives apart from its socket: a laptop whose socket dropped
// (or that was replaced by the same student on another device) could stay in
// the room as a second, frozen copy of that person. Best effort — LiveKit
// answers "not found" for someone already gone.
export async function sfuKick(room, identity) {
  if (!sfuConfigured() || !room || !identity) return
  const token = jwt.sign(
    { video: { room, roomAdmin: true } },
    process.env.LIVEKIT_API_SECRET,
    { issuer: process.env.LIVEKIT_API_KEY, expiresIn: '1m' }
  )
  const base = (process.env.LIVEKIT_API_URL || process.env.LIVEKIT_URL).replace(/^ws/, 'http').replace(/\/$/, '')
  try {
    await fetch(`${base}/twirp/livekit.RoomService/RemoveParticipant`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ room, identity }),
      signal: AbortSignal.timeout(5000)
    })
  } catch {}
}
