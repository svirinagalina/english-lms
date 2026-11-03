import { test } from 'node:test'
import assert from 'node:assert/strict'
import { turnTlsHost } from '../src/turn.js'

// The relay over TLS on 443 that a lossy call falls back to (Call.jsx,
// sfuToTcpRef) is found by this name.
test('the relay on 443: srv3 sslip name for an IP, the env name when set', () => {
  assert.equal(turnTlsHost('91.239.6.107', {}), 'turn.91-239-6-107.sslip.io')
  assert.equal(turnTlsHost('91.239.6.107', { TURN_TLS_HOST: 'turn.example.org' }), 'turn.example.org')
  assert.equal(turnTlsHost('turn.example.org', {}), null)
  assert.equal(turnTlsHost(undefined, {}), null)
})
