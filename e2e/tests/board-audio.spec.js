// Galina, 2026-11-20: she pressed play on a Drive track on the board and the
// student heard nothing — the card played only on her own computer. Now the
// teacher's play and pause reach everyone with the board open; a student's own
// presses stay on the student's device.
import { createRequire } from 'node:module'
import { test, expect, seed, signIn } from './fixtures.js'
import { API_PORT } from '../playwright.config.js'

const { io } = createRequire(new URL('../../server/package.json', import.meta.url))('socket.io-client')

// 20 seconds of quiet, 8 kHz mono 8-bit: enough for a player to run.
function wav(seconds = 20, rate = 8000) {
  const n = seconds * rate
  const b = Buffer.alloc(44 + n, 128)
  b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVE', 8); b.write('fmt ', 12)
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24)
  b.writeUInt32LE(rate, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write('data', 36); b.writeUInt32LE(n, 40)
  return b
}
const SRC = `/uploads/${seed.boardId.toLowerCase()}/e2etrack.wav`
const serveTrack = (page) => page.route('**/uploads/**/e2etrack.wav', (route) => route.fulfill({ status: 200, contentType: 'audio/wav', body: wav() }))

const openBoard = async (page, who) => {
  await serveTrack(page)
  await signIn(page, who)
  await page.goto(`/classroom/${seed.rooms.student}`)
  await page.getByRole('button', { name: 'Open' }).click()
  await expect(page.locator('.board-audio .audio-play')).toBeEnabled()
}
const playing = (page) => page.locator('.board-audio audio').evaluate((a) => !a.paused && a.currentTime > 0)

test("the teacher's play on an audio card plays for the student", async ({ page, browser, baseURL }) => {
  test.setTimeout(60_000)
  // The card, put on the board the way the Drive picker does.
  await signIn(page, 'teacher')
  const cookie = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ')
  const socket = io(`http://localhost:${API_PORT}`, { transports: ['websocket'], extraHeaders: { cookie } })
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject) })
  await new Promise((resolve) => socket.emit('board:open', seed.boardId, {}, resolve))
  socket.emit('board:add', { id: 'e2e-track', type: 'audio', color: '#000000', width: 1, x: 120, y: 220, w: 360, h: 112, src: SRC, name: 'SO_U07_R03.wav' })
  await new Promise((resolve) => setTimeout(resolve, 500))

  const context = await browser.newContext({ baseURL, viewport: page.viewportSize() })
  const student = await context.newPage()
  try {
    await openBoard(page, 'teacher')
    await openBoard(student, 'student')

    await page.locator('.board-audio .audio-play').click()
    await expect.poll(() => playing(page)).toBe(true)
    await expect.poll(() => playing(student), { message: "the teacher's play did not reach the student" }).toBe(true)

    await page.locator('.board-audio .audio-play').click()
    await expect.poll(() => playing(student), { message: "the teacher's pause did not reach the student" }).toBe(false)

    // The student's own play is theirs alone.
    await student.locator('.board-audio .audio-play').click()
    await expect.poll(() => playing(student)).toBe(true)
    await page.waitForTimeout(1000)
    expect(await playing(page), "the student's play started the teacher's player").toBe(false)
  } finally {
    await context.close()
    // The other checks use this board too.
    socket.emit('board:delete', 'e2e-track')
    await new Promise((resolve) => setTimeout(resolve, 500))
    socket.close()
  }
})
