import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requireRole } from '../auth.js'
import { assistantEnabled, translateWords, makeQuestions } from '../assistant.js'

export const assistRouter = Router()

assistRouter.use(requireAuth)

assistRouter.get('/status', (req, res) => {
  res.json({ enabled: assistantEnabled() })
})

const requestSchema = z.object({
  mode: z.enum(['translate', 'questions']),
  // Trimmed rather than refused: a big selection on the board is normal.
  words: z.array(z.string()).min(1).transform((list) => list.slice(0, 40).map((w) => w.slice(0, 120)))
})

assistRouter.post('/', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  if (!assistantEnabled()) {
    return res.status(503).json({ error: 'AI assistant is not configured' })
  }

  const parsed = requestSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid data' })

  try {
    const items =
      parsed.data.mode === 'translate'
        ? await translateWords(parsed.data.words)
        : await makeQuestions(parsed.data.words)
    res.json({ items })
  } catch (error) {
    // Surface the service's own message (rate limit, bad key) without the stack.
    console.error('Assistant request failed:', error.status ?? '', error.message)
    res.status(502).json({ error: error.status === 401 ? 'AI key is invalid' : 'AI request failed, try again' })
  }
})
