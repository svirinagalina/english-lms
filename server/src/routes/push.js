import { Router } from 'express'
import { prisma } from '../db.js'
import { requireAuth, requireRole } from '../auth.js'
import { apnsConfig, saveApnsConfig } from '../settings.js'
import { notify, pushEnabled, validApnsKey } from '../push.js'

// The app's phone registrations, and the owner's Apple push key (Settings).
export const pushRouter = Router()
pushRouter.use(requireAuth)

// The iOS app sends its APNs token after sign-in. One phone, one owner: a
// token that was someone else's (a shared phone, a new sign-in) moves over.
pushRouter.post('/devices', async (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : ''
  if (!/^[0-9a-fA-F]{32,200}$/.test(token)) return res.status(400).json({ error: 'Invalid device token' })
  const platform = req.body?.platform === 'android' ? 'android' : 'ios'
  await prisma.pushDevice.upsert({
    where: { token },
    create: { token, platform, userId: req.user.id },
    update: { userId: req.user.id, platform }
  })
  res.json({ ok: true })
})

// Signing out of the app: this phone stops getting the account's notifications.
pushRouter.delete('/devices', async (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : ''
  await prisma.pushDevice.deleteMany({ where: { token, userId: req.user.id } })
  res.json({ ok: true })
})

const view = async (user) => {
  const config = apnsConfig()
  return {
    configured: Boolean(config),
    keyId: config?.keyId ?? null,
    teamId: config?.teamId ?? null,
    fromEnv: Boolean(config?.fromEnv),
    myDevices: await prisma.pushDevice.count({ where: { userId: user.id } })
  }
}

pushRouter.get('/settings', requireRole('OWNER'), async (req, res) => res.json(await view(req.user)))

// The .p8 file's text (or the file's contents pasted), the Key ID and Team ID.
pushRouter.put('/settings', requireRole('OWNER'), async (req, res) => {
  const raw = typeof req.body?.key === 'string' ? req.body.key : ''
  const key = raw.match(/-----BEGIN PRIVATE KEY-----[\s\S]+?-----END PRIVATE KEY-----/)?.[0] ?? ''
  const keyId = String(req.body?.keyId ?? '').trim().toUpperCase()
  const teamId = String(req.body?.teamId ?? '').trim().toUpperCase()
  if (!key || !validApnsKey(key)) return res.status(400).json({ error: 'Paste the whole .p8 file: it starts with "-----BEGIN PRIVATE KEY-----"' })
  if (!/^[A-Z0-9]{10}$/.test(keyId)) return res.status(400).json({ error: 'The Key ID is 10 letters and digits (shown next to the key in your Apple Developer account)' })
  if (!/^[A-Z0-9]{10}$/.test(teamId)) return res.status(400).json({ error: 'The Team ID is 10 letters and digits (Apple Developer → Membership details)' })
  await saveApnsConfig({ key, keyId, teamId })
  res.json(await view(req.user))
})

pushRouter.delete('/settings', requireRole('OWNER'), async (req, res) => {
  await saveApnsConfig(null)
  res.json(await view(req.user))
})

// "Send me a test notification": to the owner's own phones.
pushRouter.post('/test', requireRole('OWNER'), async (req, res) => {
  if (!pushEnabled()) return res.status(400).json({ error: 'Save the Apple push key first' })
  const delivered = await notify([req.user.id], { title: 'Advent Academy', body: 'Push notifications work.', url: '/settings' })
  if (!delivered) return res.status(400).json({ error: 'No phone got it. Open the app on your iPhone, sign in and allow notifications, then try again.' })
  res.json({ delivered })
})
