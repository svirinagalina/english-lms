// The school's payment details are stored as one text field. New saves put
// structured JSON in it; older plain text is read heuristically, so nothing
// a teacher wrote before is lost.
export const emptyDetails = () => ({ card: '', cardNote: '', link: '', note: '' })

export function parseDetails(raw) {
  if (!raw) return emptyDetails()
  try {
    const data = JSON.parse(raw)
    if (data && typeof data === 'object') return { ...emptyDetails(), ...data }
  } catch { /* plain text from before */ }
  const details = emptyDetails()
  let text = String(raw)
  const card = text.match(/(?:\d[ \-]?){13,19}/)?.[0]?.trim()
  if (card) { details.card = card.replace(/[ \-]/g, ''); text = text.replace(card, '') }
  const link = text.match(/https?:\/\/\S+/)?.[0]
  if (link) { details.link = link; text = text.replace(link, '') }
  // Lines that only introduced the card or the link ("In euro:") go with them.
  details.note = text.split('\n').map((l) => l.trim()).filter((l) => l && !/[:：]\s*$/.test(l) && !/^(in euro|в евро|card|карта)\b/i.test(l)).join('\n')
  return details
}

export const serializeDetails = (d) => {
  const clean = { card: (d.card ?? '').replace(/[ \-]/g, ''), cardNote: (d.cardNote ?? '').trim(), link: (d.link ?? '').trim(), note: (d.note ?? '').trim() }
  return Object.values(clean).some(Boolean) ? JSON.stringify(clean) : null
}

// "2200000000000000" → "2200 0000 0000 0000"
export const formatCard = (digits) => String(digits ?? '').replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1 ').trim()

// Everything as one text, for "Copy all details".
export const detailsAsText = (d) => [
  d.card && `Card: ${formatCard(d.card)}${d.cardNote ? ` (${d.cardNote})` : ''}`,
  d.link && `Pay online: ${d.link}`,
  d.note
].filter(Boolean).join('\n')
