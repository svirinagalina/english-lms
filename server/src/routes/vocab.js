import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db.js'
import { requireAuth, requireRole, LOCKED } from '../auth.js'
import { openSetIds } from '../freeTier.js'
import { entitlements } from '../plans.js'
import { normalise } from '../answerCheck.js'
import { cleanWord, lookupEntry } from './dictionary.js'
import { shareWord } from '../advent.js'

// The Advent trainer knows people by email.
const emailOf = async (userId) => (await prisma.user.findUnique({ where: { id: userId }, select: { email: true } }))?.email

export const vocabRouter = Router()

vocabRouter.use(requireAuth)

// A free user opens only the oldest ~30% of the shared sets (freeTier.js);
// the list still shows the others, locked.
vocabRouter.use(async (req, res, next) => {
  if (!entitlements(req.user).practice) req.user.openSetIds = await openSetIds(req.user.schoolId)
  next()
})

// Sets this person may see: the school's shared sets, plus their own "My words".
const listedSets = (user) => ({ schoolId: user.schoolId, OR: [{ ownerId: null }, { ownerId: user.id }] })
const visibleSets = (user) => user.openSetIds
  ? { schoolId: user.schoolId, OR: [{ ownerId: null, id: { in: user.openSetIds } }, { ownerId: user.id }] }
  : listedSets(user)
// A set that exists but is beyond the free share: the page offers the upgrade.
const lockedSet = async (user, id) => Boolean(user.openSetIds) &&
  Boolean(await prisma.vocabSet.findFirst({ where: { id, schoolId: user.schoolId, ownerId: null }, select: { id: true } }))

// Who may change a set's cards: staff for shared sets, the owner for a personal one.
const mayEditSet = (user, set) => (set.ownerId ? set.ownerId === user.id : user.role !== 'STUDENT')

const MY_WORDS = 'From my board'
async function personalSet(user) {
  const existing = await prisma.vocabSet.findFirst({ where: { ownerId: user.id }, orderBy: { createdAt: 'asc' } })
  if (existing) return existing
  return prisma.vocabSet.create({ data: { title: MY_WORDS, schoolId: user.schoolId, ownerId: user.id } })
}

// Days until a card comes back, indexed by how many times it was recalled in a
// row. Anything beyond the last step repeats monthly.
const INTERVALS = [0, 1, 3, 7, 14, 30]

const dueDateFor = (streak) => {
  const days = INTERVALS[Math.min(streak, INTERVALS.length - 1)]
  const due = new Date()
  due.setDate(due.getDate() + days)
  return due
}

const setSchema = z.object({ title: z.string().min(1).max(200) })
// A staff member's new set is their own unless they share it with every
// student of the school: two sets Galina made "for herself" (2026-10-09)
// were shared by default and showed up, empty and read-only, for everyone.
const newSetSchema = setSchema.extend({ shared: z.boolean().optional() })

const cardSchema = z.object({
  term: z.string().min(1).max(300),
  translation: z.string().min(1).max(300),
  example: z.string().max(600).nullable().optional()
})

const bulkSchema = z.object({ text: z.string().max(100_000) })

// "word — translation", also accepting tab, semicolon, dash or " - " between them.
const SEPARATOR = /\s*(?:\t|—|–|;|\s-\s|\s+\|\s+)\s*/

export function parseBulk(text) {
  const cards = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const parts = trimmed.split(SEPARATOR).filter((part) => part.trim())
    if (parts.length < 2) continue

    cards.push({
      term: parts[0].trim().slice(0, 300),
      translation: parts[1].trim().slice(0, 300),
      example: parts[2]?.trim().slice(0, 600) || null
    })
  }
  return cards
}

vocabRouter.get('/', async (req, res) => {
  const sets = await prisma.vocabSet.findMany({
    where: listedSets(req.user),
    orderBy: { createdAt: 'desc' },
    select: { id: true, title: true, ownerId: true, _count: { select: { cards: true } } }
  })
  // The personal set goes first.
  sets.sort((a, b) => Number(Boolean(b.ownerId)) - Number(Boolean(a.ownerId)))

  const due = await prisma.cardReview.groupBy({
    by: ['cardId'],
    where: { studentId: req.user.id, dueAt: { lte: new Date() } }
  })
  const dueIds = new Set(due.map((d) => d.cardId))

  const cards = await prisma.vocabCard.findMany({
    where: { set: visibleSets(req.user) },
    select: { id: true, setId: true }
  })

  const seen = await prisma.cardReview.findMany({
    where: { studentId: req.user.id },
    select: { cardId: true }
  })
  const seenIds = new Set(seen.map((s) => s.cardId))

  const duePerSet = {}
  for (const card of cards) {
    // A card never studied is due as well.
    if (dueIds.has(card.id) || !seenIds.has(card.id)) {
      duePerSet[card.setId] = (duePerSet[card.setId] ?? 0) + 1
    }
  }

  res.json({
    sets: sets.map((set) => ({
      id: set.id,
      title: set.title,
      personal: Boolean(set.ownerId),
      shared: !set.ownerId,
      total: set._count.cards,
      due: duePerSet[set.id] ?? 0,
      ...(req.user.openSetIds && !set.ownerId && !req.user.openSetIds.includes(set.id) ? { locked: true } : {})
    }))
  })
})

vocabRouter.post('/', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const parsed = newSetSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid data' })

  const set = await prisma.vocabSet.create({
    data: { title: parsed.data.title, schoolId: req.user.schoolId, ownerId: parsed.data.shared ? null : req.user.id },
    select: { id: true, title: true }
  })
  res.status(201).json({ set })
})

// One's own set, made on first use — a student with nothing saved from the
// board yet had nowhere to type their own words.
vocabRouter.post('/my', async (req, res) => {
  const set = await personalSet(req.user)
  res.json({ set: { id: set.id, title: set.title } })
})

// Whose words a board works with: the classroom's student for a teacher,
// the student themself otherwise.
async function boardStudent(user, classroomId) {
  if (user.role === 'STUDENT') return user
  const classroom = await prisma.classroom.findFirst({
    where: { id: String(classroomId ?? ''), schoolId: user.schoolId },
    include: { student: { select: { id: true, name: true, schoolId: true } } }
  })
  return classroom?.student ?? null
}

// The student's words of the last week (their own sets), for a list on the
// board — the term and its first few translations.
vocabRouter.get('/board-words', async (req, res) => {
  const target = await boardStudent(req.user, req.query.classroomId)
  if (!target) return res.status(404).json({ error: 'This board has no student' })
  const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 60)
  const cards = await prisma.vocabCard.findMany({
    where: { set: { ownerId: target.id }, createdAt: { gte: new Date(Date.now() - days * 86400000) } },
    orderBy: { createdAt: 'asc' },
    select: { term: true, translation: true },
    take: 200
  })
  // "noun: дом, здание · verb: …" → "дом, здание"
  const short = (translation) => (translation.split(' · ')[0].replace(/^[a-z ]+:\s*/i, '').split(',').slice(0, 3).join(',').trim())
  const seen = new Set()
  const words = cards.filter((c) => !seen.has(c.term.toLowerCase()) && seen.add(c.term.toLowerCase()))
    .map((c) => ({ term: c.term, translation: short(c.translation) }))
  res.json({ words, student: target.id === req.user.id ? null : target.name })
})

vocabRouter.get('/:id', async (req, res) => {
  const set = await prisma.vocabSet.findFirst({
    where: { id: req.params.id, ...visibleSets(req.user) },
    include: { cards: { orderBy: { position: 'asc' } } }
  })
  if (!set && await lockedSet(req.user, req.params.id)) return res.status(403).json(LOCKED)
  if (!set) return res.status(404).json({ error: 'Set not found' })

  res.json({ set: { id: set.id, title: set.title, personal: Boolean(set.ownerId), canEdit: mayEditSet(req.user, set), cards: set.cards } })
})

// "My words": a word from the dictionary goes into the person's own set,
// with its transcription, pronunciation and the senses as the translation.
vocabRouter.post('/my/words', async (req, res) => {
  const word = cleanWord(req.body?.word)
  if (!word || word.length > 40) return res.status(400).json({ error: 'A single English word is expected' })

  const set = await personalSet(req.user)
  const existing = await prisma.vocabCard.findFirst({ where: { setId: set.id, term: { equals: word, mode: 'insensitive' } } })
  if (existing) return res.json({ card: existing, setId: set.id, added: false })

  let entry
  try {
    entry = await lookupEntry(word)
  } catch (error) {
    return res.status(502).json({ error: `Could not look the word up: ${error.message}` })
  }
  if (entry.suggestion) return res.status(400).json({ error: `No such word — did you mean «${entry.suggestion}»?` })
  const translation = entry.senses?.length
    ? entry.senses.map((s) => `${s.pos}: ${s.translations.slice(0, 4).join(', ')}`).join(' · ')
    : entry.translation
  const count = await prisma.vocabCard.count({ where: { setId: set.id } })
  const card = await prisma.vocabCard.create({
    data: {
      setId: set.id,
      term: word,
      translation: translation.slice(0, 300),
      transcription: entry.transcription,
      audio: entry.audio,
      position: count
    }
  })
  shareWord(await emailOf(req.user.id), word, card.translation)
  res.status(201).json({ card, setId: set.id, added: true })
})

// Words picked on a board go into a student's "My words": the teacher's pick
// lands in the classroom student's set, a student's pick in their own.
vocabRouter.post('/board-words', async (req, res) => {
  // A word or a phrase ("give up", "it's up to you"), letters only.
  const cleanTerm = (raw) => String(raw ?? '').trim().toLowerCase().replace(/[^a-z'’ -]/g, '').replace(/\s+/g, ' ').trim()
  // A phrase or a short sentence counts too (up to 80 characters).
  const words = [...new Set((Array.isArray(req.body?.words) ? req.body.words : [req.body?.words]).map(cleanTerm).filter((w) => w && w.length <= 80))].slice(0, 20)
  if (!words.length) return res.status(400).json({ error: 'Select an English word first' })

  const target = await boardStudent(req.user, req.body?.classroomId)
  if (!target) return res.status(404).json({ error: 'This board has no student' })
  const set = await personalSet(target)

  let added = 0
  const skipped = []
  const targetEmail = await emailOf(target.id)
  for (const word of words) {
    const existing = await prisma.vocabCard.findFirst({ where: { setId: set.id, term: { equals: word, mode: 'insensitive' } } })
    if (existing) continue
    let entry
    try {
      entry = await lookupEntry(word)
    } catch {
      skipped.push(word)
      continue
    }
    if (!entry?.translation && !entry?.senses?.length) { skipped.push(word); continue }
    const translation = entry.senses?.length
      ? entry.senses.map((s) => `${s.pos}: ${s.translations.slice(0, 4).join(', ')}`).join(' · ')
      : entry.translation
    const count = await prisma.vocabCard.count({ where: { setId: set.id } })
    await prisma.vocabCard.create({
      data: { setId: set.id, term: word, translation: String(translation).slice(0, 300), transcription: entry.transcription, audio: entry.audio, position: count }
    })
    // Also into their trainer vocabulary, so it comes up in its flashcards.
    shareWord(targetEmail, word, translation)
    added += 1
  }
  res.json({ added, skipped, setId: set.id, student: target.id === req.user.id ? null : target.name })
})

vocabRouter.patch('/:id', async (req, res) => {
  const parsed = setSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid data' })
  const set = await prisma.vocabSet.findFirst({ where: { id: req.params.id, ...visibleSets(req.user) } })
  if (!set || !mayEditSet(req.user, set)) return res.status(404).json({ error: 'Set not found' })
  const updated = await prisma.vocabSet.update({ where: { id: set.id }, data: { title: parsed.data.title }, select: { id: true, title: true } })
  res.json({ set: updated })
})

vocabRouter.delete('/:id', async (req, res) => {
  const set = await prisma.vocabSet.findFirst({
    where: { id: req.params.id, ...visibleSets(req.user) }
  })
  if (!set || !mayEditSet(req.user, set)) return res.status(404).json({ error: 'Set not found' })

  await prisma.vocabSet.delete({ where: { id: set.id } })
  res.json({ ok: true })
})

async function assertOwnedSet(req, res) {
  const set = await prisma.vocabSet.findFirst({
    where: { id: req.params.id, ...visibleSets(req.user) },
    select: { id: true, ownerId: true, _count: { select: { cards: true } } }
  })
  if (!set || !mayEditSet(req.user, set)) {
    res.status(404).json({ error: 'Set not found' })
    return null
  }
  return set
}

vocabRouter.post('/:id/cards', async (req, res) => {
  const parsed = cardSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid data' })

  const set = await assertOwnedSet(req, res)
  if (!set) return

  const card = await prisma.vocabCard.create({
    data: {
      setId: set.id,
      term: parsed.data.term,
      translation: parsed.data.translation,
      example: parsed.data.example ?? null,
      position: set._count.cards
    }
  })
  res.status(201).json({ card })
})

vocabRouter.post('/:id/cards/bulk', async (req, res) => {
  const parsed = bulkSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid data' })

  const set = await assertOwnedSet(req, res)
  if (!set) return

  const cards = parseBulk(parsed.data.text)
  if (!cards.length) {
    return res.status(400).json({ error: 'No usable lines found. Use "word — translation" per line.' })
  }

  await prisma.vocabCard.createMany({
    data: cards.map((card, index) => ({
      ...card,
      setId: set.id,
      position: set._count.cards + index
    }))
  })

  res.status(201).json({ added: cards.length })
})

vocabRouter.delete('/:id/cards/:cardId', async (req, res) => {
  const set = await assertOwnedSet(req, res)
  if (!set) return

  await prisma.vocabCard.deleteMany({ where: { id: req.params.cardId, setId: set.id } })
  res.json({ ok: true })
})

// Cards to study now: never seen, or due for review.
// Everything due today across all the sets this person sees — the
// spaced-repetition queue: never-seen cards first, then the most overdue.
vocabRouter.get('/review/due', async (req, res) => {
  const cards = await prisma.vocabCard.findMany({
    where: { set: visibleSets(req.user) },
    include: { reviews: { where: { studentId: req.user.id } }, set: { select: { id: true, title: true, ownerId: true } } }
  })
  const now = new Date()
  const due = cards
    .filter((card) => { const r = card.reviews[0]; return !r || r.dueAt <= now })
    .sort((a, b) => {
      const ra = a.reviews[0], rb = b.reviews[0]
      if (!ra && rb) return -1
      if (ra && !rb) return 1
      if (!ra && !rb) return 0
      return ra.dueAt - rb.dueAt
    })
    .slice(0, 60)
  res.json({
    title: 'Words to review',
    cards: due.map((card) => ({
      id: card.id, term: card.term, translation: card.translation, example: card.example,
      transcription: card.transcription, audio: card.audio,
      streak: card.reviews[0]?.streak ?? 0, set: card.set.title, personal: Boolean(card.set.ownerId)
    })),
    scheduled: cards.length - due.length
  })
})

vocabRouter.get('/:id/study', async (req, res) => {
  const set = await prisma.vocabSet.findFirst({
    where: { id: req.params.id, ...visibleSets(req.user) },
    include: {
      cards: {
        orderBy: { position: 'asc' },
        include: { reviews: { where: { studentId: req.user.id } } }
      }
    }
  })
  if (!set && await lockedSet(req.user, req.params.id)) return res.status(403).json(LOCKED)
  if (!set) return res.status(404).json({ error: 'Set not found' })

  // ?all=1: every card in deck order, for a free run through the whole set —
  // like Anki's cram — regardless of the spaced-repetition schedule.
  const now = new Date()
  const cards = req.query.all
    ? set.cards
    : set.cards.filter((card) => { const review = card.reviews[0]; return !review || review.dueAt <= now })

  res.json({
    title: set.title,
    cards: cards.map((card) => ({
      id: card.id,
      term: card.term,
      translation: card.translation,
      example: card.example,
      transcription: card.transcription,
      audio: card.audio,
      streak: card.reviews[0]?.streak ?? 0
    }))
  })
})

const reviewSchema = z.object({
  correct: z.boolean(),
  answer: z.string().max(300).optional(),
  // "I've memorized it": straight to the longest interval.
  mastered: z.boolean().optional()
})

vocabRouter.post('/cards/:cardId/review', async (req, res) => {
  const parsed = reviewSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid data' })

  const card = await prisma.vocabCard.findFirst({
    where: { id: req.params.cardId, set: visibleSets(req.user) }
  })
  if (!card) return res.status(404).json({ error: 'Card not found' })

  const existing = await prisma.cardReview.findUnique({
    where: { cardId_studentId: { cardId: card.id, studentId: req.user.id } }
  })

  const streak = parsed.data.correct
    ? (parsed.data.mastered ? Math.max(INTERVALS.length - 1, (existing?.streak ?? 0) + 1) : (existing?.streak ?? 0) + 1)
    : 0

  await prisma.cardReview.upsert({
    where: { cardId_studentId: { cardId: card.id, studentId: req.user.id } },
    create: {
      cardId: card.id,
      studentId: req.user.id,
      streak,
      dueAt: dueDateFor(streak),
      lastResult: parsed.data.correct
    },
    update: {
      streak,
      dueAt: dueDateFor(streak),
      lastResult: parsed.data.correct
    }
  })

  res.json({ streak, nextDue: dueDateFor(streak) })
})

// Typed answer check for the writing mode.
vocabRouter.post('/cards/:cardId/check', async (req, res) => {
  const answer = typeof req.body?.answer === 'string' ? req.body.answer : ''

  const card = await prisma.vocabCard.findFirst({
    where: { id: req.params.cardId, set: visibleSets(req.user) }
  })
  if (!card) return res.status(404).json({ error: 'Card not found' })

  const correct = normalise(answer) === normalise(card.term)
  res.json({ correct, term: card.term })
})
