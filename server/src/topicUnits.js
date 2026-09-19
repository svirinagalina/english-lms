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

// Map: topic → [{ id, title }] (up to two chapters each).
export async function unitsForTopics(schoolId, topics) {
  const result = new Map()
  const unique = [...new Set(topics)]
  if (!unique.length) return result
  const units = await unitsOf(schoolId)

  // Rule-based keys: the chapters whose exercises carry the tag most.
  const keyed = unique.filter((t) => TOPICS[t])
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
