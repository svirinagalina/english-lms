import { Router } from 'express'
import { randomBytes } from 'crypto'
import { z } from 'zod'
import { prisma } from '../db.js'
import { requireAuth, requireRole } from '../auth.js'
import { accessibleClassroom } from './classrooms.js'

export const callsRouter = Router()

const originOf = (req) => process.env.CLIENT_ORIGIN ?? `${req.protocol}://${req.get('host')}`

const callView = (call, origin) => ({
  id: call.id,
  token: call.token,
  title: call.title,
  createdAt: call.createdAt,
  endedAt: call.endedAt,
  link: `${origin}/call/${call.token}`,
  host: call.host ? { id: call.host.id, name: call.host.name } : undefined,
  classroomId: call.classroomId
})

// Public: what a guest sees before joining.
callsRouter.get('/token/:token', async (req, res) => {
  const call = await prisma.call.findUnique({
    where: { token: req.params.token },
    include: { host: { select: { name: true } }, school: { select: { name: true } } }
  })
  if (!call) return res.status(404).json({ error: 'Call not found' })
  if (call.endedAt) return res.status(410).json({ error: 'This call has ended' })

  res.json({
    call: {
      title: call.title,
      host: call.host.name,
      schoolName: call.school.name
    }
  })
})

callsRouter.use(requireAuth)

const createSchema = z.object({
  title: z.string().max(200).optional(),
  classroomId: z.string().optional()
})

callsRouter.post('/', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid data' })

  let classroomId = null
  if (parsed.data.classroomId) {
    const classroom = await accessibleClassroom(req.user, parsed.data.classroomId)
    if (!classroom) return res.status(404).json({ error: 'Classroom not found' })
    classroomId = classroom.id
  }

  const call = await prisma.call.create({
    data: {
      token: randomBytes(9).toString('base64url'),
      title: parsed.data.title?.trim() || null,
      hostId: req.user.id,
      schoolId: req.user.schoolId,
      classroomId
    },
    include: { host: { select: { id: true, name: true } } }
  })

  res.status(201).json({ call: callView(call, originOf(req)) })
})

callsRouter.get('/', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const calls = await prisma.call.findMany({
    where: { hostId: req.user.id, endedAt: null },
    include: { host: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 10
  })
  res.json({ calls: calls.map((call) => callView(call, originOf(req))) })
})

callsRouter.post('/:id/end', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const call = await prisma.call.findFirst({
    where: { id: req.params.id, hostId: req.user.id }
  })
  if (!call) return res.status(404).json({ error: 'Call not found' })

  await prisma.call.update({ where: { id: call.id }, data: { endedAt: new Date() } })
  res.json({ ok: true })
})
