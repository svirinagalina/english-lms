import { Router } from 'express'
import path from 'path'
import { createReadStream, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { z } from 'zod'
import { prisma } from '../db.js'
import { requireAuth, requireRole } from '../auth.js'
import { sleepStoriesEnabled, generateSleepStory, STORY_TOPICS, KIDS_TOPICS } from '../sleepStories.js'

// Sleep and meditation stories. For now only the owner can see this section;
// students will be able to listen later, but never generate.
export const sleepStoriesRouter = Router()
sleepStoriesRouter.use(requireAuth)
sleepStoriesRouter.use(requireRole('OWNER'))

// Narration recorded ahead of time (scripts/make-sleep-audio.py), one mp3 per story id.
const UPLOAD_ROOT = process.env.UPLOAD_DIR ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads')
const AUDIO_DIR = path.join(UPLOAD_ROOT, 'sleep-audio')

const view = (s) => ({ id: s.id, title: s.title, topic: s.topic, minutes: s.minutes, text: s.text, kind: s.kind, language: s.language, createdAt: s.createdAt })

sleepStoriesRouter.get('/', async (req, res) => {
  const stories = await prisma.sleepStory.findMany({
    where: { schoolId: req.user.schoolId },
    orderBy: { createdAt: 'desc' }
  })
  res.json({ enabled: sleepStoriesEnabled(), topics: { sleep: STORY_TOPICS, kids: KIDS_TOPICS }, stories: stories.map(view) })
})

const generateSchema = z.object({ topic: z.string().min(3).max(200), kind: z.enum(['sleep', 'kids']).default('sleep') })

sleepStoriesRouter.post('/generate', async (req, res) => {
  if (!sleepStoriesEnabled()) {
    return res.status(503).json({ error: 'AI assistant is not configured' })
  }
  const parsed = generateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid data' })

  try {
    const story = await generateSleepStory(parsed.data.topic, parsed.data.kind)
    const saved = await prisma.sleepStory.create({
      data: { ...story, topic: parsed.data.topic, schoolId: req.user.schoolId }
    })
    res.status(201).json({ story: view(saved) })
  } catch (error) {
    console.error('Sleep story generation failed:', error.status ?? '', error.message)
    res.status(502).json({ error: error.status === 401 ? 'AI key is invalid' : 'Story generation failed, try again' })
  }
})

sleepStoriesRouter.get('/:id/audio', async (req, res) => {
  const story = await prisma.sleepStory.findFirst({ where: { id: req.params.id, schoolId: req.user.schoolId }, select: { id: true } })
  const file = story && path.join(AUDIO_DIR, `${story.id}.mp3`)
  if (!file || !existsSync(file)) return res.status(404).json({ error: 'No recording for this story' })
  res.type('audio/mpeg')
  createReadStream(file).pipe(res)
})

sleepStoriesRouter.delete('/:id', async (req, res) => {
  const result = await prisma.sleepStory.deleteMany({ where: { id: req.params.id, schoolId: req.user.schoolId } })
  if (!result.count) return res.status(404).json({ error: 'Not found' })
  res.json({ ok: true })
})
