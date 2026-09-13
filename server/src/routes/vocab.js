import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db.js'
import { requireAuth, requireRole } from '../auth.js'
import { normalise } from '../answerCheck.js'

export const vocabRouter = Router()

vocabRouter.use(requireAuth)

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
    where: { schoolId: req.user.schoolId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, title: true, _count: { select: { cards: true } } }
  })

  const due = await prisma.cardReview.groupBy({
    by: ['cardId'],
    where: { studentId: req.user.id, dueAt: { lte: new Date() } }
  })
  const dueIds = new Set(due.map((d) => d.cardId))

  const cards = await prisma.vocabCard.findMany({
    where: { set: { schoolId: req.user.schoolId } },
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
    where: { id: req.params.id, schoolId: req.user.schoolId },
    include: { cards: { orderBy: { position: 'asc' } } }
  })
  if (!set) return res.status(404).json({ error: 'Set not found' })

  res.json({ set: { id: set.id, title: set.title, cards: set.cards } })
})

vocabRouter.delete('/:id', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const set = await prisma.vocabSet.findFirst({
    where: { id: req.params.id, schoolId: req.user.schoolId }
  })
  if (!set) return res.status(404).json({ error: 'Set not found' })

  await prisma.vocabSet.delete({ where: { id: set.id } })
  res.json({ ok: true })
})

async function assertOwnedSet(req, res) {
  const set = await prisma.vocabSet.findFirst({
    where: { id: req.params.id, schoolId: req.user.schoolId },
    select: { id: true, _count: { select: { cards: true } } }
  })
  if (!set) {
    res.status(404).json({ error: 'Set not found' })
    return null
  }
  return set
}

vocabRouter.post('/:id/cards', requireRole('OWNER', 'TEACHER'), async (req, res) => {
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

vocabRouter.post('/:id/cards/bulk', requireRole('OWNER', 'TEACHER'), async (req, res) => {
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

vocabRouter.delete('/:id/cards/:cardId', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const set = await assertOwnedSet(req, res)
  if (!set) return

  await prisma.vocabCard.deleteMany({ where: { id: req.params.cardId, setId: set.id } })
  res.json({ ok: true })
})

// Cards to study now: never seen, or due for review.
vocabRouter.get('/:id/study', async (req, res) => {
  const set = await prisma.vocabSet.findFirst({
    where: { id: req.params.id, schoolId: req.user.schoolId },
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
    where: { id: req.params.cardId, set: { schoolId: req.user.schoolId } }
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
    where: { id: req.params.cardId, set: { schoolId: req.user.schoolId } }
  })
  if (!card) return res.status(404).json({ error: 'Card not found' })

  const correct = normalise(answer) === normalise(card.term)
  res.json({ correct, term: card.term })
})
