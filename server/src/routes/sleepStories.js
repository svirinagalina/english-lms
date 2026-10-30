import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db.js'
import { requireAuth, requireRole } from '../auth.js'
import { sleepStoriesEnabled, generateSleepStory, STORY_TOPICS } from '../sleepStories.js'

// Sleep and meditation stories. For now only the owner can see this section;
// students will be able to listen later, but never generate.
export const sleepStoriesRouter = Router()
sleepStoriesRouter.use(requireAuth)
sleepStoriesRouter.use(requireRole('OWNER'))

const view = (s) => ({ id: s.id, title: s.title, topic: s.topic, minutes: s.minutes, text: s.text, createdAt: s.createdAt })

sleepStoriesRouter.get('/', async (req, res) => {
  const stories = await prisma.sleepStory.findMany({
    where: { schoolId: req.user.schoolId },
    orderBy: { createdAt: 'desc' }
  })
  res.json({ enabled: sleepStoriesEnabled(), topics: STORY_TOPICS, stories: stories.map(view) })
})

const generateSchema = z.object({ topic: z.string().min(3).max(200) })

sleepStoriesRouter.post('/generate', async (req, res) => {
  if (!sleepStoriesEnabled()) {
    return res.status(503).json({ error: 'AI assistant is not configured' })
  }
  const parsed = generateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid data' })

  try {
    const story = await generateSleepStory(parsed.data.topic)
    const saved = await prisma.sleepStory.create({
      data: { ...story, topic: parsed.data.topic, schoolId: req.user.schoolId }
    })
    res.status(201).json({ story: view(saved) })
  } catch (error) {
    console.error('Sleep story generation failed:', error.status ?? '', error.message)
    res.status(502).json({ error: error.status === 401 ? 'AI key is invalid' : 'Story generation failed, try again' })
  }
})

sleepStoriesRouter.delete('/:id', async (req, res) => {
  const result = await prisma.sleepStory.deleteMany({ where: { id: req.params.id, schoolId: req.user.schoolId } })
  if (!result.count) return res.status(404).json({ error: 'Not found' })
  res.json({ ok: true })
})
