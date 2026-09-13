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
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
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
