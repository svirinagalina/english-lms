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

// Before the denoiser: quiet microphones are brought up to a normal speaking
// level. Many students' laptops deliver speech at -50..-70 dBFS (a survey of
// October's lessons: one person in nine), which the denoiser and the gate
// then treated as noise and sent as silence. The speaking level is learned
// from the blocks clearly above the room's noise floor; the gain only ever
// raises (up to +18 dB; the browser's own AGC handles loud ones), climbs
// slowly, drops at once before a sample would clip, and stops short of
// lifting the room's noise above -45 dBFS, so the denoiser still has
// something it can remove. It reports what it does once a second.
// While someone else in the call is talking (the page says so: {far}), it
// neither learns nor raises: what the microphone hears then is mostly their
// voice from the speakers, and raising it sent the teacher her own voice
// back (Galina, 2026-10-21, students on MacBook speakers). The gain drops to
// at most +6 dB at once and comes back as it was when they stop.
const BOOST_SOURCE = `
class LevelBoost extends AudioWorkletProcessor {
  constructor(options) {
    super()
    const o = options.processorOptions || {}
    this.target = Math.pow(10, (o.targetDb ?? -26) / 20)
    this.maxGain = Math.pow(10, (o.maxDb ?? 30) / 20)
    this.noiseCeil = Math.pow(10, (o.noiseCeilDb ?? -45) / 20)
    this.bps = sampleRate / 128
    this.floor = null
    this.speech = 0
    this.speechBlocks = 0
    this.gain = 1
    this.up = Math.pow(10, 6 / 20 / this.bps)
    this.down = Math.pow(10, -20 / 20 / this.bps)
    this.reportIn = 0
    this.far = false
    this.farCap = Math.pow(10, 6 / 20)
    this.saved = 1
    this.port.onmessage = (e) => {
      const far = Boolean(e.data && e.data.far)
      if (far === this.far) return
      this.far = far
      if (far) { this.saved = this.gain; this.gain = Math.min(this.gain, this.farCap) }
      else this.gain = Math.max(this.gain, this.saved)
    }
  }
  process(inputs, outputs) {
    const input = inputs[0]
    const output = outputs[0]
    if (!input || !input[0] || !output || !output[0]) return true
    const x = input[0]
    let sum = 0
    let peak = 0
    for (let i = 0; i < x.length; i++) { const v = x[i]; sum += v * v; const a = v < 0 ? -v : v; if (a > peak) peak = a }
    const rms = Math.sqrt(sum / x.length)
    // Noise floor: starts at the first block heard, follows quiet blocks down
    // quickly, creeps up 2 dB a second. Blocks under -100 dBFS are gaps in
    // the stream (digital silence), not the room: they would drag the floor
    // down until noise passed for speech, so they are left out of both.
    const heard = rms > 1e-5 && !this.far
    if (heard) {
      if (this.floor === null) this.floor = rms
      else if (rms < this.floor) this.floor += (rms - this.floor) * 0.1
      else this.floor *= Math.pow(10, 2 / 20 / this.bps)
    }
    // Speech: 12 dB over the floor. A running mean at first, then ~2 s.
    if (heard && rms > this.floor * 4) {
      this.speechBlocks++
      const a = 1 / Math.min(this.speechBlocks, 2 * this.bps)
      this.speech += (rms - this.speech) * a
    }
    let wanted = 1
    if (this.speechBlocks > 0.5 * this.bps && this.speech > 0) {
      wanted = Math.min(this.maxGain, this.target / this.speech, this.noiseCeil / this.floor)
      if (wanted < 1) wanted = 1
    }
    if (this.far) wanted = Math.min(wanted, this.farCap)
    if (wanted > this.gain) this.gain = Math.min(wanted, this.gain * this.up)
    else this.gain = Math.max(wanted, this.gain * this.down)
    if (peak * this.gain > 0.9) this.gain = Math.max(1, 0.9 / peak)
    for (let c = 0; c < output.length; c++) {
      const src = input[c] || x
      const dst = output[c]
      for (let i = 0; i < dst.length; i++) dst[i] = src[i] * this.gain
    }
    if (--this.reportIn <= 0) {
      this.reportIn = this.bps
      this.port.postMessage({ gainDb: 20 * Math.log10(this.far ? this.saved : this.gain), floorDb: this.floor ? 20 * Math.log10(this.floor) : null, speechDb: this.speech > 0 ? 20 * Math.log10(this.speech) : null })
    }
    return true
  }
}
registerProcessor('level-boost', LevelBoost)
`

// A gentle gate after the denoiser: what it leaves of a fan or a hiss sits
// around -60 dBFS, faint but audible with a phone at the ear in a quiet
// room. Below the threshold the gain eases to zero; a voice opens it in a
// few milliseconds and keeps it open through the pauses between words.
// The threshold follows what the denoiser leaves of the room: 12 dB over
// that floor, between -62 and -48 dBFS. A noisy residue (the fan) keeps it
// at -48 as before; a quiet room lets a soft voice through. While someone
// else is talking ({far}) it is -48 regardless: what is left of their voice
// after the browser's echo cancelling sits below that and stays out.
const GATE_SOURCE = `
class QuietGate extends AudioWorkletProcessor {
  constructor(options) {
    super()
    const o = options.processorOptions || {}
    this.maxOpen = Math.pow(10, (o.openDb ?? -48) / 20)
    this.minOpen = Math.pow(10, (o.minOpenDb ?? -62) / 20)
    this.closeRatio = Math.pow(10, ((o.closeDb ?? -54) - (o.openDb ?? -48)) / 20)
    this.open = this.maxOpen
    this.close = this.maxOpen * this.closeRatio
    this.floor = this.maxOpen / 4
    this.floorUp = Math.pow(10, 2 / 20 / (sampleRate / 128))
    this.reportIn = 0
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
    this.far = false
    this.port.onmessage = (e) => {
      if (e.data && typeof e.data === 'object') { this.far = Boolean(e.data.far); return }
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
    const level = rms > 1e-6 ? rms : 1e-6
    if (level < this.floor) this.floor += (level - this.floor) * 0.1
    else this.floor *= this.floorUp
    this.open = this.far ? this.maxOpen : Math.min(this.maxOpen, Math.max(this.minOpen, this.floor * 4))
    this.close = this.open * this.closeRatio
    if (--this.reportIn <= 0) {
      this.reportIn = sampleRate / 128
      this.port.postMessage({ openDb: 20 * Math.log10(this.open) })
    }
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
const moduleUrl = (src) => typeof Blob !== 'undefined' ? URL.createObjectURL(new Blob([src], { type: 'application/javascript' })) : null
const gateModuleUrl = moduleUrl(GATE_SOURCE)
const boostModuleUrl = moduleUrl(BOOST_SOURCE)

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
      await Promise.all([ctx.audioWorklet.addModule(workletUrl), ctx.audioWorklet.addModule(gtcrnWorkletUrl), ctx.audioWorklet.addModule(gateModuleUrl), ctx.audioWorklet.addModule(boostModuleUrl)])
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
// `boost: false` leaves out the level boost (incoming audio: the sender's
// own chain already set its level).
export async function denoiseTrack(micTrack, { engine, boost = true } = {}) {
  if (engine) return buildDenoiser(micTrack, engine, boost)
  try {
    return await buildDenoiser(micTrack, 'gtcrn', boost)
  } catch (err) {
    console.warn('GTCRN denoiser unavailable, using RNNoise:', err)
    return buildDenoiser(micTrack, 'rnnoise', boost)
  }
}

async function buildDenoiser(micTrack, engine, boost = true) {
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
  const gate = new AudioWorkletNode(ctx, 'quiet-gate', { processorOptions: { openDb: -48, minOpenDb: -62, closeDb: -54, holdMs: 400 } })
  // At most +18 dB (was +30): enough for a laptop microphone at -45 dBFS;
  // more mostly raised the room and the other person's voice from the speakers.
  const booster = boost ? new AudioWorkletNode(ctx, 'level-boost', { processorOptions: { targetDb: -26, maxDb: 18, noiseCeilDb: -45 } }) : null
  const destination = ctx.createMediaStreamDestination()
  const tuning = { boostDb: 0, floorDb: null, speechDb: null, gateDb: -48 }
  if (booster) booster.port.onmessage = (e) => { tuning.boostDb = e.data.gainDb; tuning.floorDb = e.data.floorDb; tuning.speechDb = e.data.speechDb }
  gate.port.onmessage = (e) => { tuning.gateDb = e.data.openDb }
  for (const n of [source, booster, node, gate, destination].filter(Boolean)) {
    try { n.channelCount = 1; n.channelCountMode = 'explicit' } catch { /* a browser that will not let this be set keeps its default */ }
  }
  // Meters on both sides of the denoiser, so a silent output can be noticed.
  const rawMeter = ctx.createAnalyser(); rawMeter.fftSize = 512
  const cleanMeter = ctx.createAnalyser(); cleanMeter.fftSize = 512
  const outMeter = ctx.createAnalyser(); outMeter.fftSize = 512
  source.connect(rawMeter)
  if (booster) { source.connect(booster); booster.connect(node) } else source.connect(node)
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
    // What the level boost and the gate settled on (dB), for the diag log.
    tuning: () => ({ ...tuning }),
    resume: () => ctx.resume().catch(() => {}),
    keystroke: () => gate.port.postMessage(1),
    // Someone else in the call is talking (see Call.jsx): no raising, the
    // gate at -48 — their voice from our speakers stays out of what we send.
    farEnd: (active) => { const m = { far: Boolean(active) }; gate.port.postMessage(m); booster?.port.postMessage(m) },
    stop() {
      ctx.removeEventListener('statechange', onState)
      try { source.disconnect(); booster?.disconnect(); node.disconnect(); gate.disconnect(); node.destroy?.() } catch { /* already gone */ }
      track.stop()
    }
  }
}
