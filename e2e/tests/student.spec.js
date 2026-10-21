import { test, expect, signIn, seed } from './fixtures.js'

// Dark pixels on the board canvas: the teacher's seeded text is drawn in near-black
// on a light, dotted background — a blank or broken board has none.
const inkOnBoard = (page) => page.locator('canvas').first().evaluate((canvas) => {
  const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height)
  let dark = 0
  for (let i = 0; i < data.length; i += 4) if (data[i] < 80 && data[i + 1] < 80 && data[i + 2] < 80 && data[i + 3] > 200) dark++
  return dark
})

test("a student opens their board and sees the teacher's material", async ({ page }) => {
  await signIn(page, 'student')
  await page.goto(`/classroom/${seed.rooms.student}`)
  await page.getByRole('button', { name: 'Open' }).click()
  await expect(page.getByRole('button', { name: 'Pen' })).toBeVisible()
  await expect.poll(() => inkOnBoard(page), { message: 'the board shows no text' }).toBeGreaterThan(200)
})

test('a correct translation is marked correct', async ({ page }) => {
  await signIn(page, 'student')
  await page.goto(`/practice/${seed.unitId}`)
  await page.getByPlaceholder(/Translate into English/).fill('He works.')
  await page.getByRole('button', { name: 'Check' }).click()
  await expect(page.getByText('Correct', { exact: true })).toBeVisible()
  await expect(page.getByText(/correct 1, mistakes 0/)).toBeVisible()
})

test('a wrong translation is not accepted and counts as a mistake', async ({ page }) => {
  await signIn(page, 'student')
  await page.goto(`/practice/${seed.unit2Id}`)
  await page.getByPlaceholder(/Translate into English/).fill('I has cat.')
  await page.getByRole('button', { name: 'Check' }).click()
  await expect(page.getByText(/correct 0, mistakes 1/)).toBeVisible()
  await expect(page.getByText('Correct', { exact: true })).toHaveCount(0)
})

test('studying a word set shows a card and reveals the word on click', async ({ page }) => {
  await signIn(page, 'student')
  await page.goto(`/vocabulary/${seed.wordSetId}`)
  await expect(page.getByText('2 words')).toBeVisible()
  await page.getByRole('button', { name: 'Study' }).click()
  await expect(page.getByText(/1 of 2/)).toBeVisible()
  const card = page.getByText('click to reveal')
  await card.click()
  await expect(page.getByText(/^(cat|dog)$/).first()).toBeVisible()
})

// Galina, 2026-10-21: on the board a student may change anything, the
// teacher's material included; Ctrl+Z (⌘Z) takes their last action back.
test("a student erases the teacher's text and Ctrl+Z brings it back", async ({ page }) => {
  const { prisma } = await import('../../server/test/helpers.js')
  const saved = async () => (await prisma.board.findUnique({ where: { id: seed.boardId }, select: { elements: true } })).elements.some((e) => e.id === 'hello')
  try {
    await signIn(page, 'student')
    await page.goto(`/classroom/${seed.rooms.student}`)
    await page.getByRole('button', { name: 'Open' }).click()
    await expect.poll(() => inkOnBoard(page)).toBeGreaterThan(200)
    await page.getByRole('button', { name: 'Erase', exact: true }).click()
    // The seeded text is drawn in the middle of the opened board.
    await page.locator('canvas').first().click({ position: { x: 640, y: 355 } })
    await expect.poll(() => inkOnBoard(page), { message: 'the text was not erased' }).toBeLessThan(50)
    await expect.poll(saved, { message: 'the erase was not saved', timeout: 10_000 }).toBe(false)

    await page.keyboard.press('Control+z')
    await expect.poll(() => inkOnBoard(page), { message: 'Ctrl+Z did not bring the text back' }).toBeGreaterThan(200)
    await expect.poll(saved, { message: 'the undo was not saved', timeout: 10_000 }).toBe(true)
  } finally {
    await prisma.$disconnect()
  }
})
