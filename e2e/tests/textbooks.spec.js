import { test, expect, signIn, seed } from './fixtures.js'
import { prisma } from '../../server/test/helpers.js'

test.afterAll(() => prisma.$disconnect())

// A real PDF of `pages` pages, made larger than one upload piece by a stream
// nobody draws. The cross-reference table is what pdf.js reads first.
function makePdf(pages, padding) {
  const kids = Array.from({ length: pages }, (_, i) => `${i + 3} 0 R`).join(' ')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${kids}] /Count ${pages} >>`,
    ...Array.from({ length: pages }, () => '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] >>'),
    `<< /Length ${padding} >>\nstream\n${'x'.repeat(padding)}\nendstream`
  ]
  let body = '%PDF-1.4\n'
  const offsets = objects.map((object, i) => {
    const offset = body.length
    body += `${i + 1} 0 obj\n${object}\nendobj\n`
    return offset
  })
  const xref = body.length
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(body, 'latin1')
}

// A second of a real tone: 8-bit mono WAV.
function makeWav() {
  const rate = 8000
  const samples = Buffer.from(Array.from({ length: rate }, (_, i) => 128 + Math.round(100 * Math.sin((i * 440 * 2 * Math.PI) / rate))))
  const head = Buffer.alloc(44)
  head.write('RIFF', 0)
  head.writeUInt32LE(36 + samples.length, 4)
  head.write('WAVEfmt ', 8)
  head.writeUInt32LE(16, 16)
  head.writeUInt16LE(1, 20)
  head.writeUInt16LE(1, 22)
  head.writeUInt32LE(rate, 24)
  head.writeUInt32LE(rate, 28)
  head.writeUInt16LE(1, 32)
  head.writeUInt16LE(8, 34)
  head.write('data', 36)
  head.writeUInt32LE(samples.length, 40)
  return Buffer.concat([head, samples])
}

const pdfFile = (name, pages = 3) => ({ name, mimeType: 'application/pdf', buffer: makePdf(pages, 9 * 1024 * 1024) })
const wavFile = (name) => ({ name, mimeType: 'audio/wav', buffer: makeWav() })

async function openTextbooks(page) {
  await signIn(page, 'teacher')
  await page.getByRole('button', { name: /Textbooks/ }).click()
  return page.locator('.panel', { hasText: 'Upload a PDF' })
}

test('a teacher uploads a book larger than one piece, adds audio and listens to it', async ({ page }) => {
  const panel = await openTextbooks(page)
  await panel.locator('input[type=file]').setInputFiles(pdfFile('Big book.pdf'))
  const row = panel.locator('.row', { hasText: 'Big book' })
  await expect(row).toContainText('3 pages')
  await expect(row).toContainText('9 MB')

  await row.getByRole('button', { name: 'Audio' }).click()
  // Chosen in any order, they line up as numbered: 2 before 10.
  await panel.locator('.book-audio input[type=file]').setInputFiles([wavFile('Track 10.wav'), wavFile('Track 2.wav')])
  await expect(panel.locator('.book-track strong')).toHaveText(['Track 2', 'Track 10'])
  await expect(row.getByRole('button', { name: 'Audio (2)' })).toBeVisible()

  const played = await panel.locator('.book-track audio').first().evaluate(async (audio) => {
    audio.muted = true
    await audio.play()
    await new Promise((resolve) => setTimeout(resolve, 300))
    return { duration: audio.duration, time: audio.currentTime }
  })
  expect(played.duration).toBeCloseTo(1, 1)
  expect(played.time).toBeGreaterThan(0)
})

test('the book opens from its row, and is read in ranges', async ({ page }) => {
  const panel = await openTextbooks(page)
  const href = await panel.locator('.row', { hasText: 'Big book' }).getByRole('link', { name: 'Open PDF' }).getAttribute('href')
  const whole = await page.request.get(href)
  expect(whole.status()).toBe(200)
  expect(whole.headers()['content-type']).toBe('application/pdf')
  const part = await page.request.get(href, { headers: { range: 'bytes=0-7' } })
  expect(part.status()).toBe(206)
  expect((await part.body()).toString()).toBe('%PDF-1.4')
})

test('a connection lost in the middle of an upload costs one piece, not the file', async ({ page }) => {
  const panel = await openTextbooks(page)
  let dropped = 0
  await page.route('**/api/textbooks/uploads/*?offset=*', (route) => {
    if (dropped === 0 && !route.request().url().endsWith('offset=0')) { dropped++; return route.abort('connectionreset') }
    return route.continue()
  })
  await panel.locator('input[type=file]').setInputFiles(pdfFile('Bumpy road.pdf'))
  await expect(panel.locator('.row', { hasText: 'Bumpy road' })).toContainText('3 pages', { timeout: 20_000 })
  expect(dropped).toBe(1)
  const book = await prisma.textbook.findFirst({ where: { title: 'Bumpy road' } })
  expect(book.bytes).toBe(pdfFile('x').buffer.length)
})

test('Cancel stops an upload and leaves nothing behind', async ({ page }) => {
  const panel = await openTextbooks(page)
  await page.route('**/api/textbooks/uploads/*?offset=*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    await route.continue().catch(() => {})
  })
  await panel.locator('input[type=file]').setInputFiles(pdfFile('Changed my mind.pdf'))
  await panel.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(panel.getByText('+ Upload a PDF textbook')).toBeVisible()
  await expect.poll(() => prisma.textbook.count({ where: { title: 'Changed my mind' } })).toBe(0)
})

test('a wrong file gets a clear answer before anything is sent', async ({ page }) => {
  const panel = await openTextbooks(page)
  const row = panel.locator('.row', { hasText: 'Big book' })
  await row.getByRole('button', { name: /Audio/ }).click()
  await panel.locator('.book-audio input[type=file]').setInputFiles({ name: 'Tracks.zip', mimeType: 'application/zip', buffer: Buffer.from('PK') })
  await expect(panel.getByText('Unpack the ZIP first')).toBeVisible()
})
