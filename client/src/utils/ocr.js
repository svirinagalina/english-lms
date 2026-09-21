// OCR for images pasted onto the board (screenshots, photos of a page), so
// the same hover-dictionary / "add to vocabulary" flow as a text element can
// work on a word that only exists as pixels. Runs fully client-side via
// Tesseract.js, self-hosted under public/tesseract (no CDN, no per-lookup
// cost) — see scripts/copy-tesseract.js.
import { createWorker } from 'tesseract.js'

let workerPromise = null
function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker('eng', 1, {
      workerPath: '/tesseract/worker.min.js',
      corePath: '/tesseract/core/',
      langPath: '/tesseract/lang-data/'
    })
  }
  return workerPromise
}

// Low-confidence words are mostly background noise (icons, photos) rather
// than a bad read of real text, so they're dropped rather than shown wrong.
const MIN_CONFIDENCE = 45

// src -> [{ text, x0, y0, x1, y1 }] in the image's own natural pixel
// coordinates, once recognition finishes. One recognition per image, ever,
// however many times (and however many boards) it's hovered or clicked.
const resolved = new Map()
const inFlight = new Map()

function recognize(src) {
  if (!inFlight.has(src)) {
    inFlight.set(src, getWorker()
      .then((worker) => worker.recognize(src))
      .then(({ data }) => (data.words ?? [])
        .filter((w) => w.text?.trim() && w.confidence >= MIN_CONFIDENCE)
        .map((w) => ({ text: w.text, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 })))
      .then((words) => { resolved.set(src, words); return words })
      .catch((err) => { inFlight.delete(src); throw err }))
  }
  return inFlight.get(src)
}

// Synchronous read: the words if recognition has already finished, else
// null — and, the first time a src is asked about, starts recognizing it.
export function ocrWords(src) {
  if (resolved.has(src)) return resolved.get(src)
  recognize(src).catch(() => {})
  return null
}

// Resolves once recognition for this src finishes (immediately if it
// already has). Used to re-run a hover check for a pointer that hasn't
// moved since OCR started, since nothing else would trigger that recheck.
export function whenOcrReady(src) {
  return resolved.has(src) ? Promise.resolve(resolved.get(src)) : recognize(src)
}
