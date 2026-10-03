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

// True when `query` occurs in any of the texts, as typed or by sound.
export function matchesSearch(query, ...texts) {
  const q = String(query ?? '').trim().toLowerCase()
  if (!q) return true
  const qKey = soundKey(q)
  return texts.flat().some((t) => {
    const text = String(t ?? '').toLowerCase()
    return text.includes(q) || (qKey && soundKey(text).includes(qKey))
  })
}
