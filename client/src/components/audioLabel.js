// Textbook audio files carry the book's name first and the useful part last:
// "SO_Adv_extra_plus_2e_CLCD_U07_R07.mp3" is Unit 7, track 7. The picker shows
// that short label and lets the teacher search "7 7", "u7 r7", "unit 7 track 7".

const num = (s) => (s == null ? null : Number.parseInt(s, 10))

export function parseAudioName(fileName) {
  const base = String(fileName ?? '').replace(/\.[a-z0-9]{2,4}$/i, '')
  let unit = num(base.match(/(?:^|[^a-z])(?:unit|u)[\s_.-]*0*(\d{1,3})(?!\d)/i)?.[1])
  let track = num(base.match(/(?:^|[^a-z])(?:track|tr|t|r)[\s_.-]*0*(\d{1,3})(?!\d)/i)?.[1])
  const cd = num(base.match(/(?:^|[^a-z])cd[\s_.-]*0*(\d{1,2})(?!\d)/i)?.[1])
  if (unit == null && track == null) {
    // "1.07", "1-07", "01_07" at the very end: unit and track.
    const pair = base.match(/(?:^|\D)(\d{1,2})[._-](\d{1,3})\s*$/)
    if (pair) { unit = num(pair[1]); track = num(pair[2]) }
    else track = num(base.match(/(\d{1,3})\D*$/)?.[1])
  }
  const parts = []
  if (cd != null && unit == null) parts.push(`CD ${cd}`)
  if (unit != null) parts.push(`Unit ${unit}`)
  if (track != null) parts.push(`Track ${track}`)
  return { unit, track, label: parts.length ? parts.join(' · ') : base }
}

export function describeAudio(items) {
  return items.map((item) => ({ ...item, ...parseAudioName(item.name) }))
    .sort((a, b) => (a.folder ?? '').localeCompare(b.folder ?? '', undefined, { numeric: true })
      || (a.unit ?? 1e9) - (b.unit ?? 1e9)
      || (a.track ?? 1e9) - (b.track ?? 1e9)
      || a.name.localeCompare(b.name, undefined, { numeric: true }))
}

export function audioMatches(item, query) {
  const q = query.trim().toLowerCase()
    .replace(/(^|\s)(?:unit|юнит|урок)\s*/g, '$1u')
    .replace(/(^|\s)(?:track|трек|аудио)\s*/g, '$1t')
  if (!q) return true
  const tokens = q.split(/[\s,]+/).filter(Boolean)
  const numbers = tokens.flatMap((t) => (/^\d+([./-]\d+)?$/.test(t) ? t.split(/[./-]/) : [t]))
  if (numbers.every((t) => /^\d+$/.test(t)) && numbers.length <= 2) {
    const [a, b] = numbers.map(Number)
    if (b != null) return item.unit === a && item.track === b
    return item.unit != null ? item.unit === a : item.track === a
  }
  const hay = `${item.label} ${item.name} ${item.folder ?? ''}`.toLowerCase()
  return tokens.every((t) => {
    const u = t.match(/^u0*(\d+)$/)
    if (u) return item.unit === Number(u[1])
    const tr = t.match(/^[tr]0*(\d+)$/)
    if (tr) return item.track === Number(tr[1])
    if (/^\d+$/.test(t) && (item.unit != null || item.track != null)) return item.unit === Number(t) || item.track === Number(t)
    return hay.includes(t)
  })
}
