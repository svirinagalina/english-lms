import { createHmac } from 'crypto'

// The relay in Germany for people whose sound gets lost on the way from
// srv3 (2026-11-03): srv3 reaches Deutsche Telekom only through Cogent, and
// that link drops 12–13% of everything in the evening on average (RIPE Atlas
// anchors, a week of data; Lubov lost up to half of her incoming sound),
// while Hetzner → Telekom stays at 0%. Its coturn relays only to the media
// server (deploy/relay-de). RELAY_TURN_HOST and RELAY_TURN_SECRET in the app
// env switch it on; the credentials are the short-lived HMAC scheme coturn
// understands, as for the main relay in routes/calls.js.
export function relayIceServer(env = process.env, now = Date.now()) {
  const host = env.RELAY_TURN_HOST
  const secret = env.RELAY_TURN_SECRET
  if (!host || !secret) return null
  const username = `${Math.floor(now / 1000) + 6 * 3600}:lms`
  const credential = createHmac('sha1', secret).update(username).digest('base64')
  return { urls: [`turn:${host}:3478?transport=udp`], username, credential }
}
