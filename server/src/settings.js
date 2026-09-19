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

export async function loadAiSettings() {
  const rows = await prisma.platformSetting.findMany({ where: { key: { in: ['ai.provider', 'ai.key', 'ai.model'] } } })
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))
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

// What the language-model layer uses: environment first, then the saved settings.
export function aiConfig() {
  if (process.env.OPENAI_API_KEY) return { provider: 'openai', key: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL || null, source: 'env' }
  if (process.env.ANTHROPIC_API_KEY) return { provider: 'anthropic', key: process.env.ANTHROPIC_API_KEY, model: process.env.ANTHROPIC_MODEL || null, source: 'env' }
  if (ai.key && ai.provider) return { provider: ai.provider, key: ai.key, model: ai.model, source: 'settings' }
  return null
}
