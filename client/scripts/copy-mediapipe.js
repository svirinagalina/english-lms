// Copies the MediaPipe vision runtime next to the app, so the blur never
// depends on a CDN that a browser or ad blocker may refuse. The model
// itself (selfie_segmenter.tflite) is committed in public/mediapipe.
import { cpSync, mkdirSync } from 'fs'

const from = new URL('../node_modules/@mediapipe/tasks-vision/wasm/', import.meta.url).pathname
const to = new URL('../public/mediapipe/wasm/', import.meta.url).pathname
mkdirSync(to, { recursive: true })
cpSync(from, to, { recursive: true })
