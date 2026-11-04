// Galina, 2026-11-04: moving around the board is personal. Nobody's panning
// shows on anyone else's screen; "Spotlight me" brings people over once.
import { test, expect, seed, signIn } from './fixtures.js'

// Where the board's text sits on this screen: the middle of its dark pixels.
const inkX = (page) => page.locator('canvas').first().evaluate((canvas) => {
  const { width, height } = canvas
  const { data } = canvas.getContext('2d').getImageData(0, 0, width, height)
  let sum = 0
  let dark = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 128 && data[i] < 90 && data[i + 1] < 90 && data[i + 2] < 90) {
      sum += (i / 4) % width
      dark += 1
    }
  }
  return dark ? Math.round(sum / dark / (window.devicePixelRatio || 1)) : null
})

const openBoard = async (page, who) => {
  await signIn(page, who)
  await page.goto(`/classroom/${seed.rooms.student}`)
  await page.getByRole('button', { name: 'Open' }).click()
  await expect.poll(() => inkX(page), { message: 'the board shows no text' }).not.toBeNull()
}

const pan = async (page, dx) => {
  await page.keyboard.press('h')
  await page.mouse.move(600, 520)
  await page.mouse.down()
  await page.mouse.move(600 + dx, 520, { steps: 6 })
  await page.mouse.up()
}

test('each person moves their own board; Spotlight brings people over once', async ({ page, browser, baseURL }) => {
  test.setTimeout(60_000)
  const context = await browser.newContext({ baseURL, viewport: page.viewportSize() })
  const student = await context.newPage()
  try {
    await openBoard(page, 'teacher')
    await openBoard(student, 'student')
    const start = await inkX(student)

    // The teacher moves: only the teacher's screen changes.
    await pan(page, 200)
    await expect.poll(() => inkX(page)).toBeGreaterThan(start + 150)
    await student.waitForTimeout(1000)
    expect(await inkX(student), "the teacher's panning moved the student's board").toBe(start)

    // Spotlight: the student is brought to the teacher's view, once.
    await page.getByRole('button', { name: 'Spotlight me' }).click()
    await expect.poll(() => inkX(student), { message: 'Spotlight did not bring the student over' }).toBeGreaterThan(start + 150)
    const shown = await inkX(student)

    // Spotlight still on, the teacher moves on: the student stays.
    await pan(page, 150)
    await expect.poll(() => inkX(page)).toBeGreaterThan(shown + 100)
    await student.waitForTimeout(1000)
    expect(await inkX(student), 'the board followed the teacher after Spotlight').toBe(shown)

    // The student moves: the teacher stays, and nothing pulls the student back.
    const teacherAt = await inkX(page)
    await pan(student, -200)
    await expect.poll(() => inkX(student)).toBeLessThan(shown - 150)
    const moved = await inkX(student)
    await student.waitForTimeout(7500)
    expect(await inkX(student), 'the student was pulled back').toBe(moved)
    expect(await inkX(page), "the student's panning moved the teacher's board").toBe(teacherAt)
  } finally {
    await context.close()
  }
})
