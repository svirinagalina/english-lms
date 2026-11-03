import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'crypto'
import { relayIceServer } from '../src/turn.js'

// The relay in Germany that a call with heavy incoming loss switches to
// (Call.jsx, sfuRelaySwitchRef): off until both settings are there.
test('the loss relay: none without its host and secret', () => {
  assert.equal(relayIceServer({}), null)
  assert.equal(relayIceServer({ RELAY_TURN_HOST: 'relay.example.org' }), null)
  assert.equal(relayIceServer({ RELAY_TURN_SECRET: 's3cret' }), null)
})

test('the loss relay: UDP only, credentials coturn accepts for 6 hours', () => {
  const now = Date.UTC(2026, 10, 3, 20, 0, 0)
  const relay = relayIceServer({ RELAY_TURN_HOST: 'relay.example.org', RELAY_TURN_SECRET: 's3cret' }, now)
  assert.deepEqual(relay.urls, ['turn:relay.example.org:3478?transport=udp'])
  const [expiry] = relay.username.split(':')
  assert.equal(Number(expiry), now / 1000 + 6 * 3600)
  assert.equal(relay.credential, createHmac('sha1', 's3cret').update(relay.username).digest('base64'))
})
