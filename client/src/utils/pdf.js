// PDF pages as pictures, rendered in the browser with pdf.js. A textbook is
// opened once per session and its pages drawn on demand.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

// pdf.js is half a megabyte: it loads the first time a textbook is touched.
let libPromise = null
function lib() {
  if (!libPromise) {
    libPromise = import('pdfjs-dist').then((pdfjs) => { pdfjs.GlobalWorkerOptions.workerSrc = workerUrl; return pdfjs })
  }
  return libPromise
}

const open = new Map() // url → Promise<PDFDocumentProxy>

export function openPdf(url) {
  if (!open.has(url)) {
    open.set(url, lib().then((pdfjs) => pdfjs.getDocument({ url, withCredentials: true }).promise).catch((err) => { open.delete(url); throw err }))
  }
  return open.get(url)
}

export async function pdfPageCount(source) {
  const pdfjs = await lib()
  const doc = await (source instanceof ArrayBuffer ? pdfjs.getDocument({ data: source }).promise : openPdf(source))
  return doc.numPages
}

// A page as a JPEG data URL, `width` pixels wide (a board page at ~1400 px
// stays readable when zoomed in; thumbnails at ~160).
export async function renderPdfPage(url, pageNumber, width = 1400, quality = 0.85) {
  const doc = await openPdf(url)
  const page = await doc.getPage(pageNumber)
  const base = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({ scale: width / base.width })
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(viewport.width)
  canvas.height = Math.round(viewport.height)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, viewport }).promise
  return canvas.toDataURL('image/jpeg', quality)
}
