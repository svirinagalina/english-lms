import { Router } from 'express'
import { requireAuth } from '../auth.js'
import { assistantEnabled, translateWords } from '../assistant.js'

// Hover dictionary: one English word → Russian, with IPA when the AI
// assistant is configured. Results are cached for the life of the process.
export const dictionaryRouter = Router()
dictionaryRouter.use(requireAuth)

// Function words and verb forms the online dictionaries get wrong.
const FIXED = {
  am: 'быть (форма глагола to be: I am — я есть)', is: 'быть (форма to be: he/she/it is)', are: 'быть (форма to be: you/we/they are)',
  was: 'был / была / было (past of to be)', were: 'были (past of to be)', be: 'быть', been: 'был (participle of to be)', being: 'будучи; существо',
  a: 'неопределённый артикль', an: 'неопределённый артикль (перед гласной)', the: 'определённый артикль',
  do: 'делать; вспомогательный глагол', does: 'делает; вспомогательный глагол (he/she/it)', did: 'делал; вспомогательный глагол (past)',
  have: 'иметь; вспомогательный глагол', has: 'имеет; вспомогательный глагол (he/she/it)', had: 'имел; вспомогательный глагол (past)',
  will: 'будущее время (will + verb)', would: 'бы; would + verb', shall: 'будущее время / предложение (shall we…?)',
  can: 'мочь, уметь', could: 'мог; мог бы', may: 'может (разрешение / вероятность)', might: 'мог бы, возможно', must: 'должен',
  should: 'следует, должен (совет)', ought: 'следует (ought to)', to: 'к, в; частица инфинитива', of: 'предлог родительного падежа (of)',
  i: 'я', you: 'ты, вы', he: 'он', she: 'она', it: 'оно, это', we: 'мы', they: 'они', me: 'меня, мне', him: 'его, ему', her: 'её, ей', us: 'нас, нам', them: 'их, им',
  my: 'мой', your: 'твой, ваш', his: 'его', its: 'его / её (о неодушевлённом)', our: 'наш', their: 'их',
  not: 'не', no: 'нет; никакой', yes: 'да', and: 'и', or: 'или', but: 'но', so: 'так; поэтому', if: 'если', than: 'чем', then: 'тогда, затем',
  there: 'там; there is/are — есть, имеется', here: 'здесь', this: 'этот', that: 'тот; что (союз)', these: 'эти', those: 'те'
}
const cache = new Map()
const MAX_CACHE = 5000

async function lookup(word) {
  if (assistantEnabled()) {
    const [item] = await translateWords([word])
    if (item) return { word, translation: item.translation, transcription: item.transcription }
  }
  // Without a key: Google's public translate endpoint, with its dictionary
  // senses (a few per part of speech) — far better for single words than a
  // translation-memory hit like "см." for "see".
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ru&dt=t&dt=bd&q=${encodeURIComponent(word)}`
    const response = await fetch(url, { signal: AbortSignal.timeout(6000) })
    if (response.ok) {
      const data = await response.json()
      const senses = Array.isArray(data?.[1])
        ? data[1].map((entry) => `${entry[0]}: ${(entry[1] ?? []).slice(0, 4).join(', ')}`).slice(0, 3)
        : []
      const main = data?.[0]?.[0]?.[0]
      const translation = senses.length ? senses.join(' · ') : main
      if (translation) return { word, translation, transcription: null }
    }
  } catch { /* fall through */ }
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|ru`
  const response = await fetch(url, { signal: AbortSignal.timeout(6000) })
  if (!response.ok) throw new Error('Dictionary unavailable')
  const data = await response.json()
  const translation = data?.responseData?.translatedText
  if (!translation || /MYMEMORY WARNING|QUERY LENGTH/i.test(translation)) throw new Error('No translation')
  return { word, translation, transcription: null }
}

dictionaryRouter.get('/', async (req, res) => {
  const word = String(req.query.word ?? '').trim().toLowerCase().replace(/[^a-z'’-]/g, '')
  if (!word || word.length > 40) return res.status(400).json({ error: 'A single English word is expected' })
  if (FIXED[word]) return res.json({ word, translation: FIXED[word], transcription: null })
  if (cache.has(word)) return res.json(cache.get(word))
  try {
    const entry = await lookup(word)
    if (cache.size >= MAX_CACHE) cache.clear()
    cache.set(word, entry)
    res.json(entry)
  } catch (error) {
    res.status(502).json({ error: error.message })
  }
})
