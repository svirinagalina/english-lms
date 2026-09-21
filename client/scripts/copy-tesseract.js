// Copies the Tesseract.js OCR runtime next to the app, so board image-text
// recognition never depends on jsdelivr (same reasoning as copy-mediapipe.js
// for the blur model). The English trained-data file is committed in
// public/tesseract/lang-data (there is no npm package for it to copy from).
import { cpSync, mkdirSync } from 'fs'

const root = new URL('../node_modules/', import.meta.url).pathname

mkdirSync(new URL('../public/tesseract/', import.meta.url).pathname, { recursive: true })

cpSync(`${root}tesseract.js/dist/worker.min.js`, new URL('../public/tesseract/worker.min.js', import.meta.url).pathname)

const coreDir = new URL('../public/tesseract/core/', import.meta.url).pathname
mkdirSync(coreDir, { recursive: true })
// Both the SIMD and plain LSTM-only builds — the worker picks at runtime
// based on the browser's WebAssembly SIMD support.
for (const name of ['tesseract-core-lstm.js', 'tesseract-core-lstm.wasm', 'tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.js', 'tesseract-core-simd-lstm.wasm', 'tesseract-core-simd-lstm.wasm.js']) {
  cpSync(`${root}tesseract.js-core/${name}`, coreDir + name)
}
