import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision'

// Person segmentation for the background blur. Runtime and model are served
// from our own origin (see scripts/copy-mediapipe.js). Frames are analysed
// at a reduced size — the mask is only used to cut the person out, so a
// small one scaled up is plenty and keeps the call smooth.
const ANALYSIS_WIDTH = 320

class VideoProcessor {
  constructor() {
    this.segmenter = null
    this.initialized = false
    this.onFrame = null
    this.input = document.createElement('canvas')
    this.mask = document.createElement('canvas')
    this.busy = false
  }

  async initialize() {
    if (this.initialized) return
    const vision = await FilesetResolver.forVisionTasks('/mediapipe/wasm')
    const options = (delegate) => ({
      baseOptions: { modelAssetPath: '/mediapipe/selfie_segmenter.tflite', delegate },
      runningMode: 'VIDEO',
      outputCategoryMask: false,
      outputConfidenceMasks: true
    })
    try {
      this.segmenter = await ImageSegmenter.createFromOptions(vision, options('GPU'))
    } catch {
      this.segmenter = await ImageSegmenter.createFromOptions(vision, options('CPU'))
    }
    this.initialized = true
  }

  // Runs one frame and hands back { image, segmentationMask } — the mask is a
  // canvas whose alpha is the person's confidence, ready for 'source-in'.
  async send(video) {
    if (!this.initialized || this.busy || !video.videoWidth) return
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
        const values = confidence.getAsFloat32Array()
        const ctx = this.mask.getContext('2d')
        const pixels = ctx.createImageData(width, height)
        const data = pixels.data
        for (let i = 0, j = 3; i < values.length; i++, j += 4) data[j] = values[i] * 255
        ctx.putImageData(pixels, 0, 0)
      }
      result.close?.()
      if (this.onFrame) this.onFrame({ image: video, segmentationMask: this.mask })
    } finally {
      this.busy = false
    }
  }
}

export const videoProcessor = new VideoProcessor()
