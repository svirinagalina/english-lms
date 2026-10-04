import { Router } from 'express'
import { requireAuth } from '../auth.js'
import { prisma } from '../db.js'
import { assistantEnabled, translateRussian, translateWords, wordGrammar } from '../assistant.js'
import { guardedFetch } from '../resilience.js'

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
const USER_AGENT = 'AdventAcademyLMS/1.0 (https://lms.advent-academy.online)'

// Russian senses per part of speech from Google's dictionary data:
// [{ pos: 'noun', translations: ['учитель', 'преподаватель'] }, …]
async function googleSenses(word) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ru&dt=t&dt=bd&q=${encodeURIComponent(word)}`
  const response = await guardedFetch(`dictionary:${new URL(url).host}`, url, {}, { timeoutMs: 6000 })
  if (!response.ok) return { senses: [], main: null }
  const data = await response.json()
  const senses = Array.isArray(data?.[1])
    ? data[1].map((entry) => ({ pos: entry[0], translations: (entry[1] ?? []).slice(0, 5) })).filter((s) => s.translations.length).slice(0, 4)
    : []
  return { senses, main: data?.[0]?.[0]?.[0] ?? null }
}

// IPA from the English section of the word's Wiktionary page (US
// pronunciation when it is listed separately, else the first one).
async function wiktionaryIpa(word) {
  const url = `https://en.wiktionary.org/w/api.php?action=parse&page=${encodeURIComponent(word)}&prop=wikitext&format=json&formatversion=2&redirects=1`
  const response = await guardedFetch(`dictionary:${new URL(url).host}`, url, { headers: { 'User-Agent': USER_AGENT } }, { timeoutMs: 6000 })
  if (!response.ok) return null
  const text = (await response.json())?.parse?.wikitext ?? ''
  const english = text.split(/\n==[^=]/)[0] || text
  const section = english.includes('==English==') ? english : (text.match(/==English==[\s\S]*?(?=\n==[^=]|$)/)?.[0] ?? '')
  // One IPA per line, with the accent read from the line (it may sit in
  // the IPA template itself, in {{a|US}}, or in {{enPR|…|a=US}} before it).
  const found = []
  const AMERICAN = /\b(GA|GenAm|US|General American|cot-caught|non-trap-bath)\b/
  let group = '' // the "* {{a|US}}" heading that "**" sub-bullets belong to
  let lastTop = -1
  for (const line of section.split('\n')) {
    const sub = line.startsWith('**')
    if (!sub && line.startsWith('*')) group = line
    const m = line.match(/\{\{IPA\|en\|([^}]*)\}\}/)
    if (!m) continue
    const phonemic = m[1].split('|').find((part) => part.startsWith('/'))
    const american = AMERICAN.test(sub ? `${group} ${line}` : line)
    if (!phonemic) {
      // A US sub-variant given only phonetically: its parent's phonemes are American.
      if (sub && american && lastTop >= 0) found[lastTop].american = true
      continue
    }
    found.push({ phonemic, american })
    if (!sub) lastTop = found.length - 1
  }
  if (!found.length) return null
  return (found.find((f) => f.american) ?? found[0]).phonemic
}

async function lookup(word) {
  const [ai, google, ipa] = await Promise.all([
    assistantEnabled() ? translateWords([word]).then(([item]) => item ?? null).catch(() => null) : null,
    googleSenses(word).catch(() => ({ senses: [], main: null })),
    wiktionaryIpa(word).catch(() => null)
  ])
  let translation = ai?.translation ?? null
  if (!translation && google.senses.length) translation = google.senses.map((s) => `${s.pos}: ${s.translations.slice(0, 4).join(', ')}`).slice(0, 3).join(' · ')
  if (!translation) translation = google.main
  // Nothing but the word itself back, and no pronunciation: not a word we know.
  if (!google.senses.length && !ipa && !ai && (translation ?? '').trim().toLowerCase() === word) throw new Error('No entry for this word')
  if (!translation) {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|ru`
    const response = await guardedFetch(`dictionary:${new URL(url).host}`, url, {}, { timeoutMs: 6000 })
    if (!response.ok) throw new Error('Dictionary unavailable')
    const data = await response.json()
    const text = data?.responseData?.translatedText
    if (!text || /MYMEMORY WARNING|QUERY LENGTH/i.test(text)) throw new Error('No translation')
    translation = text
  }
  return {
    word,
    translation,
    transcription: ai?.transcription ?? ipa ?? null,
    senses: google.senses,
    audio: `/api/dictionary/audio?word=${encodeURIComponent(word)}`
  }
}

export const cleanWord = (raw) => String(raw ?? '').trim().toLowerCase().replace(/[^a-z'’-]/g, '')

// The full entry for a word, cached; used by the hover tip and "My words".
export async function lookupEntry(word) {
  if (FIXED[word]) return { word, translation: FIXED[word], transcription: null, senses: [], audio: `/api/dictionary/audio?word=${encodeURIComponent(word)}` }
  if (cache.has(word)) return cache.get(word)
  const entry = await lookup(word)
  if (cache.size >= MAX_CACHE) cache.clear()
  cache.set(word, entry)
  return entry
}

dictionaryRouter.get('/', async (req, res) => {
  const word = cleanWord(req.query.word)
  if (!word || word.length > 40) return res.status(400).json({ error: 'A single English word is expected' })
  try {
    const entry = await lookupEntry(word)
    // Whether this person already has the word in their own vocabulary.
    const saved = await prisma.vocabCard.findFirst({
      where: { set: { ownerId: req.user.id }, term: { equals: word, mode: 'insensitive' } },
      select: { id: true }
    })
    res.json({ ...entry, saved: Boolean(saved) })
  } catch (error) {
    res.status(502).json({ error: error.message })
  }
})

// The teacher's dictionary: any word or phrase, either way. Russian gives
// English equivalents (IPA, a note on usage); English gives the usual entry.
const ruCache = new Map()
async function googleRussian(text) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ru&tl=en&dt=t&dt=bd&q=${encodeURIComponent(text)}`
  const response = await guardedFetch(`dictionary:${new URL(url).host}`, url, {}, { timeoutMs: 6000 })
  if (!response.ok) throw new Error('Dictionary unavailable')
  const data = await response.json()
  const items = []
  for (const [pos, words] of Array.isArray(data?.[1]) ? data[1] : []) {
    for (const english of (words ?? []).slice(0, 3)) items.push({ english, transcription: '', pos, note: '' })
  }
  const main = data?.[0]?.[0]?.[0]
  if (!items.length && main) items.push({ english: main, transcription: '', pos: '', note: '' })
  return items.slice(0, 6)
}
const grammarCache = new Map()
async function grammarOf(word) {
  if (grammarCache.has(word)) return grammarCache.get(word)
  const grammar = await wordGrammar(word).catch(() => null)
  if (grammar) {
    if (grammarCache.size >= MAX_CACHE) grammarCache.clear()
    grammarCache.set(word, grammar)
  }
  return grammar
}

dictionaryRouter.get('/translate', async (req, res) => {
  const text = String(req.query.q ?? '').trim().replace(/\s+/g, ' ')
  if (!text || text.length > 80) return res.status(400).json({ error: 'Type a word or a short phrase' })
  try {
    if (/[а-яё]/i.test(text)) {
      const key = text.toLowerCase()
      let items = ruCache.get(key)
      if (!items) {
        items = assistantEnabled() ? await translateRussian(text).catch(() => []) : []
        if (!items.length) items = await googleRussian(text)
        if (ruCache.size >= MAX_CACHE) ruCache.clear()
        if (items.length) ruCache.set(key, items)
      }
      const withAudio = items.map((item) => ({ ...item, audio: `/api/dictionary/audio?word=${encodeURIComponent(item.english)}` }))
      return res.json({ direction: 'ru-en', query: text, items: withAudio })
    }
    const word = text.toLowerCase()
    const [entry, grammar] = await Promise.all([
      lookupEntry(word),
      assistantEnabled() ? grammarOf(word) : null
    ])
    res.json({ direction: 'en-ru', query: text, entry, grammar })
  } catch (error) {
    res.status(502).json({ error: error.message })
  }
})

// Pronunciation: Google's text-to-speech clip, fetched by the server (the
// browser cannot load it directly) and kept in memory for repeat plays.
const audioCache = new Map()
const MAX_AUDIO_CACHE = 2000
dictionaryRouter.get('/audio', async (req, res) => {
  // A phrase card keeps its spaces ("give up"), or it would be read as one word.
  const word = String(req.query.word ?? '').trim().toLowerCase().replace(/[^a-z'’ -]/g, '').replace(/\s+/g, ' ').trim()
  if (!word || word.length > 80) return res.status(400).end()
  try {
    let clip = audioCache.get(word)
    if (!clip) {
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(word)}&tl=en&client=tw-ob`
      const response = await guardedFetch(`dictionary:${new URL(url).host}`, url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, { timeoutMs: 8000 })
      if (!response.ok) return res.status(502).end()
      clip = Buffer.from(await response.arrayBuffer())
      if (audioCache.size >= MAX_AUDIO_CACHE) audioCache.clear()
      audioCache.set(word, clip)
    }
    res.set('Content-Type', 'audio/mpeg')
    res.set('Cache-Control', 'private, max-age=2592000')
    res.send(clip)
  } catch {
    res.status(502).end()
  }
})
