// Browser checks: the real server on the throwaway english_lms_test database
// (global-setup.js) and the production build of the client served by
// `vite preview`, which proxies /api and /socket.io to that server.
// Locally: `npm run build` in client/ first, then `npm ci && npx playwright install
// chromium` once and `npm test` here.
import { defineConfig, devices } from '@playwright/test'

// A database of their own, so the server's API tests (english_lms_test) can run
// at the same time without wiping it. CI passes TEST_DATABASE_URL itself.
process.env.TEST_DATABASE_URL ??= `postgresql://${process.env.USER ?? 'postgres'}@localhost:5432/english_lms_e2e_test`

export const API_PORT = 4310
export const WEB_PORT = 4311

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.js',
  // One database for every test: run them one after another.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    locale: 'ru-RU',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Calls: a fake camera and microphone, permission granted without a prompt.
        launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
        permissions: ['camera', 'microphone']
      }
    }
  ],
  webServer: {
    command: `npm --prefix ../client run preview -- --port ${WEB_PORT} --strictPort`,
    env: { API_PORT: String(API_PORT) },
    url: `http://localhost:${WEB_PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000
  }
})
