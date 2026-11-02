import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision'
import { isHandheld } from './device'

/* global __MEDIAPIPE_VERSION__ */
const CDN_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${__MEDIAPIPE_VERSION__}/wasm`
const withTimeout = (promise, ms) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))])

// Person segmentation for the background blur. Runtime and model are served
// from our own origin (see scripts/copy-mediapipe.js). Frames are analysed
// at a reduced size — the mask is only used to cut the person out, so a
// small one scaled up is plenty and keeps the call smooth.
// A phone runs the model on its CPU, on the same thread as the page: a
// smaller frame there, and the mask eased between frames so its edge doesn't
// shimmer (on an iPhone it read as "the blur looks strange").
const HANDHELD = isHandheld()
const ANALYSIS_WIDTH = HANDHELD ? 256 : 320
const MASK_EASING = HANDHELD ? 0.35 : 0 // share of the previous mask kept each frame
const MODEL_URL = '/mediapipe/selfie_segmenter.tflite'
const WORKER_OK = typeof Worker !== 'undefined' && typeof createImageBitmap === 'function' && typeof OffscreenCanvas !== 'undefined'

class VideoProcessor {
  constructor() {
    this.segmenter = null
    this.initialized = false
    this.onFrame = null
    this.input = document.createElement('canvas')
    this.mask = document.createElement('canvas')
    this.busy = false
    this.maskStats = []
    this.switching = false
    this.delegate = null
    this.vision = null
  }

  async initialize() {
    if (this.initialized) return
    // A computer runs the model in a worker of its own, so a slow frame no
    // longer holds up the board, sound and video on the page. Phones keep the
    // page path, tuned for them (CPU, smaller frames). The page path is also
    // the fallback whenever the worker can't start.
    if (!HANDHELD && WORKER_OK) {
      try {
        await this.startWorker()
        this.mode = 'worker'
        this.initialized = true
        return
      } catch (error) {
        console.warn('Blur: the worker did not start, running on the page', error)
        this.stopWorker()
      }
    }
    await this.initializePage()
  }

  async initializePage() {
    this.mode = 'page'
    // The runtime is ~2.5 MB even compressed and our server sends it slowly
    // (half a minute on some links); jsDelivr has the same files in well
    // under a second. Our own copy stays as the fallback for a blocked CDN.
    try {
      this.vision = await FilesetResolver.forVisionTasks(CDN_WASM)
      await withTimeout(this.createSegmenterOnce(this.pickDelegate()), 20000)
      this.initialized = true
      this.maskStats = []
      return
    } catch {
      this.vision = await FilesetResolver.forVisionTasks('/mediapipe/wasm')
    }
    // Safari's WebGL gives the GPU path a mask that is all person or all
    // background (the blur then shows nothing): iPhones and iPads run the
    // model on the CPU from the start; elsewhere the GPU is tried first.
    this.delegate = this.pickDelegate()
    await this.createSegmenter(this.delegate)
    this.initialized = true
    this.maskStats = []
  }

  startWorker() {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./segmentWorker.js', import.meta.url), { type: 'module' })
      this.worker = worker
      const timer = setTimeout(() => reject(new Error('worker timeout')), 25000)
      worker.onmessage = ({ data }) => {
        if (data?.type === 'ready') {
          clearTimeout(timer)
          this.delegate = data.delegate
          worker.onmessage = ({ data: reply }) => this.onWorkerReply(reply)
          resolve()
        } else if (data?.type === 'failed') {
          clearTimeout(timer)
          reject(new Error(data.message))
        }
      }
      worker.onerror = (event) => {
        clearTimeout(timer)
        event.preventDefault?.()
        // Before it was ready: the page path takes over in initialize().
        // During a call: the next frame starts the page path instead.
        if (!this.initialized) reject(new Error(event.message || 'worker error'))
        else this.workerFailed(event.message || 'worker error')
      }
      worker.postMessage({ type: 'init', wasm: [CDN_WASM, '/mediapipe/wasm'], model: MODEL_URL, delegate: this.pickDelegate() })
    })
  }

  stopWorker() {
    this.worker?.terminate()
    this.worker = null
    this.pending?.(null)
    this.pending = null
  }

  onWorkerReply(reply) {
    const done = this.pending
    this.pending = null
    done?.(reply)
  }

  workerFailed(message) {
    console.warn('Blur: the worker stopped, going on on the page', message)
    this.workerError = message
    this.stopWorker()
    this.mode = 'page-fallback'
    this.initialized = false
    this.hasMask = false
    this.initializePage().catch((error) => console.error('Blur: page path failed too', error))
  }

  pickDelegate() {
    return /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? 'CPU' : 'GPU'
  }

  async createSegmenterOnce(delegate) {
    await this.createSegmenter(delegate)
  }

  async createSegmenter(delegate) {
    const options = (d) => ({
      baseOptions: { modelAssetPath: MODEL_URL, delegate: d },
      runningMode: 'VIDEO',
      outputCategoryMask: false,
      outputConfidenceMasks: true
    })
    try {
      this.segmenter = await ImageSegmenter.createFromOptions(this.vision, options(delegate))
      this.delegate = delegate
    } catch {
      this.segmenter = await ImageSegmenter.createFromOptions(this.vision, options('CPU'))
      this.delegate = 'CPU'
    }
  }

  // A mask that never varies (all person, or no person anywhere) over the
  // first seconds means the GPU path is broken on this device: switch to the
  // CPU once. "No person" is judged by the strongest pixel, NaN counted as 0:
  // a mask of faint noise or NaN slipped past the old mean < 0.015 test, and
  // the whole picture, face included, would be blurred.
  checkMask(values) {
    if (this.switching) return
    let sum = 0, max = 0, n = 0
    for (let i = 0; i < values.length; i += 7) {
      const v = Number.isFinite(values[i]) ? values[i] : 0
      sum += v; n++
      if (v > max) max = v
    }
    const mean = sum / n
    this.lastMaskMean = mean
    this.lastMaskMax = max
    this.maskStats.push({ mean, max })
    if (this.maskStats.length < 30) return
    if (this.delegate !== 'GPU') { this.maskStats = []; return }
    const flat = this.maskStats.every((m) => m.mean > 0.985) || this.maskStats.every((m) => m.max < 0.5)
    this.maskStats = []
    if (!flat) { this.delegate = 'GPU-ok'; return }
    this.switching = true
    console.warn('Blur: the GPU mask is flat on this device, switching to the CPU')
    this.createSegmenter('CPU').finally(() => { this.switching = false })
  }

  // Composes the current camera frame with the last mask, without running the
  // model: on a phone the model runs every other frame and these fill in, so
  // the picture moves at the full rate while the CPU does half the work.
  recompose(video) {
    if (!this.initialized || this.busy || !this.hasMask || !video.videoWidth) return false
    if (this.onFrame) this.onFrame({ image: video, segmentationMask: this.mask })
    return true
  }

  // Runs one frame and hands back { image, segmentationMask } — the mask is a
  // canvas whose alpha is the person's confidence, ready for 'source-in'.
  async send(video) {
    if (!this.initialized || this.busy || !video.videoWidth) return false
    this.busy = true
    try {
      const scale = ANALYSIS_WIDTH / video.videoWidth
      const width = ANALYSIS_WIDTH
      const height = Math.max(1, Math.round(video.videoHeight * scale))
      if (this.input.width !== width || this.input.height !== height) {
        this.input.width = width; this.input.height = height
        this.mask.width = width; this.mask.height = height
      }
      if (this.mode === 'worker') return await this.sendToWorker(video, width, height)
      this.input.getContext('2d').drawImage(video, 0, 0, width, height)

      const result = this.segmenter.segmentForVideo(this.input, performance.now())
      const confidence = result.confidenceMasks?.[0]
      if (confidence) {
        let values = confidence.getAsFloat32Array()
        this.checkMask(values)
        if (MASK_EASING) {
          const prev = this.prevMask
          if (prev && prev.length === values.length) {
            const eased = new Float32Array(values.length)
            for (let i = 0; i < values.length; i++) eased[i] = prev[i] * MASK_EASING + values[i] * (1 - MASK_EASING)
            values = eased
          }
          this.prevMask = values
        }
        const ctx = this.mask.getContext('2d')
        const pixels = ctx.createImageData(width, height)
        const data = pixels.data
        for (let i = 0, j = 3; i < values.length; i++, j += 4) data[j] = values[i] * 255
        ctx.putImageData(pixels, 0, 0)
        this.hasMask = true
      }
      result.close?.()
      if (this.onFrame) this.onFrame({ image: video, segmentationMask: this.mask })
      return true
    } finally {
      this.busy = false
    }
  }

  // The worker path: the page only shrinks the frame (createImageBitmap, done
  // by the browser off the page's thread) and paints the mask that comes back.
  async sendToWorker(video, width, height) {
    const bitmap = await createImageBitmap(video, { resizeWidth: width, resizeHeight: height, resizeQuality: 'low' })
    if (!this.worker) { bitmap.close(); return false }
    // A worker that stops answering (a lost GPU context, a crash that sends
    // no error) must not hang the blur loop that awaits this frame. 15 s:
    // a slow computer's first frame alone has taken 12 s on the page path.
    let timer
    const reply = await new Promise((resolve) => {
      this.pending = resolve
      timer = setTimeout(() => this.workerFailed('no answer for 15 s'), 15000)
      this.worker.postMessage({ type: 'frame', bitmap, timestamp: performance.now(), easing: MASK_EASING }, [bitmap])
    })
    clearTimeout(timer)
    if (reply?.type !== 'mask') return false
    if (reply.width !== this.mask.width || reply.height !== this.mask.height) return false
    this.delegate = reply.delegate
    this.modelMs = reply.ms
    // For the blur.mask diag: how much "person" the worker's mask holds.
    this.lastMaskMean = reply.mean
    this.lastMaskMax = reply.max
    this.mask.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(reply.alpha), reply.width, reply.height), 0, 0)
    this.hasMask = true
    if (this.onFrame) this.onFrame({ image: video, segmentationMask: this.mask })
    return true
  }
}

export const videoProcessor = new VideoProcessor()
