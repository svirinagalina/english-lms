import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'
import { prisma } from './db.js'

// The AI key lives in the database, encrypted with a key derived from the
// server secret, so the owner can set it from the Settings page without
// touching the server. The environment still wins when it is set.

const secret = () => createHash('sha256').update(`${process.env.JWT_SECRET}:ai-settings`).digest()

export function encrypt(text) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', secret(), iv)
  const body = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()])
  return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${body.toString('base64url')}`
}

export function decrypt(packed) {
  const [iv, tag, body] = String(packed).split('.')
  const decipher = createDecipheriv('aes-256-gcm', secret(), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8')
}

// In-memory copy, so the rest of the server can ask synchronously.
const ai = { provider: null, key: null, model: null, loaded: false }
// Payment links for the trial offer's plans (Stripe payment links etc.),
// and the Stripe secret key for creating checkout sessions with the exact amount.
const offer = { solo: null, mentor: null }
const stripe = { key: null }
// The Advent trainer's partner key (gal_…): lets the platform open the
// trainer for a signed-in student and share their words and progress.
const advent = { key: null }
export const adventKey = () => process.env.ADVENT_PARTNER_KEY || advent.key
export async function saveAdventKey(key) {
  if (key) await prisma.platformSetting.upsert({ where: { key: 'advent.key' }, create: { key: 'advent.key', value: encrypt(key) }, update: { value: encrypt(key) } })
  else await prisma.platformSetting.deleteMany({ where: { key: 'advent.key' } })
  return loadAiSettings()
}
// Apple push notifications: the .p8 key from the Apple Developer account
// (Keys → Apple Push Notifications service), its Key ID and the Team ID.
const apns = { config: null }
export function apnsConfig() {
  if (process.env.APNS_KEY && process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID) {
    return { key: process.env.APNS_KEY.replace(/\\n/g, '\n'), keyId: process.env.APNS_KEY_ID, teamId: process.env.APNS_TEAM_ID, fromEnv: true }
  }
  return apns.config
}
export async function saveApnsConfig(config) {
  if (config) {
    const value = encrypt(JSON.stringify(config))
    await prisma.platformSetting.upsert({ where: { key: 'apns.config' }, create: { key: 'apns.config', value }, update: { value } })
  } else await prisma.platformSetting.deleteMany({ where: { key: 'apns.config' } })
  return loadAiSettings()
}
export const stripeKey = () => process.env.STRIPE_SECRET_KEY || stripe.key
export async function saveStripeKey(key) {
  if (key) await prisma.platformSetting.upsert({ where: { key: 'stripe.key' }, create: { key: 'stripe.key', value: encrypt(key) }, update: { value: encrypt(key) } })
  else await prisma.platformSetting.deleteMany({ where: { key: 'stripe.key' } })
  return loadAiSettings()
}
// Calls through the media server (LiveKit) instead of person-to-person:
// switched in Settings, used only when the server is configured (sfu.js).
const calls = { sfu: false }
export const sfuSwitchedOn = () => calls.sfu
export async function saveSfuSwitch(on) {
  await prisma.platformSetting.upsert({ where: { key: 'calls.sfu' }, create: { key: 'calls.sfu', value: on ? 'on' : 'off' }, update: { value: on ? 'on' : 'off' } })
  return loadAiSettings()
}
export const offerLinks = () => ({ ...offer })
export async function saveOfferLinks({ solo, mentor }) {
  const writes = []
  const put = (k, v) => writes.push(prisma.platformSetting.upsert({ where: { key: k }, create: { key: k, value: v ?? '' }, update: { value: v ?? '' } }))
  if (solo !== undefined) put('offer.solo', solo)
  if (mentor !== undefined) put('offer.mentor', mentor)
  await prisma.$transaction(writes)
  return loadAiSettings()
}

export async function loadAiSettings() {
  const rows = await prisma.platformSetting.findMany({ where: { key: { in: ['ai.provider', 'ai.key', 'ai.model', 'offer.solo', 'offer.mentor', 'stripe.key', 'advent.key', 'apns.config', 'calls.sfu'] } } })
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  offer.solo = map['offer.solo'] || null
  offer.mentor = map['offer.mentor'] || null
  try { stripe.key = map['stripe.key'] ? decrypt(map['stripe.key']) : null } catch { stripe.key = null }
  try { advent.key = map['advent.key'] ? decrypt(map['advent.key']) : null } catch { advent.key = null }
  try { apns.config = map['apns.config'] ? JSON.parse(decrypt(map['apns.config'])) : null } catch { apns.config = null }
  calls.sfu = map['calls.sfu'] === 'on'
  ai.provider = map['ai.provider'] ?? null
  ai.model = map['ai.model'] || null
  try { ai.key = map['ai.key'] ? decrypt(map['ai.key']) : null } catch { ai.key = null }
  ai.loaded = true
  return ai
}

export async function saveAiSettings({ provider, key, model }) {
  const writes = []
  const put = (k, v) => writes.push(prisma.platformSetting.upsert({ where: { key: k }, create: { key: k, value: v }, update: { value: v } }))
  if (provider !== undefined) put('ai.provider', provider ?? '')
  if (model !== undefined) put('ai.model', model ?? '')
  if (key) put('ai.key', encrypt(key))
  await prisma.$transaction(writes)
  return loadAiSettings()
}

export async function clearAiKey() {
  await prisma.platformSetting.deleteMany({ where: { key: { in: ['ai.key', 'ai.provider', 'ai.model'] } } })
  return loadAiSettings()
}

// What the language-model layer uses: a key saved in Settings first (so the
// owner can replace an expired server key herself), then the environment.
export function aiConfig() {
  if (ai.key && ai.provider) return { provider: ai.provider, key: ai.key, model: ai.model, source: 'settings' }
  if (process.env.OPENAI_API_KEY) return { provider: 'openai', key: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL || null, source: 'env' }
  if (process.env.ANTHROPIC_API_KEY) return { provider: 'anthropic', key: process.env.ANTHROPIC_API_KEY, model: process.env.ANTHROPIC_MODEL || null, source: 'env' }
  return null
}
