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

let americanVoice // undefined: not checked yet; null: checked, none installed
async function getAmericanVoice() {
  if (americanVoice === undefined) {
    const voices = await loadVoices()
    const usable = voices
      .filter((v) => v.lang === 'en-US' || v.lang?.toLowerCase().startsWith('en-us'))
      .filter((v) => !NOVELTY_VOICES.has(v.name.trim().toLowerCase()))
    americanVoice = usable.find((v) => PREFERRED_VOICE_MARKERS.some((m) => v.name.toLowerCase().includes(m))) ?? usable[0] ?? null
  }
  return americanVoice
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
  utterance.onend = () => onEnd?.()
  utterance.onerror = () => onEnd?.()
  synth.speak(utterance)
  return true
}
