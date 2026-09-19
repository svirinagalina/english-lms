import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requireRole } from '../auth.js'
import { aiConfig, saveAiSettings, clearAiKey, offerLinks, saveOfferLinks, stripeKey, saveStripeKey } from '../settings.js'
import { testConnection } from '../llm.js'

// Platform settings — the owner only. The key is never sent back, only
// its provider, model and last characters.
export const settingsRouter = Router()
settingsRouter.use(requireAuth, requireRole('OWNER'))

const view = () => {
  const config = aiConfig()
  return {
    ai: config
      ? { configured: true, provider: config.provider, model: config.model, source: config.source, keyHint: `…${config.key.slice(-4)}` }
      : { configured: false, provider: null, model: null, source: null, keyHint: null }
  }
}

settingsRouter.get('/ai', (req, res) => res.json(view()))

// Payment links for the trial offer (Solo / Mentor). https only.
const linkSchema = z.object({
  solo: z.string().trim().url().startsWith('https://').or(z.literal('')).optional(),
  mentor: z.string().trim().url().startsWith('https://').or(z.literal('')).optional()
})
settingsRouter.get('/offer', (req, res) => res.json({ links: offerLinks(), stripe: { configured: Boolean(stripeKey()), keyHint: stripeKey() ? `…${stripeKey().slice(-4)}` : null, fromEnv: Boolean(process.env.STRIPE_SECRET_KEY) } }))

// The Stripe secret key (sk_live_… / sk_test_…): lets the platform open a
// checkout page with the exact amount already filled in.
settingsRouter.put('/stripe', async (req, res) => {
  const key = typeof req.body?.key === 'string' ? req.body.key.trim() : ''
  if (key && /^pk_/.test(key)) return res.status(400).json({ error: 'This is the publishable key (pk_…). The platform needs the Secret key — it starts with sk_live_' })
  if (key && !/^(sk|rk)_(live|test)_/.test(key)) return res.status(400).json({ error: 'A Stripe secret key starts with "sk_live_" (or "sk_test_" for test mode)' })
  await saveStripeKey(key || null)
  res.json({ configured: Boolean(stripeKey()) })
})
settingsRouter.put('/offer', async (req, res) => {
  const parsed = linkSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Links must start with https://' })
  await saveOfferLinks(parsed.data)
  res.json({ links: offerLinks() })
})

const aiSchema = z.object({
  provider: z.enum(['openai', 'anthropic']),
  key: z.string().trim().min(20).max(400).optional(),
  model: z.string().trim().max(80).optional()
})

settingsRouter.put('/ai', async (req, res) => {
  const parsed = aiSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Choose a provider and paste the key' })
  const { provider, key, model } = parsed.data
  if (key && provider === 'openai' && !key.startsWith('sk-')) return res.status(400).json({ error: 'An OpenAI key starts with "sk-"' })
  if (key && provider === 'anthropic' && !key.startsWith('sk-ant-')) return res.status(400).json({ error: 'An Anthropic key starts with "sk-ant-"' })
  const current = aiConfig()
  if (!key && !(current && current.source === 'settings')) return res.status(400).json({ error: 'Paste the key' })
  await saveAiSettings({ provider, key, model: model ?? '' })
  res.json(view())
})

settingsRouter.delete('/ai', async (req, res) => {
  await clearAiKey()
  res.json(view())
})

settingsRouter.post('/ai/test', async (req, res) => {
  try {
    const answer = await testConnection()
    res.json({ ok: true, answer })
  } catch (error) {
    res.status(502).json({ ok: false, error: error?.message ?? String(error) })
  }
})
