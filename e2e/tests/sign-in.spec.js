import { test, expect, signIn, seed } from './fixtures.js'

test('a wrong password is refused with a message, and nobody is signed in', async ({ page }) => {
  await page.goto('/login')
  await page.getByPlaceholder('Почта или логин').fill(seed.people.student.email)
  await page.getByPlaceholder('Пароль').fill('not-the-password')
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page.locator('.error')).toBeVisible()
  await expect(page).toHaveURL(/\/login/)
})

test("a student lands on their home: board, homework, practice, vocabulary, mistakes", async ({ page }) => {
  await signIn(page, 'student')
  for (const tile of ['My board', 'Train your grammar', 'Learn and revise new words', 'Get rid of mistakes']) {
    await expect(page.getByText(tile)).toBeVisible()
  }
  await expect(page.getByText('My teachers')).toBeVisible()
})

test('a teacher lands on their classroom with their students and boards', async ({ page }) => {
  await signIn(page, 'teacher')
  await expect(page.getByText('My students')).toBeVisible()
  await expect(page.getByText('My boards')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start a call' })).toBeVisible()
})

test("a student is sent away from the owner's Settings", async ({ page }) => {
  await signIn(page, 'student')
  await page.goto('/settings')
  await expect(page).not.toHaveURL(/\/settings/)
})

test('a page opened signed out asks to sign in', async ({ page }) => {
  await page.goto(`/classroom/${seed.rooms.student}`)
  await expect(page).toHaveURL(/\/login/)
})

test('after signing in, a link back into the site is followed', async ({ page }) => {
  await page.goto('/login?next=/vocabulary')
  await page.getByPlaceholder('Почта или логин').fill(seed.people.student2.email)
  await page.getByPlaceholder('Пароль').fill(seed.password)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page).toHaveURL(/\/vocabulary$/)
})

test('after signing in, a link off the site is not followed', async ({ page }) => {
  await page.context().clearCookies()
  for (const next of ['//example.com', '/\\example.com', '/\\/example.com']) {
    await page.goto(`/login?next=${encodeURIComponent(next)}`)
    if (await page.getByPlaceholder('Пароль').isVisible()) {
      await page.getByPlaceholder('Почта или логин').fill(seed.people.free.email)
      await page.getByPlaceholder('Пароль').fill(seed.password)
      await page.getByRole('button', { name: 'Войти' }).click()
    }
    await page.waitForLoadState('networkidle')
    expect(new URL(page.url()).hostname, next).toBe('localhost')
  }
})
