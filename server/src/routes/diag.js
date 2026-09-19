import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../auth.js'
import { prisma } from '../db.js'

// Call diagnostics from the browser: what the noise removal and the blur
// did on a person's device, so a failure can be read in the server log
// without asking them for screenshots. Nothing is stored; it goes to the log.
export const diagRouter = Router()
diagRouter.use(requireAuth)

const eventSchema = z.object({
  kind: z.string().max(40),
  message: z.string().max(400).optional(),
  details: z.record(z.string(), z.union([z.string().max(300), z.number(), z.boolean(), z.null()])).optional(),
  // A tiny picture of what the device composed (a 96 px JPEG), base64.
  thumb: z.string().max(12000).optional(),
  device: z.string().max(300).optional(),
  call: z.string().max(40).optional()
})

// A person may report a burst of events, not a stream of them.
const seen = new Map()
const allowed = (userId) => {
  const now = Date.now()
  const entry = seen.get(userId) ?? { count: 0, since: now }
  if (now - entry.since > 10 * 60 * 1000) { entry.count = 0; entry.since = now }
  entry.count += 1
  seen.set(userId, entry)
  return entry.count <= 60
}

diagRouter.post('/', async (req, res) => {
  const parsed = eventSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid event' })
  if (!allowed(req.user.id)) return res.status(429).json({ error: 'Too many events' })
  const { kind, message, details, device, call, thumb } = parsed.data
  if (thumb) console.log(`[diag-thumb] ${req.user.id} ${kind} ${thumb}`)
  const who = await prisma.user.findUnique({ where: { id: req.user.id }, select: { name: true } }).catch(() => null)
  console.log(`[diag] ${who?.name ?? req.user.id} (${req.user.role}) ${call ? `call=${call} ` : ''}${kind}${message ? `: ${message}` : ''}${details ? ' ' + JSON.stringify(details) : ''}${device ? ` | ${device}` : ''}`)
  res.json({ ok: true })
})
