import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision'
import { isHandheld } from './device'

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
    this.vision = await FilesetResolver.forVisionTasks('/mediapipe/wasm')
    // Safari's WebGL gives the GPU path a mask that is all person or all
    // background (the blur then shows nothing): iPhones and iPads run the
    // model on the CPU from the start; elsewhere the GPU is tried first.
    this.delegate = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? 'CPU' : 'GPU'
    await this.createSegmenter(this.delegate)
    this.initialized = true
    this.maskStats = []
  }

  async createSegmenter(delegate) {
    const options = (d) => ({
      baseOptions: { modelAssetPath: '/mediapipe/selfie_segmenter.tflite', delegate: d },
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

  // A mask that never varies (all person, or all background) over the first
  // seconds means the GPU path is broken on this device: switch to the CPU once.
  checkMask(values) {
    if (this.switching) return
    let sum = 0
    for (let i = 0; i < values.length; i += 7) sum += values[i]
    const mean = sum / Math.ceil(values.length / 7)
    this.lastMaskMean = mean
    this.maskStats.push(mean)
    if (this.maskStats.length < 30) return
    if (this.delegate !== 'GPU') { this.maskStats = []; return }
    const flat = this.maskStats.every((m) => m > 0.985) || this.maskStats.every((m) => m < 0.015)
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
}

export const videoProcessor = new VideoProcessor()
