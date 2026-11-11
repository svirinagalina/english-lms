import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../auth.js'
import { llmEnabled, structured } from '../llm.js'
import { aiChecksLeft, useAiCheck } from '../plans.js'
import { rateLimit } from '../resilience.js'

// The platform's own speaking trainer (2026-11-11, Galina: replaces Maxim's
// iframe trainer). The browser recognises the student's speech and speaks
// the partner's replies; the server only asks the AI for the next reply and
// a correction of what the student just said — one call per turn.
export const speakingRouter = Router()
speakingRouter.use(requireAuth)

export const SPEAKING_LEVELS = ['A2', 'B1', 'B2', 'C1']

speakingRouter.get('/status', (req, res) => {
  res.json({ enabled: llmEnabled(), left: Number.isFinite(aiChecksLeft(req.user)) ? aiChecksLeft(req.user) : null })
})

const turnSchema = z.object({
  topic: z.string().trim().min(1).max(200),
  level: z.enum(SPEAKING_LEVELS),
  // The conversation so far, oldest first; only the tail is sent to the AI.
  history: z.array(z.object({ role: z.enum(['partner', 'student']), text: z.string().max(1500) })).max(80).default([]),
  // Empty on the very first turn: the partner opens the conversation.
  message: z.string().trim().max(1500).default('')
})

const ReplySchema = z.object({
  reply: z.string(),
  replyRu: z.string(),
  correction: z.object({
    ok: z.boolean(),
    better: z.string(),
    note: z.string()
  })
})

const LEVEL_HINT = {
  A2: 'very simple words and short sentences (A2), one idea at a time',
  B1: 'everyday vocabulary and clear sentences (B1)',
  B2: 'natural conversational English with some idioms (B2)',
  C1: 'rich, natural English as between fluent speakers (C1)'
}

// 30 turns a minute is far more than anyone speaks; it stops a loop or a script.
speakingRouter.post('/turn', rateLimit({ windowMs: 60_000, max: 30, key: (req) => req.user.id }), async (req, res) => {
  if (!llmEnabled()) return res.status(503).json({ error: 'AI is not configured' })
  const parsed = turnSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid data' })
  const { topic, level, history, message } = parsed.data
  if (!message && history.length) return res.status(400).json({ error: 'Say something first' })
  if (aiChecksLeft(req.user) <= 0) return res.status(403).json({ error: 'Daily limit reached', locked: true, feature: 'practice' })

  // The page sends the student's new line both as the last turn and as `message`.
  const past = message && history.at(-1)?.role === 'student' ? history.slice(0, -1) : history
  const tail = past.slice(-16).map((t) => `${t.role === 'partner' ? 'Partner' : 'Student'}: ${t.text}`).join('\n')
  const system =
    'You are a friendly conversation partner helping a Russian-speaking adult practise spoken English. ' +
    `Topic: "${topic}". Speak with ${LEVEL_HINT[level]}. ` +
    'Your reply is read aloud, so: 1–3 short sentences, no lists, no emoji, no markdown; ' +
    'react to what the student said and end with one question that keeps the conversation going. ' +
    'Never switch to Russian in "reply". Avoid personal topics (health, money, family problems, politics, religion). ' +
    '"replyRu" is a natural Russian translation of your reply. ' +
    'In "correction" judge only the student\'s LAST message, which came from speech recognition: ' +
    'ignore punctuation, capitalisation and obvious recognition slips; ' +
    'set ok=true if it is grammatical and natural enough for the level (then better="" and note=""); ' +
    'otherwise ok=false, "better" = the student\'s sentence corrected with as few changes as possible, ' +
    '"note" = one short explanation in Russian of the main mistake. ' +
    'If there is no student message yet, you open the conversation and correction is ok=true with empty strings.'
  const user = message
    ? `${tail ? `Conversation so far:\n${tail}\n\n` : ''}Student's last message: ${message}`
    : 'Open the conversation on the topic.'

  try {
    const out = await structured({ name: 'speaking_turn', schema: ReplySchema, system, user, maxTokens: 1200 })
    if (!out?.reply) return res.status(502).json({ error: 'AI request failed, try again' })
    if (message) useAiCheck(req.user)
    res.json(out)
  } catch (error) {
    console.error('Speaking turn failed:', error.status ?? '', error.message)
    res.status(502).json({ error: 'AI request failed, try again' })
  }
})
