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

let americanVoice // undefined: not checked yet; null: checked, none installed
async function getAmericanVoice() {
  if (americanVoice === undefined) {
    const voices = await loadVoices()
    americanVoice = voices.find((v) => v.lang === 'en-US') ?? voices.find((v) => v.lang?.toLowerCase().startsWith('en-us')) ?? null
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
