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
