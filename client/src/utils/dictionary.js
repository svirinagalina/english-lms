import { api } from '../api'

// Hover dictionary shared by the board and the writing editor: looks a
// word up once, remembers the answer, ignores anything that is not a word.
const cache = new Map()
const WORD = /^[A-Za-z][A-Za-z'’-]{1,}$/

export const isEnglishWord = (word) => WORD.test(word)

export async function lookupWord(raw) {
  const word = String(raw ?? '').replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '').toLowerCase()
  if (!isEnglishWord(word)) return null
  if (cache.has(word)) return cache.get(word)
  const promise = api.dictionary(word).catch(() => null)
  cache.set(word, promise)
  const result = await promise
  cache.set(word, result)
  return result
}

// The word around `index` in `text` (letters and apostrophes only).
export function wordAt(text, index) {
  const isLetter = (ch) => /[A-Za-z'’-]/.test(ch)
  if (!text || index < 0 || index >= text.length || !isLetter(text[index])) return null
  let start = index
  let end = index
  while (start > 0 && isLetter(text[start - 1])) start--
  while (end < text.length - 1 && isLetter(text[end + 1])) end++
  return { word: text.slice(start, end + 1), start, end: end + 1 }
}
