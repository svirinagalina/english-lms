// One search for everything from Google Drive — the «Google Drive» panel in
// the cabinet and the board's audio picker — so the same words find the same
// files in both (Galina 2026-11-20: «один в один как в кабинете»).
// Every word must be in the name or in the folders it sits in: «unit 2
// speakout» finds «Unit 2.pdf» inside «Speakout».
export function driveMatches(item, query) {
  const words = String(query ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean)
  const hay = `${item.folder ?? ''} ${item.name}`.toLowerCase()
  return words.every((w) => hay.includes(w))
}

// Where a found file sits, as the panel says it.
export const driveWhere = (item) => (item.outside ? (item.folder ? `in ${item.folder}` : 'in My Drive') : `in English LMS${item.folder ? ` / ${item.folder}` : ''}`)
