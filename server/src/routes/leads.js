import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db.js'
import { requireAuth, requireRole } from '../auth.js'
import { rateLimit } from '../resilience.js'
import { sendLeadEmail } from '../mailer.js'
import { notifyLead } from '../push.js'
import { sendTo, esc } from '../telegram.js'

// Requests from forms on the public website (the IELTS page, and the home
// page for people who want to study on the platform on their own). Anyone
// may send one; the owners read them in People and get an email, a push and
// a Telegram message (if they connected the school's bot).
export const leadsRouter = Router()

const SOURCES = ['ielts', 'toefl', 'platform']
const text = (max) => z.string().trim().max(max).optional().transform((v) => v || null)

const schema = z.object({
  source: z.enum(SOURCES),
  name: z.string().trim().min(1).max(100),
  messenger: text(120),
  email: z.string().trim().max(160).optional().transform((v) => v || null).refine((v) => v === null || /^\S+@\S+\.\S+$/.test(v), 'Check the email address'),
  comment: text(2000),
  // A field real people never see: bots fill it in.
  website: z.string().optional()
})

async function schoolForLeads() {
  if (process.env.PUBLIC_SCHOOL_ID) return prisma.school.findUnique({ where: { id: process.env.PUBLIC_SCHOOL_ID } })
  return prisma.school.findFirst({ orderBy: { createdAt: 'asc' } })
}

leadsRouter.post('/', rateLimit({ windowMs: 60 * 60_000, max: 8, message: 'Too many requests from this address. Please try again later.' }), async (req, res) => {
  const parsed = schema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check the form' })
  const { website, ...data } = parsed.data
  // A bot: say thanks and keep nothing.
  if (website) return res.status(201).json({ ok: true })
  if (!data.messenger && !data.email) return res.status(400).json({ error: 'Leave a messenger or an email so we can answer' })

  const school = await schoolForLeads()
  if (!school) return res.status(503).json({ error: 'The site is not ready yet' })
  const lead = await prisma.lead.create({ data: { ...data, schoolId: school.id } })

  const origin = process.env.CLIENT_ORIGIN ?? `${req.protocol}://${req.get('host')}`
  const owners = await prisma.user.findMany({ where: { schoolId: school.id, role: 'OWNER' }, select: { email: true, telegramChatId: true } })
  for (const owner of owners) sendLeadEmail({ to: owner.email, lead, link: `${origin}/people` })
  notifyLead(lead)
  const rows = [['Имя', lead.name], ['Мессенджер', lead.messenger], ['Почта', lead.email], ['Комментарий', lead.comment]].filter(([, v]) => v)
  const message = `<b>${{ platform: 'Заявка: самостоятельные занятия на платформе', toefl: 'Заявка: курс TOEFL' }[lead.source] ?? 'Заявка со страницы IELTS / TOEFL'}</b>\n${rows.map(([k, v]) => `${k}: ${esc(v)}`).join('\n')}`
  for (const owner of owners) sendTo(owner, message, [[{ text: 'Открыть заявки', url: `${origin}/people` }]]).catch(() => {})
  res.status(201).json({ ok: true })
})

// The owners' list, newest first.
leadsRouter.get('/', requireAuth, requireRole('OWNER', 'PARTNER'), async (req, res) => {
  const leads = await prisma.lead.findMany({ where: { schoolId: req.user.schoolId }, orderBy: { createdAt: 'desc' }, take: 200 })
  res.json({ leads })
})

leadsRouter.patch('/:id', requireAuth, requireRole('OWNER', 'PARTNER'), async (req, res) => {
  const lead = await prisma.lead.findFirst({ where: { id: req.params.id, schoolId: req.user.schoolId } })
  if (!lead) return res.status(404).json({ error: 'Request not found' })
  const updated = await prisma.lead.update({ where: { id: lead.id }, data: { handled: Boolean(req.body?.handled) } })
  res.json({ lead: updated })
})
