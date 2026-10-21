import { test, expect, signIn } from './fixtures.js'

// Each side has its own preview plus the other person's picture; a picture
// that arrived has a size and is playing.
const remotePictures = (page) => page.evaluate(() =>
  [...document.querySelectorAll('video')].filter((v) => !v.muted && v.videoWidth > 0 && !v.paused).length)

test('a teacher starts a call, a student joins by the link, and they see each other', async ({ browser }) => {
  const media = { permissions: ['camera', 'microphone'] }
  const teacherContext = await browser.newContext(media)
  const studentContext = await browser.newContext(media)
  const errors = []
  try {
    const teacher = await teacherContext.newPage()
    const student = await studentContext.newPage()
    for (const p of [teacher, student]) p.on('pageerror', (e) => errors.push(e.message))

    await signIn(teacher, 'teacher')
    await teacher.getByRole('button', { name: 'Start a call' }).click()
    await teacher.waitForURL(/\/call\//)
    const link = new URL(teacher.url()).pathname
    // No background effect: it loads a model from a CDN, not what this checks.
    await teacher.getByRole('button', { name: 'None' }).click()
    await teacher.getByRole('button', { name: 'Join call' }).click()

    await signIn(student, 'student')
    await student.goto(link)
    await student.getByRole('button', { name: 'None' }).click()
    await student.getByRole('button', { name: 'Join call' }).click()

    // In the call: Leave is a button on the board view and a link on the video view.
    for (const p of [teacher, student]) await expect(p.getByText('Leave', { exact: true }).filter({ visible: true }).first()).toBeVisible()
    await expect.poll(() => remotePictures(teacher), { message: "the teacher doesn't see the student", timeout: 20_000 }).toBeGreaterThan(0)
    await expect.poll(() => remotePictures(student), { message: "the student doesn't see the teacher", timeout: 20_000 }).toBeGreaterThan(0)
    await expect(teacher.getByText('student', { exact: true })).toBeVisible()
    await expect(student.getByText('teacher', { exact: true })).toBeVisible()
  } finally {
    await teacherContext.close()
    await studentContext.close()
  }
  expect(errors, 'uncaught errors on the call pages').toEqual([])
})
