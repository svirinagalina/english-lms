// Name search that ignores the alphabet: "Марина" finds "Marina",
// "Шатковская" finds "Schatkovskaya", "Yulia" finds "Юлия". Both sides are
// turned into a rough Latin sound key, so the usual transliteration
// variants (sh/sch, ya/ia, y/i/j, v/w, ks/x…) compare as equal.

const CYRILLIC = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'i',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'i', ь: '', э: 'e', ю: 'iu', я: 'ia',
  є: 'e', і: 'i', ї: 'i', ґ: 'g', ў: 'u'
}

export function soundKey(text) {
  let s = String(text ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  s = [...s].map((ch) => CYRILLIC[ch] ?? ch).join('')
  return s
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/shch|tsch|sch|tch|sh|ch|zh|sz|cz/g, 'S') // the hushing sounds, one symbol
    .replace(/kh|h/g, 'X') // Х = Kh = H (Хакмон = Hakmon)
    .replace(/tz|ts|c(?=[eiy])/g, 'C')
    .replace(/ck|c|q/g, 'k')
    .replace(/x/g, 'ks')
    .replace(/ph/g, 'f')
    .replace(/w/g, 'v')
    .replace(/[yj]/g, 'i')
    .replace(/(.)\1+/g, '$1') // Anna = Ана, Kirill = Кирил
    .replace(/ie/g, 'e') // Yelena = Elena
    .replace(/([^aeiou ])i(?=[aou])/g, '$1') // Любовь = Lubov = Lyubov, Мария = Maria
    .trim()
}

// Typed on the wrong keyboard layout: "Fyyf" is "Анна" on the Russian
// layout, "Фттф" is "Anna" on the English one (standard Mac/PC ЙЦУКЕН).
const EN_KEYS = "`qwertyuiop[]asdfghjkl;'zxcvbnm,."
const RU_KEYS = 'ёйцукенгшщзхъфывапролджэячсмитьбю'
const swap = (text, from, to) => [...text].map((ch) => { const i = from.indexOf(ch); return i < 0 ? ch : to[i] }).join('')

// The ways a query may have been meant: as typed, and on the other layout.
function variants(q) {
  const ru = swap(q, EN_KEYS, RU_KEYS)
  const en = swap(q, RU_KEYS, EN_KEYS)
  return [...new Set([q, ru, en])]
}

// The sound keys a query may stand for while it is still being typed: its
// last "i" can turn into a dropped soft sign once the next vowel comes
// ("Мари" before "Мария" = "mara").
function queryKeys(q) {
  const key = soundKey(q)
  if (!key) return []
  return key.length > 1 && key.endsWith('i') ? [key, key.slice(0, -1)] : [key]
}

// True when `query` occurs in any of the texts: as typed (anywhere, so a part
// of an email works), or by sound or keyboard layout from the start of a word
// (Анна = Anna = Fyyf = Фттф), case-insensitive.
export function matchesSearch(query, ...texts) {
  const q = String(query ?? '').trim().toLowerCase()
  if (!q) return true
  const tries = variants(q)
  const keys = tries.flatMap(queryKeys)
  return texts.flat().some((t) => {
    const text = String(t ?? '').toLowerCase()
    if (tries.some((v) => text.includes(v))) return true
    const words = ` ${soundKey(text)}`
    return keys.some((k) => words.includes(` ${k}`))
  })
}
