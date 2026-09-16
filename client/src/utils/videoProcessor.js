import * as SelfieSegmentation from '@mediapipe/selfie_segmentation'

class VideoProcessor {
  constructor() {
    this.segmentation = null
    this.initialized = false
    this.onFrame = null
  }

  async initialize() {
    if (this.initialized) return

    // The package is a browser global script: in the dev server it also
    // shows up as a module namespace, in the production bundle only as
    // window.SelfieSegmentation. Take whichever exists.
    const Segmentation =
      SelfieSegmentation.SelfieSegmentation ??
      SelfieSegmentation.default?.SelfieSegmentation ??
      globalThis.SelfieSegmentation
    if (typeof Segmentation !== 'function') throw new Error('Segmentation model is missing from the page')

    this.segmentation = new Segmentation({
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
