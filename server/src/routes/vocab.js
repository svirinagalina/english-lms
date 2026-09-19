import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db.js'
import { requireAuth, requireRole } from '../auth.js'
import { normalise } from '../answerCheck.js'
import { cleanWord, lookupEntry } from './dictionary.js'

export const vocabRouter = Router()

vocabRouter.use(requireAuth)

// Sets this person may see: the school's shared sets, plus their own "My words".
const visibleSets = (user) => ({ schoolId: user.schoolId, OR: [{ ownerId: null }, { ownerId: user.id }] })

// Who may change a set's cards: staff for shared sets, the owner for a personal one.
const mayEditSet = (user, set) => (set.ownerId ? set.ownerId === user.id : user.role !== 'STUDENT')

const MY_WORDS = 'My words'
async function personalSet(user) {
  const existing = await prisma.vocabSet.findFirst({ where: { ownerId: user.id } })
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
    where: visibleSets(req.user),
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
      total: set._count.cards,
      due: duePerSet[set.id] ?? 0
    }))
  })
})

vocabRouter.post('/', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const parsed = setSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid data' })

  const set = await prisma.vocabSet.create({
    data: { title: parsed.data.title, schoolId: req.user.schoolId },
    select: { id: true, title: true }
  })
  res.status(201).json({ set })
})

vocabRouter.get('/:id', async (req, res) => {
  const set = await prisma.vocabSet.findFirst({
    where: { id: req.params.id, ...visibleSets(req.user) },
    include: { cards: { orderBy: { position: 'asc' } } }
  })
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
  res.status(201).json({ card, setId: set.id, added: true })
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
  if (!set) return res.status(404).json({ error: 'Set not found' })

  const now = new Date()
  const due = set.cards.filter((card) => {
    const review = card.reviews[0]
    return !review || review.dueAt <= now
  })

  res.json({
    title: set.title,
    cards: due.map((card) => ({
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
  answer: z.string().max(300).optional()
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

  const streak = parsed.data.correct ? (existing?.streak ?? 0) + 1 : 0

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
