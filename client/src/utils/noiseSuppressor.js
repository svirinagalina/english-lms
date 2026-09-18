import { RnnoiseWorkletNode, loadRnnoise } from '@sapphi-red/web-noise-suppressor'
import workletUrl from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url'
import wasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url'
import simdWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url'

// Real noise removal on top of the browser's own: the microphone goes
// through RNNoise (a small neural denoiser) in an AudioWorklet before it is
// sent, so keyboard clatter and street noise are cut, not just softened.
let wasmBinary = null
let contextPromise = null

async function context() {
  if (!contextPromise) {
    contextPromise = (async () => {
      const ctx = new AudioContext({ sampleRate: 48000 })
      wasmBinary = await loadRnnoise({ url: wasmUrl, simdUrl: simdWasmUrl })
      await ctx.audioWorklet.addModule(workletUrl)
      return ctx
    })()
  }
  return contextPromise
}

// Returns a cleaned audio track derived from `micTrack`, plus a stop().
export async function denoiseTrack(micTrack) {
  const ctx = await context()
  if (ctx.state === 'suspended') await ctx.resume()
  const source = ctx.createMediaStreamSource(new MediaStream([micTrack]))
  const node = new RnnoiseWorkletNode(ctx, { wasmBinary, maxChannels: 1 })
  const destination = ctx.createMediaStreamDestination()
  source.connect(node)
  node.connect(destination)
  const track = destination.stream.getAudioTracks()[0]
  return {
    track,
    stop() {
      try { source.disconnect(); node.disconnect(); node.destroy?.() } catch { /* already gone */ }
      track.stop()
    }
  }
}
