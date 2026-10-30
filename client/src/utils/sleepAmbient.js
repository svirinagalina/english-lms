// Ambience made in the browser, no audio files needed. Returns a function that
// fades everything out. Modes:
//   'arabian': low drone, soft wind and now and then a note from the Hijaz scale, with echo
//   'calm':    drone and soft wind only (bedtime stories for children)
//   'train':   the rhythm of the wheels over a low rumble

const HIJAZ = [146.83, 155.56, 185.0, 196.0, 220.0, 233.08, 261.63, 293.66] // D3 Eb3 F#3 G3 A3 Bb3 C4 D4

export function startAmbient(mode = 'arabian', volume = 0.5) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext
  if (!AudioCtx) return () => {}
  const ctx = new AudioCtx()
  if (mode === 'train') return startTrain(ctx, volume)
  const now = ctx.currentTime

  const master = ctx.createGain()
  master.gain.setValueAtTime(0, now)
  master.gain.setTargetAtTime(volume, now, 2)
  master.connect(ctx.destination)

  // Drone: three slowly breathing sines.
  const sources = [73.42, 110, 146.83].map((freq, i) => {
    const osc = ctx.createOscillator()
    osc.frequency.value = freq
    const gain = ctx.createGain()
    gain.gain.value = 0.22 / (i + 1)
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.05 + i * 0.02
    const depth = ctx.createGain()
    depth.gain.value = 0.07
    lfo.connect(depth).connect(gain.gain)
    osc.connect(gain).connect(master)
    osc.start(now)
    lfo.start(now)
    return [osc, lfo]
  })

  // Wind: filtered brown noise with a slow sweep.
  const len = ctx.sampleRate * 4
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  let last = 0
  for (let i = 0; i < len; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02
    data[i] = last * 3.5
  }
  const wind = ctx.createBufferSource()
  wind.buffer = buffer
  wind.loop = true
  const windFilter = ctx.createBiquadFilter()
  windFilter.type = 'bandpass'
  windFilter.frequency.value = 600
  windFilter.Q.value = 0.6
  const windGain = ctx.createGain()
  windGain.gain.value = mode === 'calm' ? 0.06 : 0.12
  const sweep = ctx.createOscillator()
  sweep.frequency.value = 0.03
  const sweepDepth = ctx.createGain()
  sweepDepth.gain.value = 300
  sweep.connect(sweepDepth).connect(windFilter.frequency)
  wind.connect(windFilter).connect(windGain).connect(master)
  wind.start(now)
  sweep.start(now)

  // Echo for the notes.
  const echo = ctx.createDelay()
  echo.delayTime.value = 0.38
  const feedback = ctx.createGain()
  feedback.gain.value = 0.35
  echo.connect(feedback).connect(echo)
  echo.connect(master)

  const pluck = () => {
    const t = ctx.currentTime
    const freq = HIJAZ[Math.floor(Math.random() * HIJAZ.length)]
    const osc = ctx.createOscillator()
    osc.frequency.value = freq
    const overtone = ctx.createOscillator()
    overtone.frequency.value = freq * 2
    const env = ctx.createGain()
    env.gain.setValueAtTime(0.0001, t)
    env.gain.exponentialRampToValueAtTime(0.18, t + 0.05)
    env.gain.exponentialRampToValueAtTime(0.0001, t + 3.5)
    const overEnv = ctx.createGain()
    overEnv.gain.value = 0.3
    osc.connect(env)
    overtone.connect(overEnv).connect(env)
    env.connect(master)
    const send = ctx.createGain()
    send.gain.value = 0.3
    env.connect(send).connect(echo)
    osc.start(t)
    overtone.start(t)
    osc.stop(t + 3.6)
    overtone.stop(t + 3.6)
  }
  const timer = mode === 'calm' ? null : setInterval(() => {
    if (Math.random() < 0.7) pluck()
  }, 3500)
  if (mode !== 'calm') pluck()

  return fadeOut(ctx, master, () => {
    clearInterval(timer)
    sources.forEach(([osc, lfo]) => { osc.stop(); lfo.stop() })
    wind.stop()
    sweep.stop()
  })
}

// Rail joints: a "ta-dum" motif of two soft clacks, then a pause, over a low rumble.
function startTrain(ctx, volume) {
  const now = ctx.currentTime
  const master = ctx.createGain()
  master.gain.setValueAtTime(0, now)
  master.gain.setTargetAtTime(volume, now, 2)
  master.connect(ctx.destination)

  const rumbleBuffer = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate)
  const rumbleData = rumbleBuffer.getChannelData(0)
  let last = 0
  for (let i = 0; i < rumbleData.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02
    rumbleData[i] = last * 3.5
  }
  const rumble = ctx.createBufferSource()
  rumble.buffer = rumbleBuffer
  rumble.loop = true
  const rumbleFilter = ctx.createBiquadFilter()
  rumbleFilter.type = 'lowpass'
  rumbleFilter.frequency.value = 220
  const rumbleGain = ctx.createGain()
  rumbleGain.gain.value = 0.35
  rumble.connect(rumbleFilter).connect(rumbleGain).connect(master)
  rumble.start(now)

  const clackBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate)
  const clackData = clackBuffer.getChannelData(0)
  for (let i = 0; i < clackData.length; i++) {
    clackData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.012))
  }
  const clack = (t) => {
    const src = ctx.createBufferSource()
    src.buffer = clackBuffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 1400
    filter.Q.value = 1.2
    const gain = ctx.createGain()
    gain.gain.value = 0.5
    src.connect(filter).connect(gain).connect(master)
    src.start(t)
  }
  const motif = () => {
    const t = ctx.currentTime + 0.05
    clack(t)
    clack(t + 0.24)
  }
  const timer = setInterval(motif, 1800)
  motif()

  return fadeOut(ctx, master, () => {
    clearInterval(timer)
    rumble.stop()
  })
}

function fadeOut(ctx, master, stopSources) {
  return () => {
    const t = ctx.currentTime
    master.gain.setTargetAtTime(0, t, 0.8)
    setTimeout(() => {
      stopSources()
      ctx.close()
    }, 3000)
  }
}
