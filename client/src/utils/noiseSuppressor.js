import { RnnoiseWorkletNode, GtcrnWorkletNode, loadRnnoise, loadGtcrn } from '@sapphi-red/web-noise-suppressor'
import workletUrl from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url'
import wasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url'
import simdWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url'
import gtcrnWorkletUrl from '@sapphi-red/web-noise-suppressor/gtcrnWorklet.js?url'
import gtcrnWasmUrl from '@sapphi-red/web-noise-suppressor/gtcrn.wasm?url'

// Real noise removal on top of the browser's own: the microphone goes
// through a neural denoiser in an AudioWorklet before it is sent, so keyboard
// clatter and street noise are cut, not just softened. GTCRN is the main
// engine (about 30 dB off steady noise in our measurements); RNNoise is the
// fallback when GTCRN cannot load or run.
let wasmBinary = null
let gtcrnBinary = null
let contextPromise = null
let audioContext = null

// RNNoise works on 48 kHz mono frames; the context is pinned to that rate
// and the browser resamples the microphone into it.
function createContext() {
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) throw new Error('Web Audio is not supported in this browser')
  try {
    return new Ctx({ sampleRate: 48000, latencyHint: 'interactive' })
  } catch {
    return new Ctx()
  }
}

// Starts the audio engine. Called inside the "Join call" click as well, because
// Safari only lets a context run when it was created or resumed in a gesture.
export function primeDenoiser() {
  try {
    if (!audioContext) audioContext = createContext()
    if (audioContext.state !== 'running') audioContext.resume().catch(() => {})
  } catch { /* no Web Audio: the plain microphone is used */ }
  // The wasm and worklet load in the background meanwhile.
  context().catch(() => {})
}

async function context() {
  if (!contextPromise) {
    contextPromise = (async () => {
      if (!audioContext) audioContext = createContext()
      const ctx = audioContext
      ;[wasmBinary, gtcrnBinary] = await Promise.all([
        loadRnnoise({ url: wasmUrl, simdUrl: simdWasmUrl }),
        loadGtcrn({ url: gtcrnWasmUrl })
      ])
      await Promise.all([ctx.audioWorklet.addModule(workletUrl), ctx.audioWorklet.addModule(gtcrnWorkletUrl)])
      return ctx
    })().catch((err) => { contextPromise = null; throw err })
  }
  return contextPromise
}

export const isDenoiserSupported = () =>
  typeof window !== 'undefined' && Boolean(window.AudioContext || window.webkitAudioContext) &&
  typeof AudioWorkletNode !== 'undefined' && typeof WebAssembly !== 'undefined'

// Returns a cleaned audio track derived from `micTrack`, plus meters and stop().
// Without an engine named, GTCRN is tried first and RNNoise if it fails.
export async function denoiseTrack(micTrack, { engine } = {}) {
  if (engine) return buildDenoiser(micTrack, engine)
  try {
    return await buildDenoiser(micTrack, 'gtcrn')
  } catch (err) {
    console.warn('GTCRN denoiser unavailable, using RNNoise:', err)
    return buildDenoiser(micTrack, 'rnnoise')
  }
}

async function buildDenoiser(micTrack, engine) {
  const ctx = await context()
  if (ctx.state !== 'running') await ctx.resume()
  if (ctx.state !== 'running') throw new Error('the audio engine is paused by the browser')

  const source = ctx.createMediaStreamSource(new MediaStream([micTrack]))
  // One channel end to end: a stereo microphone is mixed down before the
  // denoiser, never sent with one silent side.
  source.channelCount = 1
  source.channelCountMode = 'explicit'
  const node = engine === 'gtcrn'
    ? new GtcrnWorkletNode(ctx, { wasmBinary: gtcrnBinary, maxChannels: 1 })
    : new RnnoiseWorkletNode(ctx, { wasmBinary, maxChannels: 1 })
  node.channelCount = 1
  node.channelCountMode = 'explicit'
  const destination = ctx.createMediaStreamDestination()
  destination.channelCount = 1
  destination.channelCountMode = 'explicit'
  // Meters on both sides of the denoiser, so a silent output can be noticed.
  const rawMeter = ctx.createAnalyser(); rawMeter.fftSize = 512
  const cleanMeter = ctx.createAnalyser(); cleanMeter.fftSize = 512
  source.connect(rawMeter)
  source.connect(node)
  node.connect(cleanMeter)
  node.connect(destination)
  const track = destination.stream.getAudioTracks()[0]
  const rms = (meter) => {
    const data = new Float32Array(meter.fftSize)
    meter.getFloatTimeDomainData(data)
    let sum = 0
    for (const v of data) sum += v * v
    return Math.sqrt(sum / data.length)
  }
  // The browser pauses the engine when the output device changes or the page
  // is interrupted (a phone call, a Bluetooth headset): wake it again.
  const onState = () => { if (ctx.state === 'suspended' || ctx.state === 'interrupted') ctx.resume().catch(() => {}) }
  ctx.addEventListener('statechange', onState)
  return {
    track,
    engine,
    levels: () => ({ raw: rms(rawMeter), clean: rms(cleanMeter), state: ctx.state }),
    resume: () => ctx.resume().catch(() => {}),
    stop() {
      ctx.removeEventListener('statechange', onState)
      try { source.disconnect(); node.disconnect(); node.destroy?.() } catch { /* already gone */ }
      track.stop()
    }
  }
}
