// The background blur's person segmentation, off the page's own thread.
// The model takes 15–40 ms a frame on an ordinary computer and seconds on a
// slow one; run on the page it held up everything else there — the board,
// sound and the other people's video (2026-11 diag: 6 of 15 fps on
// computers where one frame took ~25 ms). Here it only holds up itself.
//
// Messages in:  { type: 'init', wasm: [urls…], model, delegate }
//               { type: 'frame', bitmap, timestamp, easing }
// Messages out: { type: 'ready', delegate } | { type: 'failed', message }
//               { type: 'mask', alpha (ArrayBuffer, transferred), width, height, delegate, ms, mean, max }
//               { type: 'skipped' } — a frame that gave no mask
import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision'

// tasks-vision loads its wasm loader (a classic script that sets a global
// ModuleFactory) with importScripts, which a module worker lacks; it then
// calls self.import if there is one, else import() — which runs the script
// in module scope, where the global is never set ("ModuleFactory not set").
// Run it in the worker's global scope instead, each time it is asked for
// (tasks-vision clears ModuleFactory after every model it creates).
self.import = async (url) => {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`loader ${response.status}`)
  const code = await response.text()
  // Indirect eval: global scope, like importScripts would have done.
  ;(0, eval)(`${code}\n//# sourceURL=${url}`)
}

let segmenter = null
let vision = null
let model = null
let delegate = null
let switching = false
let maskStats = []
let prevMask = null

const withTimeout = (promise, ms) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))])

async function create(d) {
  const options = (x) => ({
    baseOptions: { modelAssetPath: model, delegate: x },
    runningMode: 'VIDEO',
    outputCategoryMask: false,
    outputConfidenceMasks: true
  })
  try {
    segmenter = await ImageSegmenter.createFromOptions(vision, options(d))
    delegate = d
  } catch {
    segmenter = await ImageSegmenter.createFromOptions(vision, options('CPU'))
    delegate = 'CPU'
  }
}

// Same check as on the page: a mask that never varies over the first frames
// (all person, or no person anywhere) means the GPU path is broken here —
// switch to the CPU once. "No person" is judged by the strongest pixel, NaN
// counted as 0: a mask of faint noise or NaN slipped past the old
// mean < 0.015 test. Returns the frame's { mean, max } for the diag.
function checkMask(values) {
  let sum = 0, max = 0, n = 0
  for (let i = 0; i < values.length; i += 7) {
    const v = Number.isFinite(values[i]) ? values[i] : 0
    sum += v; n++
    if (v > max) max = v
  }
  const stat = { mean: sum / n, max }
  if (switching) return stat
  maskStats.push(stat)
  if (maskStats.length < 30) return stat
  if (delegate !== 'GPU') { maskStats = []; return stat }
  const flat = maskStats.every((m) => m.mean > 0.985) || maskStats.every((m) => m.max < 0.5)
  maskStats = []
  if (!flat) { delegate = 'GPU-ok'; return stat }
  switching = true
  const old = segmenter
  create('CPU').then(() => old?.close?.()).finally(() => { switching = false })
  return stat
}

async function init({ wasm, model: modelUrl, delegate: wanted }) {
  model = modelUrl
  let lastError = null
  for (const url of wasm) {
    try {
      vision = await FilesetResolver.forVisionTasks(url)
      await withTimeout(create(wanted), 20000)
      self.postMessage({ type: 'ready', delegate })
      return
    } catch (error) {
      lastError = error
    }
  }
  self.postMessage({ type: 'failed', message: lastError?.message ?? String(lastError) })
}

function frame({ bitmap, timestamp, easing }) {
  if (!segmenter || switching) { bitmap.close(); self.postMessage({ type: 'skipped' }); return }
  const t0 = performance.now()
  const { width, height } = bitmap
  let result
  try {
    result = segmenter.segmentForVideo(bitmap, timestamp)
  } catch (error) {
    bitmap.close()
    self.postMessage({ type: 'skipped', message: error?.message })
    return
  }
  bitmap.close()
  const confidence = result.confidenceMasks?.[0]
  if (!confidence) { result.close?.(); self.postMessage({ type: 'skipped' }); return }
  let values = confidence.getAsFloat32Array()
  const stat = checkMask(values)
  if (easing) {
    if (prevMask && prevMask.length === values.length) {
      const eased = new Float32Array(values.length)
      for (let i = 0; i < values.length; i++) eased[i] = prevMask[i] * easing + values[i] * (1 - easing)
      values = eased
    } else values = Float32Array.from(values)
    prevMask = values
  }
  // The person's confidence as the alpha of an RGBA picture, ready for the
  // page's 'source-in' compositing.
  const alpha = new Uint8ClampedArray(width * height * 4)
  for (let i = 0, j = 3; i < values.length; i++, j += 4) alpha[j] = values[i] * 255
  result.close?.()
  self.postMessage({ type: 'mask', alpha: alpha.buffer, width, height, delegate, ms: performance.now() - t0, mean: stat.mean, max: stat.max }, [alpha.buffer])
}

self.onmessage = ({ data }) => {
  if (data?.type === 'init') init(data)
  else if (data?.type === 'frame') frame(data)
}
