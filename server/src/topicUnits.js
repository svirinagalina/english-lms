import { prisma } from './db.js'
import { TOPICS } from './errorAnalysis.js'

// Which textbook chapters teach a topic. Rule-based topics are keys in
// TOPICS and map through exercise tags; AI labels ("Present Perfect vs
// Past Simple") are matched against chapter titles by their key words.
const TITLE_KEYS = [
  ['present perfect continuous', /PRESENT PERFECT CONTINUOUS/],
  ['present perfect', /PRESENT PERFECT/],
  ['past perfect', /PAST PERFECT/],
  ['present continuous', /PRESENT CONTINUOUS/],
  ['past continuous', /PAST CONTINUOUS/],
  ['present simple', /PRESENT SIMPLE/],
  ['past simple', /PAST SIMPLE/],
  ['future', /FUTURE|БУДУЩ/],
  ['going to', /БУДУЩ/],
  ['conditional', /CONDITIONAL/],
  ['if ', /CONDITIONAL/],
  ['used to', /USED TO/],
  ['modal', /MODAL|МОДАЛЬН|MUST|MAY|CAN VS COULD/],
  ['must', /MUST|МОДАЛЬН/],
  ['should', /SHOULD|МОДАЛЬН/],
  ['can ', /CAN VS COULD|МОДАЛЬН/],
  ['could', /CAN VS COULD|МОДАЛЬН/],
  ['have to', /HAVE TO|МОДАЛЬН/],
  ['article', /ARTICLES|АРТИКЛ/],
  ['a/an', /ARTICLES|АРТИКЛ/],
  ['the ', /ARTICLES|АРТИКЛ/],
  ['passive', /PASSIVE/],
  ['relative', /RELATIVE/],
  ['reported', /REPORTED/],
  ['gerund', /ГЕРУНД/],
  ['infinitive', /ИНФИНИТИВ/],
  ['-ing', /ГЕРУНД|CONTINUOUS/],
  ['participle', /PARTICIPLES/],
  ['preposition', /ПРЕДЛОГ/],
  ['there is', /THERE IS/],
  ['it ', /МЕСТОИМЕНИЕ IT/],
  ['3rd person', /PRESENT SIMPLE/],
  ['third person', /PRESENT SIMPLE/],
  ['-s ending', /PRESENT SIMPLE/],
  ['do / does', /PRESENT SIMPLE/],
  ['to be', /THERE IS|PRESENT SIMPLE/],
  ['verb to be', /THERE IS|PRESENT SIMPLE/]
]

let cache = { schoolId: null, at: 0, units: [] }

async function unitsOf(schoolId) {
  if (cache.schoolId === schoolId && Date.now() - cache.at < 10 * 60 * 1000) return cache.units
  const units = await prisma.unit.findMany({ where: { schoolId }, select: { id: true, title: true, position: true }, orderBy: { position: 'asc' } })
  cache = { schoolId, at: Date.now(), units }
  return units
}

// The grammar in the correct sentence itself says which chapter fits best:
// "I was going" is Past Continuous whatever the classifier called the slip.
const SENTENCE_KEYS = [
  [/\b(have|has|'ve|'s) been \w+ing\b/i, /PRESENT PERFECT CONTINUOUS/],
  [/\bhad been \w+ing\b/i, /PAST PERFECT CONTINUOUS/],
  [/\b(was|were|wasn't|weren't) (not )?\w+ing\b/i, /PAST CONTINUOUS/],
  [/\b(am|is|are|'m|'re|isn't|aren't) (not )?\w+ing\b/i, /PRESENT CONTINUOUS/],
  [/\bif\b|\bunless\b|\bwould\b/i, /CONDITIONAL/],
  [/\bhad (not |never |already |just )?\w+(ed|en|t|ne|wn)\b/i, /PAST PERFECT/],
  [/\b(have|has|'ve|haven't|hasn't) (not |never |already |just |ever )?(\w+ed|been|gone|done|seen|made|taken|given|written|eaten|forgotten|lost|left|met|read|said|told|thought|bought|brought|caught|taught|found|known|shown|broken|chosen|driven|fallen|flown|grown|known|spoken|worn|won|run|come|become|begun|drunk|sung|swum|put|cut|hit|let|set|shut|paid|sent|spent|built|felt|kept|slept|held|stood|understood|heard|got|gotten|sat|sold|stuck|struck|woken)\b/i, /PRESENT PERFECT/],
  [/\b(will|'ll|won't|shall|going to)\b/i, /FUTURE|БУДУЩ/],
  [/\bused to\b/i, /USED TO/],
  [/\b(must|should|can|can't|could|may|might|have to|has to|had to|ought)\b/i, /MODAL|МОДАЛЬН/],
  [/\b(is|are|was|were|be|been|being) \w+(ed|en)\b( by\b)?/i, /PASSIVE/],
  [/\b(said that|told (me|him|her|us|them)|asked (if|whether))\b/i, /REPORTED/],
  [/\b\w+ (who|which|whose|where) \b/i, /RELATIVE/],
  [/\bthere (is|are|was|were)\b/i, /THERE IS/],
  [/\b(did|didn't|\w+ed|went|saw|came|took|made|got|gave|found|thought|told|said|knew|became|left|felt|brought|began|kept|held|wrote|stood|heard|let|meant|met|ran|paid|sat|spoke|lay|led|read|grew|lost|fell|sent|built|understood|drew|broke|spent|cut|rose|drove|bought|wore|chose|ate|drank|flew|forgot|sold|won|slept|threw|caught|taught|hit|shut|put|swam|sang|rang|woke)\b/i, /PAST SIMPLE/],
  [/\b(do|does|don't|doesn't)\b|\b\w+s\b every\b/i, /PRESENT SIMPLE/]
]

// Chapters for one mistake: from the correct sentence first, then its topics.
export async function unitsForMistake(schoolId, correct, topics, topicUnits) {
  const units = await unitsOf(schoolId)
  const found = []
  for (const [sentencePattern, titlePattern] of SENTENCE_KEYS) {
    if (!sentencePattern.test(correct)) continue
    for (const u of units) if (titlePattern.test(u.title) && !found.some((f) => f.id === u.id)) found.push({ id: u.id, title: u.title })
    if (found.length) break
  }
  // Articles and prepositions are about words, not the tense: add their chapter when the topic says so.
  if (/article|артикл|a\/an/i.test(topics.join(' '))) for (const u of units) if (/ARTICLES|АРТИКЛ/.test(u.title) && !found.some((f) => f.id === u.id)) found.push({ id: u.id, title: u.title })
  if (/preposition|предлог/i.test(topics.join(' '))) for (const u of units) if (/ПРЕДЛОГ/.test(u.title) && !found.some((f) => f.id === u.id)) found.push({ id: u.id, title: u.title })
  if (found.length) return found.slice(0, 2)
  return topics.flatMap((t) => topicUnits.get(t) ?? []).filter((u, i, a) => a.findIndex((x) => x.id === u.id) === i).slice(0, 2)
}

// Map: topic → [{ id, title }] (up to two chapters each).
export async function unitsForTopics(schoolId, topics) {
  const result = new Map()
  const unique = [...new Set(topics)]
  if (!unique.length) return result
  const units = await unitsOf(schoolId)

  // Labels (of rule-based topics too) against chapter titles first — the
  // textbook's own naming beats tag statistics.
  for (const topic of unique) {
    const lower = (TOPICS[topic]?.label ?? topic).toLowerCase()
    const found = []
    for (const [needle, pattern] of TITLE_KEYS) {
      if (!lower.includes(needle)) continue
      for (const u of units) if (pattern.test(u.title) && !found.some((f) => f.id === u.id)) found.push({ id: u.id, title: u.title })
      if (found.length >= 2) break
    }
    if (found.length) result.set(topic, found.slice(0, 2))
  }

  // Rule-based keys still unmapped: the chapters whose exercises carry the tag most.
  const keyed = unique.filter((t) => TOPICS[t] && !result.has(t))
  if (keyed.length) {
    const rows = await prisma.exercise.groupBy({ by: ['unitId', 'tags'], where: { unit: { schoolId }, tags: { hasSome: keyed } }, _count: { _all: true } })
    for (const topic of keyed) {
      const counts = new Map()
      for (const row of rows) if (row.tags.includes(topic)) counts.set(row.unitId, (counts.get(row.unitId) ?? 0) + row._count._all)
      const best = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([id]) => units.find((u) => u.id === id)).filter(Boolean)
      if (best.length) result.set(topic, best.map((u) => ({ id: u.id, title: u.title })))
    }
  }

  // Free-text labels: key words against chapter titles.
  for (const topic of unique) {
    if (result.has(topic)) continue
    const lower = topic.toLowerCase()
    const found = []
    for (const [needle, pattern] of TITLE_KEYS) {
      if (!lower.includes(needle)) continue
      for (const u of units) if (pattern.test(u.title) && !found.some((f) => f.id === u.id)) found.push({ id: u.id, title: u.title })
      if (found.length >= 2) break
    }
    if (found.length) result.set(topic, found.slice(0, 2))
  }
  return result
}
