import * as SelfieSegmentation from '@mediapipe/selfie_segmentation'

class VideoProcessor {
  constructor() {
    this.segmentation = null
    this.initialized = false
    this.onFrame = null
  }

  async initialize() {
    if (this.initialized) return

    this.segmentation = new SelfieSegmentation.SelfieSegmentation({
      // Served from our own origin (copied at build time), so no browser
      // or ad blocker can refuse the model the way some do with CDNs.
      locateFile: (file) => `/mediapipe/${file}`
    })

    this.segmentation.setOptions({ modelSelection: 1 })
    this.segmentation.onResults((results) => {
      if (this.onFrame) this.onFrame(results)
    })

    await this.segmentation.initialize()
    this.initialized = true
  }

  async send(videoElement) {
    if (!this.initialized) return
    await this.segmentation.send({ image: videoElement })
  }
}

export const videoProcessor = new VideoProcessor()
