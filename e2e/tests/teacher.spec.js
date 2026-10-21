import { test, expect, signIn, seed } from './fixtures.js'
import { prisma } from '../../server/test/helpers.js'

test.afterAll(() => prisma.$disconnect())

const boardTexts = async () => {
  const board = await prisma.board.findUnique({ where: { id: seed.boardId }, select: { elements: true } })
  return board.elements.filter((e) => typeof e.text === 'string').map((e) => e.text).join('\n')
}

test("a teacher finds their student and opens the student's cabinet", async ({ page }) => {
  await signIn(page, 'teacher')
  await page.getByText('My students').click()
  await page.locator(`a[href="/classroom/${seed.rooms.student}"]`).first().click()
  await expect(page).toHaveURL(new RegExp(`/classroom/${seed.rooms.student}`))
  await expect(page.getByText('Lessons and payment')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open' })).toBeVisible()
})

test('what a teacher writes on the board is saved', async ({ page }) => {
  await signIn(page, 'teacher')
  await page.goto(`/classroom/${seed.rooms.student}`)
  await page.getByRole('button', { name: 'Open' }).click()
  await page.getByRole('button', { name: 'Text', exact: true }).click()
  await page.locator('canvas').first().click({ position: { x: 640, y: 480 } })
  await page.keyboard.type('Homework: page 5')
  // Clicking elsewhere on the board finishes the text.
  await page.getByRole('button', { name: 'Move', exact: true }).click()
  await page.locator('canvas').first().click({ position: { x: 200, y: 600 } })
  await expect.poll(boardTexts, { message: 'the text never reached the database', timeout: 15_000 }).toContain('Homework: page 5')
})

test("Payments lists the teacher's own student with the lessons held", async ({ page }) => {
  await signIn(page, 'teacher')
  await page.goto('/billing')
  await expect(page.getByText(seed.people.student.email)).toBeVisible()
  await expect(page.getByText(/lessons (held|used)/)).toBeVisible()
  await expect(page.getByText(seed.people.student2.email)).toHaveCount(0)
})

test('People is for the administrators: a teacher who opens it by address is sent home', async ({ page }) => {
  await signIn(page, 'teacher')
  await page.goto('/people')
  await expect(page).not.toHaveURL(/\/people/)
  await expect(page.getByText('Not allowed')).toHaveCount(0)
})

// Files in the uploads open for people signed in to the platform only (2026-10-21).
test("a picture the teacher put on the board opens for the student, not for a stranger", async ({ page, browser }) => {
  const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  await signIn(page, 'teacher')
  const upload = await page.request.post(`/api/classrooms/${seed.rooms.student}/boards/${seed.boardId}/images`, { data: { data: pixel } })
  expect(upload.status()).toBe(201)
  const { src } = await upload.json()

  const student = await browser.newContext()
  const stranger = await browser.newContext()
  try {
    const studentPage = await student.newPage()
    await signIn(studentPage, 'student')
    const seen = await studentPage.request.get(src)
    expect(seen.status()).toBe(200)
    expect(seen.headers()['content-type']).toMatch(/image\/png/)
    expect((await stranger.request.get(new URL(src, page.url()).href)).status()).toBe(404)
  } finally {
    await student.close()
    await stranger.close()
  }
})
