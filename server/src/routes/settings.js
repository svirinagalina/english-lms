import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requireRole } from '../auth.js'
import { aiConfig, saveAiSettings, clearAiKey, offerLinks, saveOfferLinks, stripeKey, saveStripeKey, adventKey, saveAdventKey } from '../settings.js'
import { advent } from '../advent.js'
import { testConnection, detectProvider } from '../llm.js'

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
// The Advent trainer's partner key (gal_…). Saved encrypted like the others;
// saving checks it against the trainer straight away.
const adventView = () => ({ configured: Boolean(adventKey()), keyHint: adventKey() ? `…${adventKey().slice(-4)}` : null, fromEnv: Boolean(process.env.ADVENT_PARTNER_KEY) })
settingsRouter.get('/advent', (req, res) => res.json(adventView()))
settingsRouter.put('/advent', async (req, res) => {
  // Whatever was pasted — the whole line from KEY.txt, "KEY=gal_…", quotes —
  // the key is the gal_… part of it.
  const raw = typeof req.body?.key === 'string' ? req.body.key : ''
  const key = raw.match(/gal_[A-Za-z0-9_-]{8,}/)?.[0] ?? ''
  if (raw.trim() && !key) return res.status(400).json({ error: 'No trainer key here: it starts with "gal_" (it is in KEY.txt)' })
  const previous = adventKey()
  await saveAdventKey(key || null)
  if (!key) return res.json(adventView())
  try {
    const ping = await advent('GET', '/ping')
    res.json({ ...adventView(), partner: ping.name ?? ping.partner ?? null })
  } catch (error) {
    // A key the trainer refuses isn't kept.
    await saveAdventKey(previous && !process.env.ADVENT_PARTNER_KEY ? previous : null)
    res.status(400).json({ error: `The trainer did not accept this key: ${error.message}` })
  }
})
settingsRouter.post('/advent/test', async (req, res) => {
  try { res.json({ ok: true, ...(await advent('GET', '/ping')) }) } catch (error) { res.status(502).json({ ok: false, error: error.message }) }
})

settingsRouter.put('/offer', async (req, res) => {
  const parsed = linkSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Links must start with https://' })
  await saveOfferLinks(parsed.data)
  res.json({ links: offerLinks() })
})

const aiSchema = z.object({
  provider: z.enum(['auto', 'openai', 'anthropic', 'xai', 'deepseek']),
  key: z.string().trim().min(20).max(400).optional(),
  model: z.string().trim().max(80).optional()
})

settingsRouter.put('/ai', async (req, res) => {
  const parsed = aiSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Choose a provider and paste the key' })
  let { provider, key, model } = parsed.data
  if (key && provider === 'auto') {
    provider = await detectProvider(key)
    if (!provider) return res.status(400).json({ error: 'This key was not accepted by OpenAI, DeepSeek, Grok or Claude — check that it was copied whole' })
  }
  if (provider === 'auto') provider = aiConfig()?.provider ?? 'openai'
  if (key && provider === 'openai' && !key.startsWith('sk-')) return res.status(400).json({ error: 'An OpenAI key starts with "sk-"' })
  if (key && provider === 'deepseek' && !key.startsWith('sk-')) return res.status(400).json({ error: 'A DeepSeek key starts with "sk-"' })
  if (key && provider === 'anthropic' && !key.startsWith('sk-ant-')) return res.status(400).json({ error: 'An Anthropic key starts with "sk-ant-"' })
  if (key && provider === 'xai' && !key.startsWith('xai-')) return res.status(400).json({ error: 'A Grok (xAI) key starts with "xai-"' })
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
