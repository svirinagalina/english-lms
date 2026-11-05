import { test, expect, signIn } from './fixtures.js'

test('a teacher runs a poll, a student on a phone votes, and both see the result', async ({ browser }) => {
  const media = { permissions: ['camera', 'microphone'] }
  const teacherContext = await browser.newContext(media)
  const studentContext = await browser.newContext({ ...media, viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true })
  const errors = []
  try {
    const teacher = await teacherContext.newPage()
    const student = await studentContext.newPage()
    for (const p of [teacher, student]) p.on('pageerror', (e) => errors.push(e.message))

    await signIn(teacher, 'teacher')
    await teacher.getByRole('button', { name: 'Start a call' }).click()
    await teacher.waitForURL(/\/call\//)
    const link = new URL(teacher.url()).pathname
    await teacher.getByRole('button', { name: 'None' }).click()
    await teacher.getByRole('button', { name: 'Join call' }).click()

    await signIn(student, 'student')
    await student.goto(link)
    await student.getByRole('button', { name: 'None' }).click()
    await student.getByRole('button', { name: 'Join call' }).click()
    await expect(student.getByText('Leave', { exact: true }).filter({ visible: true }).first()).toBeVisible()

    // A student has no way to start one.
    await expect(student.getByRole('button', { name: 'Poll', exact: true })).toHaveCount(0)

    await teacher.getByRole('button', { name: 'Poll', exact: true }).click()
    const start = teacher.getByRole('button', { name: 'Start poll' })
    await teacher.getByLabel('Question').fill('Homework on Friday?')
    await teacher.getByLabel('Option 1', { exact: true }).fill('Yes')
    await expect(start).toBeDisabled()
    await teacher.getByLabel('Option 2', { exact: true }).fill('No')
    await start.click()

    await expect(teacher.getByText('Voted: 0')).toBeVisible()
    await expect(student.getByText('Homework on Friday?')).toBeVisible()
    await student.getByText('No', { exact: true }).click()
    await student.getByRole('button', { name: 'Vote' }).click()
    await expect(student.getByText(/your vote is in: No/)).toBeVisible()
    await expect(teacher.getByText('Voted: 1')).toBeVisible()
    // The split stays hidden while the poll is open.
    await expect(teacher.locator('.poll-card').getByText('%')).toHaveCount(0)

    // A reload is a new connection: the vote is remembered, not repeated.
    await student.reload()
    await student.getByRole('button', { name: 'None' }).click()
    await student.getByRole('button', { name: 'Join call' }).click()
    await expect(student.getByText(/your vote is in/)).toBeVisible()
    await expect(student.getByRole('button', { name: 'Vote' })).toHaveCount(0)

    await teacher.getByRole('button', { name: 'End poll and show results' }).click()
    for (const p of [teacher, student]) {
      await expect(p.getByText('1 · 100%')).toBeVisible()
      await expect(p.getByText('0 · 0%')).toBeVisible()
      await expect(p.getByText('1 vote', { exact: true })).toBeVisible()
    }

    // The teacher's close takes it off everyone's screen.
    await teacher.getByRole('button', { name: 'Close' }).click()
    for (const p of [teacher, student]) await expect(p.getByText('1 · 100%')).toHaveCount(0)
  } finally {
    await teacherContext.close()
    await studentContext.close()
  }
  expect(errors, 'uncaught errors on the call pages').toEqual([])
})
