import nspell from 'nspell'

// English spell-checking for Writing: Hunspell's en_US dictionary (served
// from /dict, ~550 KB, fetched once on first use) through nspell.
let loading = null
export function loadSpeller() {
  if (!loading) {
    loading = Promise.all(['/dict/en_US.aff', '/dict/en_US.dic'].map((url) => fetch(url).then((r) => {
      if (!r.ok) throw new Error(`dictionary ${r.status}`)
      return r.text()
    })))
      .then(([aff, dic]) => nspell(aff, dic))
      .catch((err) => { loading = null; throw err })
  }
  return loading
}

// Is this a word to judge at all? Names, abbreviations and numbers are left alone.
const checkable = (word) => /^[A-Za-z][a-z']*$/.test(word) && word.length > 1

export function isMisspelled(speller, word) {
  if (!speller || !checkable(word)) return false
  const clean = word.replace(/'+$/, '')
  return !speller.correct(clean) && !speller.correct(clean.toLowerCase())
}

// A single obvious fix (one swapped, missing or extra letter) — the only
// kind worth changing without asking.
export function obviousFix(speller, word) {
  if (!isMisspelled(speller, word) || word.length < 4) return null
  const suggestions = speller.suggest(word).filter((s) => !/[\s-]/.test(s))
  if (suggestions.length !== 1) return null
  const fix = suggestions[0]
  return editDistance(word.toLowerCase(), fix.toLowerCase()) === 1 ? matchCase(word, fix) : null
}

const matchCase = (word, fix) => (word[0] === word[0].toUpperCase() ? fix[0].toUpperCase() + fix.slice(1) : fix)

// Damerau–Levenshtein (a swap of two neighbours counts as one edit).
function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
    }
  }
  return d[a.length][b.length]
}
