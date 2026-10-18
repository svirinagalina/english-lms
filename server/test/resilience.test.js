// Outside services failing, and saves that fail: nothing may be lost or hammered.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { guardedFetch, breakerStatus } from '../src/resilience.js'
import { debouncedSaver } from '../src/saver.js'
import http from 'node:http'

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

test('a service answering 500 opens its breaker; the caller still gets the response', async () => {
  let hits = 0
  const server = http.createServer((req, res) => { hits++; res.statusCode = 500; res.end('down') }).listen(0)
  const url = `http://127.0.0.1:${server.address().port}/`
  try {
    for (let i = 0; i < 5; i++) {
      const res = await guardedFetch('test-500', url, { method: 'POST' })
      assert.equal(res.status, 500)
    }
    assert.equal(breakerStatus().find((b) => b.name === 'test-500').open, true)
    const before = hits
    await assert.rejects(guardedFetch('test-500', url, { method: 'POST' }), (e) => e.circuitOpen === true)
    assert.equal(hits, before, 'an open breaker must not call the service')
  } finally {
    server.close()
  }
})

test('a 4xx answer does not count against the service', async () => {
  const server = http.createServer((req, res) => { res.statusCode = 404; res.end() }).listen(0)
  const url = `http://127.0.0.1:${server.address().port}/`
  try {
    for (let i = 0; i < 8; i++) assert.equal((await guardedFetch('test-404', url)).status, 404)
    assert.equal(breakerStatus().find((b) => b.name === 'test-404').open, false)
  } finally {
    server.close()
  }
})

test('a failed save is retried until it goes through', async () => {
  let calls = 0
  const saved = []
  const saver = debouncedSaver('test', async (id) => {
    calls++
    if (calls <= 2) throw new Error('database away')
    saved.push(id)
  }, 10, { retryBaseMs: 20 })
  const log = console.error
  console.error = () => {}
  try {
    saver.schedule('board-1')
    await wait(400)
  } finally {
    console.error = log
  }
  assert.equal(calls, 3)
  assert.deepEqual(saved, ['board-1'])
  assert.equal(saver.failing(), 0)
})

test('edits in quick succession are written once', async () => {
  let calls = 0
  const saver = debouncedSaver('test', async () => { calls++ }, 30)
  for (let i = 0; i < 5; i++) { saver.schedule('doc-1'); await wait(5) }
  await wait(100)
  assert.equal(calls, 1)
})

test('flush writes what is waiting and waits for writes on their way', async () => {
  const written = []
  const saver = debouncedSaver('test', async (id) => { await wait(30); written.push(id) }, 10_000)
  saver.schedule('a')
  saver.schedule('b')
  await saver.flush()
  assert.deepEqual(written.sort(), ['a', 'b'])
})

test('a deleted record is dropped, not retried', async () => {
  let calls = 0
  const saver = debouncedSaver('test', async () => { calls++; throw Object.assign(new Error('gone'), { code: 'P2025' }) }, 10, { retryBaseMs: 10 })
  saver.schedule('x')
  await wait(150)
  assert.equal(calls, 1)
  assert.equal(saver.failing(), 0)
})
