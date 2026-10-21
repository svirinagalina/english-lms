// Echo in a call: someone's microphone picks up the other person's voice
// from their speakers and sends it back, so that person hears themselves a
// moment later. Measured on every side from the loudness envelopes (20 per
// second) of what we send and of what each person sends us:
//   source — what we send follows what we hear from them by 0–0.5 s:
//            our microphone is the one echoing them;
//   heard  — what they send follows what we sent by 0.1–1.5 s (the round
//            trip): our own voice is coming back to us from them.
// Correlation is of the envelopes with their means removed, 1 = identical
// shape. Only loudness is compared, nothing is recorded or sent anywhere.

const STEP_MS = 50
const LEN = 160 // 8 s of envelope

// How strongly `follow` repeats `lead` `lag` steps later, looking only at
// the moments when `lead` is talking (within 100 ms of a loud step): in a
// conversation people take turns, and the other person's own speech in the
// remaining moments would only hide the echo. Envelopes are compared in dB.
export function correlate(lead, follow, minLag, maxLag) {
  const n = Math.min(lead.length, follow.length)
  const db = (v) => 20 * Math.log10(v + 1e-4)
  const loudest = lead.reduce((m, v) => (v > m ? v : m), 0)
  const threshold = Math.max(0.01, loudest * 0.15)
  const talking = new Uint8Array(n)
  for (let i = 0; i < n; i++) if (lead[i] > threshold) for (let k = Math.max(0, i - 2); k <= Math.min(n - 1, i + 2); k++) talking[k] = 1
  let best = { corr: 0, lag: 0, frames: 0 }
  for (let lag = minLag; lag <= maxLag; lag++) {
    const xs = [], ys = []
    for (let i = 0; i + lag < n; i++) if (talking[i]) { xs.push(db(lead[i])); ys.push(db(follow[i + lag])) }
    const m = xs.length
    if (m < 30) continue
    let ma = 0, mb = 0
    for (let i = 0; i < m; i++) { ma += xs[i]; mb += ys[i] }
    ma /= m; mb /= m
    let num = 0, va = 0, vb = 0
    for (let i = 0; i < m; i++) { const a = xs[i] - ma, b = ys[i] - mb; num += a * b; va += a * a; vb += b * b }
    if (va < 1e-9 || vb < 1e-9) continue
    const corr = num / Math.sqrt(va * vb)
    if (corr > best.corr) best = { corr, lag, frames: m }
  }
  return best
}

export function createEchoMeter() {
  const ctx = new AudioContext()
  ctx.resume().catch(() => {})
  const sink = ctx.createGain()
  sink.gain.value = 0 // analysers must be pulled by the graph (Safari) — silently
  sink.connect(ctx.destination)
  const taps = new Map() // key → { track, src, analyser, buf, at }
  const tmp = new Float32Array(1024)

  const tap = (key, track) => {
    const old = taps.get(key)
    if (old?.track === track) return
    if (old) { try { old.src.disconnect() } catch { /* gone */ } }
    taps.delete(key)
    if (!track || track.readyState !== 'live') return
    try {
      const src = ctx.createMediaStreamSource(new MediaStream([track]))
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      src.connect(analyser)
      analyser.connect(sink)
      taps.set(key, { track, src, analyser, buf: new Float32Array(LEN), at: 0, filled: 0 })
    } catch { /* this browser can't tap the track */ }
  }

  const timer = setInterval(() => {
    for (const t of taps.values()) {
      t.analyser.getFloatTimeDomainData(tmp)
      let s = 0
      for (let i = 0; i < tmp.length; i++) s += tmp[i] * tmp[i]
      t.buf[t.at] = Math.sqrt(s / tmp.length)
      t.at = (t.at + 1) % LEN
      t.filled = Math.min(LEN, t.filled + 1)
    }
  }, STEP_MS)

  // The ring buffer in time order.
  const series = (t) => {
    const out = new Float32Array(t.filled)
    const start = (t.at - t.filled + LEN) % LEN
    for (let i = 0; i < t.filled; i++) out[i] = t.buf[(start + i) % LEN]
    return out
  }
  const peak = (arr) => arr.reduce((m, v) => (v > m ? v : m), 0)

  return {
    setSelf: (track) => tap('self', track),
    setPeer: (id, track) => tap(`peer:${id}`, track),
    dropPeer: (id) => tap(`peer:${id}`, null),
    // How loud the loudest person we hear is right now (RMS of the last
    // 50 ms step): whether someone else is talking, for the denoiser.
    peerLevel() {
      let max = 0
      for (const [key, t] of taps) {
        if (!key.startsWith('peer:') || !t.filled) continue
        const v = t.buf[(t.at - 1 + LEN) % LEN]
        if (v > max) max = v
      }
      return max
    },
    // For one person: { source, heard } correlations with lags in ms, and
    // how loud each side got over the window (an idle side proves nothing).
    check(id) {
      const self = taps.get('self'), peer = taps.get(`peer:${id}`)
      if (!self || !peer || self.filled < 80 || peer.filled < 80) return null
      const s = series(self), p = series(peer)
      const n = Math.min(s.length, p.length)
      const sa = s.slice(s.length - n), pa = p.slice(p.length - n)
      const source = correlate(pa, sa, 0, 10)
      const heard = correlate(sa, pa, 2, 30)
      return {
        source: { corr: Number(source.corr.toFixed(2)), lagMs: source.lag * STEP_MS },
        heard: { corr: Number(heard.corr.toFixed(2)), lagMs: heard.lag * STEP_MS },
        selfPeak: Number(peak(sa).toFixed(3)),
        peerPeak: Number(peak(pa).toFixed(3))
      }
    },
    stop() {
      clearInterval(timer)
      for (const t of taps.values()) { try { t.src.disconnect() } catch { /* gone */ } }
      taps.clear()
      ctx.close().catch(() => {})
    }
  }
}
