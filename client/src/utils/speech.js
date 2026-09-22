// Pronunciation via the browser's own speech synthesis, specifically an
// American English voice — the server's audio clip (Google Translate's
// classic TTS endpoint) turned out to be one fixed voice no matter what
// language/region parameters or Google domain the request used (tested:
// identical audio bytes from translate.google.com and translate.google.co.uk),
// so there was no way to ask it for US over UK. This asks the OS/browser for
// a voice actually tagged en-US instead.
let voicesPromise = null
function loadVoices() {
  if (!voicesPromise) {
    voicesPromise = new Promise((resolve) => {
      const synth = window.speechSynthesis
      if (!synth) { resolve([]); return }
      const existing = synth.getVoices()
      if (existing.length) { resolve(existing); return }
      // Chrome loads voices asynchronously; a widely-used pattern is to wait
      // for this event once, with a timeout for a browser that never fires it.
      const onChange = () => { synth.removeEventListener('voiceschanged', onChange); resolve(synth.getVoices()) }
      synth.addEventListener('voiceschanged', onChange)
      setTimeout(() => { synth.removeEventListener('voiceschanged', onChange); resolve(synth.getVoices()) }, 500)
    })
  }
  return voicesPromise
}

// macOS/iOS bundle a set of "novelty" system voices alongside the normal
// ones (Bahh, Zarvox, Albert…) — picking one blind ("just take the first
// en-US voice") got one for a student and came back sounding, per her
// teacher, "like someone gasping for air." None of these are ever wanted
// for pronunciation.
const NOVELTY_VOICES = new Set([
  'albert', 'bad news', 'bahh', 'bells', 'boing', 'bubbles', 'cellos',
  'deranged', 'good news', 'hysterical', 'jester', 'organ', 'pipe organ',
  'superstar', 'trinoids', 'whisper', 'wobble', 'zarvox'
])
// Known-good voices, preferred in this order when more than one is
// available — otherwise it's whichever the browser happens to list first.
const PREFERRED_VOICE_MARKERS = ['samantha', 'google us english', 'natural', 'ava', 'allison', 'nicky', 'susan', 'zoe', 'aaron', 'alex', 'microsoft']
// Web Speech API voices carry no gender field, only a name — these are the
// common OS/browser voice names that read as clearly one gender or the
// other, used to pick two distinct voices for a two-person dialogue.
const FEMALE_MARKERS = ['samantha', 'zira', 'susan', 'zoe', 'ava', 'allison', 'nicky', 'victoria', 'karen', 'moira', 'tessa', 'female', 'jenny', 'aria']
const MALE_MARKERS = ['alex', 'david', 'daniel', 'fred', 'aaron', 'tom', 'male', 'guy', 'eric', 'christopher']

async function usableVoices() {
  const voices = await loadVoices()
  return voices
    .filter((v) => v.lang === 'en-US' || v.lang?.toLowerCase().startsWith('en-us'))
    .filter((v) => !NOVELTY_VOICES.has(v.name.trim().toLowerCase()))
}

let americanVoice // undefined: not checked yet; null: checked, none installed
async function getAmericanVoice() {
  if (americanVoice === undefined) {
    const usable = await usableVoices()
    americanVoice = usable.find((v) => PREFERRED_VOICE_MARKERS.some((m) => v.name.toLowerCase().includes(m))) ?? usable[0] ?? null
  }
  return americanVoice
}

// Two distinct voices for a two-person dialogue — a female-sounding one and
// a male-sounding one where the installed voice list allows it, otherwise
// whatever distinct voices are available, otherwise the same voice twice.
let voicePair // undefined: not checked yet
async function getVoicePair() {
  if (voicePair === undefined) {
    const usable = await usableVoices()
    const female = usable.find((v) => FEMALE_MARKERS.some((m) => v.name.toLowerCase().includes(m)))
    const male = usable.find((v) => MALE_MARKERS.some((m) => v.name.toLowerCase().includes(m)))
    const primary = female ?? male ?? usable[0] ?? null
    const secondary = (male !== primary ? male : null) ?? usable.find((v) => v !== primary) ?? primary
    voicePair = primary ? [primary, secondary] : null
  }
  return voicePair
}

// Chrome silently stops (without firing onend) any utterance running past
// ~15s unless something keeps nudging the synth — a long listening script
// would just go quiet partway through and leave the Play button stuck.
// Bumping pause/resume every few seconds is the standard workaround.
function startKeepAlive(synth) {
  return setInterval(() => {
    if (!synth.speaking) return
    synth.pause()
    synth.resume()
  }, 5000)
}

// Speaks `word` in an American voice and calls `onEnd` when done; resolves
// true if it could (the caller should stop there), false if this browser has
// no en-US voice at all, so the caller should fall back to its own audio.
export async function speakAmerican(word, onEnd) {
  const synth = window.speechSynthesis
  if (!synth) return false
  const voice = await getAmericanVoice()
  if (!voice) return false
  synth.cancel()
  const utterance = new SpeechSynthesisUtterance(word)
  utterance.voice = voice
  utterance.lang = 'en-US'
  const keepAlive = startKeepAlive(synth)
  const stop = () => { clearInterval(keepAlive); onEnd?.() }
  utterance.onend = stop
  utterance.onerror = stop
  synth.speak(utterance)
  return true
}

// Speaks a two-person dialogue, one voice per speaker, in order — so a
// listening-practice script doesn't come out as one voice talking to
// itself. `lines` is [{ speaker, text }]; `speaker` is just a label used to
// keep the same voice for the same person throughout, not spoken aloud.
// Resolves the same way speakAmerican does.
export async function speakDialogue(lines, onEnd) {
  const synth = window.speechSynthesis
  if (!synth) return false
  const voices = await getVoicePair()
  if (!voices) return false
  synth.cancel()

  if (lines.length === 0) { onEnd?.(); return true }

  const speakerVoice = new Map()
  let nextVoice = 0
  const voiceFor = (speaker) => {
    if (!speakerVoice.has(speaker)) { speakerVoice.set(speaker, voices[nextVoice % voices.length]); nextVoice++ }
    return speakerVoice.get(speaker)
  }

  const keepAlive = startKeepAlive(synth)
  let remaining = lines.length
  const finishOne = () => { remaining--; if (remaining === 0) { clearInterval(keepAlive); onEnd?.() } }

  for (const line of lines) {
    const utterance = new SpeechSynthesisUtterance(line.text)
    utterance.voice = voiceFor(line.speaker)
    utterance.lang = 'en-US'
    utterance.onend = finishOne
    utterance.onerror = finishOne
    synth.speak(utterance)
  }
  return true
}
