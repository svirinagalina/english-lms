import { Router } from 'express'
import { prisma } from '../db.js'
import { requireAuth, requireRole } from '../auth.js'
import { botSettings, botUsername, botToken, saveBotToken, saveBotSwitch, saveBookingUrl, sendTo, userStartLink, appUrl } from '../telegram.js'

// The school's Telegram bot: who is connected, the owner's settings.
export const telegramRouter = Router()

// Public: the lesson-link page shows «Напоминания в Telegram» with it.
telegramRouter.get('/info', (req, res) => res.json({ username: botToken() ? botUsername() : null }))

// One's own connection (Profile).
telegramRouter.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { telegramChatId: true, telegramName: true } })
  res.json({ ready: Boolean(botToken() && botUsername()), connected: Boolean(user.telegramChatId), name: user.telegramName, link: userStartLink(req.user.id) })
})
telegramRouter.delete('/me', requireAuth, async (req, res) => {
  await prisma.user.update({ where: { id: req.user.id }, data: { telegramChatId: null } })
  res.json({ ok: true })
})

// The owner's settings.
const counts = async (schoolId) => {
  const rows = await prisma.user.groupBy({ by: ['role'], where: { schoolId, telegramChatId: { not: null } }, _count: true })
  return Object.fromEntries(rows.map((r) => [r.role, r._count]))
}
const view = async (req) => ({ ...botSettings(), connected: await counts(req.user.schoolId), myLink: userStartLink(req.user.id) })
telegramRouter.get('/settings', requireAuth, requireRole('OWNER'), async (req, res) => res.json(await view(req)))

telegramRouter.put('/token', requireAuth, requireRole('OWNER'), async (req, res) => {
  const raw = typeof req.body?.token === 'string' ? req.body.token.trim() : ''
  // Whatever was pasted, the token is the "123456789:AA…" part of it.
  const token = raw.match(/\d{5,}:[A-Za-z0-9_-]{30,}/)?.[0] ?? ''
  if (raw && !token) return res.status(400).json({ error: 'No bot key here: it looks like 123456789:AAE… (BotFather sends it after /newbot)' })
  try {
    await saveBotToken(token || null)
    res.json(await view(req))
  } catch (error) {
    res.status(error.status ?? 500).json({ error: error.message })
  }
})

telegramRouter.put('/switch', requireAuth, requireRole('OWNER'), async (req, res) => {
  if (typeof req.body?.on !== 'boolean') return res.status(400).json({ error: 'Invalid data' })
  await saveBotSwitch(req.body.on)
  res.json(await view(req))
})

telegramRouter.put('/booking-url', requireAuth, requireRole('OWNER'), async (req, res) => {
  const url = typeof req.body?.url === 'string' ? req.body.url.trim() : ''
  if (url && !/^https:\/\/\S+$/.test(url)) return res.status(400).json({ error: 'The address must start with https://' })
  await saveBookingUrl(url)
  res.json(await view(req))
})

telegramRouter.post('/test', requireAuth, requireRole('OWNER'), async (req, res) => {
  const me = await prisma.user.findUnique({ where: { id: req.user.id }, select: { telegramChatId: true } })
  if (!me.telegramChatId) return res.status(400).json({ error: 'Connect your own Telegram first (the link above)' })
  const sent = await sendTo(me, 'Проверка: бот школы работает ✅', [[{ text: 'Открыть платформу', url: `${appUrl()}/` }]])
  if (!sent) return res.status(502).json({ error: 'Telegram did not take the message — open the bot and press Start again' })
  res.json({ ok: true })
})
