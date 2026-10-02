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

// A gentle gate after the denoiser: what it leaves of a fan or a hiss sits
// around -60 dBFS, faint but audible with a phone at the ear in a quiet
// room. Below the threshold the gain eases to zero; a voice opens it in a
// few milliseconds and keeps it open through the pauses between words.
const GATE_SOURCE = `
class QuietGate extends AudioWorkletProcessor {
  constructor(options) {
    super()
    const o = options.processorOptions || {}
    this.open = Math.pow(10, (o.openDb ?? -48) / 20)
    this.close = Math.pow(10, (o.closeDb ?? -54) / 20)
    this.holdBlocks = Math.ceil((o.holdMs ?? 400) * sampleRate / 1000 / 128)
    this.attack = Math.exp(-1 / (sampleRate / 128 * (o.attackMs ?? 5) / 1000))
    this.release = Math.exp(-1 / (sampleRate / 128 * (o.releaseMs ?? 150) / 1000))
    this.gain = 0
    this.hold = 0
    this.isOpen = false
    // Typing: the page tells us about every key press/release. For ~200 ms
    // after one, a click must not open the gate: it takes a louder and
    // longer sound (a voice, -36 dBFS for 40 ms) to open it, and an already
    // open gate (speaking while typing) is ducked to a quarter.
    this.keyBlocks = 0
    this.keyWindow = Math.ceil(0.2 * sampleRate / 128)
    this.typingOpen = Math.pow(10, -36 / 20)
    this.above = 0
    this.openFor = 0
    this.port.onmessage = () => {
      this.keyBlocks = this.keyWindow
      // A click that already began to open the gate is closed again.
      if (this.isOpen && this.openFor < this.longBlocks) { this.isOpen = false; this.hold = 0 }
    }
    // Opening from silence needs ~15 ms of sound (a click is shorter).
    this.shortBlocks = Math.ceil(0.015 * sampleRate / 128)
    this.longBlocks = Math.ceil(0.04 * sampleRate / 128)
  }
  process(inputs, outputs) {
    const input = inputs[0]
    const output = outputs[0]
    if (!input || !input[0] || !output || !output[0]) return true
    const x = input[0]
    let sum = 0
    for (let i = 0; i < x.length; i++) sum += x[i] * x[i]
    const rms = Math.sqrt(sum / x.length)
    const typing = this.keyBlocks > 0
    if (typing) this.keyBlocks--
    const threshold = typing ? this.typingOpen : this.open
    if (rms > threshold) {
      this.above++
      if (this.isOpen || this.above >= (typing ? this.longBlocks : this.shortBlocks)) { this.isOpen = true; this.hold = this.holdBlocks }
    } else {
      this.above = 0
      if (rms < this.close) { if (this.hold > 0) this.hold--; else this.isOpen = false }
    }
    this.openFor = this.isOpen ? this.openFor + 1 : 0
    const target = this.isOpen ? (typing ? 0.25 : 1) : 0
    const coef = target > this.gain ? this.attack : this.release
    this.gain = target + (this.gain - target) * coef
    if (this.gain < 0.001) this.gain = 0
    for (let c = 0; c < output.length; c++) {
      const src = input[c] || x
      const dst = output[c]
      for (let i = 0; i < dst.length; i++) dst[i] = src[i] * this.gain
    }
    return true
  }
}
registerProcessor('quiet-gate', QuietGate)
`
const gateModuleUrl = typeof Blob !== 'undefined' ? URL.createObjectURL(new Blob([GATE_SOURCE], { type: 'application/javascript' })) : null

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
// Fetches the wasm and worklet files ahead of time (no audio engine yet).
export function preloadDenoiser() {
  if (!isDenoiserSupported()) return
  context().catch(() => {})
}

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
      await Promise.all([ctx.audioWorklet.addModule(workletUrl), ctx.audioWorklet.addModule(gtcrnWorkletUrl), ctx.audioWorklet.addModule(gateModuleUrl)])
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
  // Both models expect 48 kHz; a browser that refused that rate (some
  // phones follow the hardware) gets the plain microphone instead.
  if (Math.round(ctx.sampleRate) !== 48000) throw new Error(`the audio engine runs at ${ctx.sampleRate} Hz, not 48000`)

  const source = ctx.createMediaStreamSource(new MediaStream([micTrack]))
  // One channel end to end: a stereo microphone is mixed down before the
  // denoiser, never sent with one silent side.
  const node = engine === 'gtcrn'
    ? new GtcrnWorkletNode(ctx, { wasmBinary: gtcrnBinary, maxChannels: 1 })
    : new RnnoiseWorkletNode(ctx, { wasmBinary, maxChannels: 1 })
  const gate = new AudioWorkletNode(ctx, 'quiet-gate', { processorOptions: { openDb: -48, closeDb: -54, holdMs: 400 } })
  const destination = ctx.createMediaStreamDestination()
  for (const n of [source, node, gate, destination]) {
    try { n.channelCount = 1; n.channelCountMode = 'explicit' } catch { /* a browser that will not let this be set keeps its default */ }
  }
  // Meters on both sides of the denoiser, so a silent output can be noticed.
  const rawMeter = ctx.createAnalyser(); rawMeter.fftSize = 512
  const cleanMeter = ctx.createAnalyser(); cleanMeter.fftSize = 512
  const outMeter = ctx.createAnalyser(); outMeter.fftSize = 512
  source.connect(rawMeter)
  source.connect(node)
  node.connect(cleanMeter) // the denoiser's own output, before the gate: the watchdog judges this
  node.connect(gate)
  gate.connect(outMeter)
  gate.connect(destination)
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
    levels: () => ({ raw: rms(rawMeter), clean: rms(cleanMeter), out: rms(outMeter), state: ctx.state }),
    resume: () => ctx.resume().catch(() => {}),
    keystroke: () => gate.port.postMessage(1),
    stop() {
      ctx.removeEventListener('statechange', onState)
      try { source.disconnect(); node.disconnect(); gate.disconnect(); node.destroy?.() } catch { /* already gone */ }
      track.stop()
    }
  }
}
