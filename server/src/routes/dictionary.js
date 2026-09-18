import { Router } from 'express'
import { requireAuth } from '../auth.js'
import { assistantEnabled, translateWords } from '../assistant.js'

// Hover dictionary: one English word → Russian, with IPA when the AI
// assistant is configured. Results are cached for the life of the process.
export const dictionaryRouter = Router()
dictionaryRouter.use(requireAuth)

const cache = new Map()
const MAX_CACHE = 5000

async function lookup(word) {
  if (assistantEnabled()) {
    const [item] = await translateWords([word])
    if (item) return { word, translation: item.translation, transcription: item.transcription }
  }
  // Free fallback without a key: MyMemory's public endpoint.
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
