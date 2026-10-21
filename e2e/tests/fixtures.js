// Shared for every browser check: who is who in the seeded school, signing in
// through the real form, and failing a test on any uncaught page error — the
// kind that leaves a white page.
import { readFileSync } from 'node:fs'
import { test as base, expect } from '@playwright/test'

export const seed = JSON.parse(readFileSync(new URL('../.seed.json', import.meta.url), 'utf8'))

export const test = base.extend({
  page: async ({ page }, use) => {
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await use(page)
    expect(errors, 'uncaught errors on the page').toEqual([])
  }
})

// Sign-in goes through the real form once per person; later tests reuse the
// session cookie — the server allows only 30 sign-ins per 10 minutes per address.
const sessions = new Map()

export async function signInWithForm(page, who) {
  await page.goto('/login')
  await page.getByPlaceholder('Почта или логин').fill(seed.people[who].email)
  await page.getByPlaceholder('Пароль').fill(seed.password)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page).not.toHaveURL(/\/login/)
  sessions.set(who, await page.context().cookies())
}

export async function signIn(page, who) {
  if (!sessions.has(who)) return signInWithForm(page, who)
  await page.context().addCookies(sessions.get(who))
  await page.goto('/')
  await expect(page).not.toHaveURL(/\/login/)
}

export { expect }
