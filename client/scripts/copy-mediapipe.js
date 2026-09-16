// Copies the MediaPipe segmentation runtime and model next to the app, so
// the blur never depends on a CDN that a browser or ad blocker may refuse.
import { cpSync, mkdirSync, readdirSync } from 'fs'
import { join } from 'path'

const from = new URL('../node_modules/@mediapipe/selfie_segmentation/', import.meta.url).pathname
const to = new URL('../public/mediapipe/', import.meta.url).pathname
mkdirSync(to, { recursive: true })
for (const file of readdirSync(from)) {
  if (/\.(tflite|binarypb|wasm|data)$/.test(file) || /_wasm_bin\.js$/.test(file)) cpSync(join(from, file), join(to, file))
}
