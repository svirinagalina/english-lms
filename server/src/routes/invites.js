import { Router } from 'express'
import { randomBytes } from 'crypto'
import { z } from 'zod'
import { prisma } from '../db.js'
import { hashPassword, issueToken, requireAuth, requireRole, isAdmin } from '../auth.js'
import { sendInviteEmail, mailEnabled } from '../mailer.js'

export const invitesRouter = Router()

const INVITE_DAYS = 14

const inviteSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  role: z.enum(['TEACHER', 'STUDENT']),
  // Which teacher the invited student will be linked to. Defaults to the inviter.
  teacherId: z.string().optional()
})

const acceptSchema = z.object({
  password: z.string().min(8).max(200)
})

const inviteView = (invite, origin) => ({
  id: invite.id,
  name: invite.name,
  email: invite.email,
  role: invite.role,
  createdAt: invite.createdAt,
  expiresAt: invite.expiresAt,
  acceptedAt: invite.acceptedAt,
  teacher: invite.invitedBy ? { id: invite.invitedBy.id, name: invite.invitedBy.name } : undefined,
  link: `${origin}/join/${invite.token}`
})

const originOf = (req) => process.env.CLIENT_ORIGIN ?? `${req.protocol}://${req.get('host')}`

// --- Public: opening and accepting an invitation -----------------------------

invitesRouter.get('/token/:token', async (req, res) => {
  const invite = await prisma.invite.findUnique({
    where: { token: req.params.token },
    include: {
      school: { select: { name: true } },
      invitedBy: { select: { name: true } }
    }
  })

  if (!invite) return res.status(404).json({ error: 'Invitation not found' })
  if (invite.acceptedAt) return res.status(410).json({ error: 'This invitation has already been used' })
  if (invite.expiresAt < new Date()) return res.status(410).json({ error: 'This invitation has expired' })

  res.json({
    invite: {
      name: invite.name,
      email: invite.email,
      role: invite.role,
      schoolName: invite.school.name,
      invitedBy: invite.invitedBy.name
    }
  })
})

invitesRouter.post('/token/:token/accept', async (req, res) => {
  const parsed = acceptSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' })
  }

  const invite = await prisma.invite.findUnique({ where: { token: req.params.token } })
  if (!invite) return res.status(404).json({ error: 'Invitation not found' })
  if (invite.acceptedAt) return res.status(410).json({ error: 'This invitation has already been used' })
  if (invite.expiresAt < new Date()) return res.status(410).json({ error: 'This invitation has expired' })

  const existing = await prisma.user.findUnique({ where: { email: invite.email } })
  if (existing) return res.status(409).json({ error: 'An account with this email already exists' })

  const passwordHash = await hashPassword(parsed.data.password)

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email: invite.email,
        name: invite.name,
        passwordHash,
        role: invite.role,
        schoolId: invite.schoolId
      }
    })

    // A student joins linked to whoever invited them.
    if (invite.role === 'STUDENT') {
      await tx.teacherStudent.create({
        data: { teacherId: invite.invitedById, studentId: created.id }
      })
    }

    await tx.invite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() }
    })

    return created
  })

  issueToken(res, user)
  res.status(201).json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role, schoolId: user.schoolId }
  })
})

// --- Authenticated: managing invitations -------------------------------------

invitesRouter.use(requireAuth)

invitesRouter.get('/mail-status', requireRole('OWNER', 'TEACHER'), (req, res) => {
  res.json({ enabled: mailEnabled(), from: process.env.MAIL_FROM ?? null })
})

invitesRouter.get('/', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const invites = await prisma.invite.findMany({
    where: {
      schoolId: req.user.schoolId,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
      // Teachers only see the invitations they sent themselves.
      ...(req.user.role === 'TEACHER' ? { invitedById: req.user.id } : {})
    },
    include: { invitedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' }
  })

  res.json({ invites: invites.map((invite) => inviteView(invite, originOf(req))) })
})

invitesRouter.post('/', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const parsed = inviteSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid data', details: parsed.error.flatten().fieldErrors })
  }

  const { name, email, role, teacherId } = parsed.data

  if (role === 'TEACHER' && !isAdmin(req.user)) {
    return res.status(403).json({ error: 'Only the school owner can invite teachers' })
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return res.status(409).json({ error: 'An account with this email already exists' })

  // The owner may invite a student on behalf of another teacher.
  let inviterId = req.user.id
  if (role === 'STUDENT' && teacherId && isAdmin(req.user)) {
    const teacher = await prisma.user.findFirst({
      where: { id: teacherId, schoolId: req.user.schoolId, role: { in: ['OWNER', 'PARTNER', 'TEACHER'] } }
    })
    if (!teacher) return res.status(404).json({ error: 'Teacher not found' })
    inviterId = teacher.id
  }

  await prisma.invite.deleteMany({ where: { email, acceptedAt: null } })

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + INVITE_DAYS)

  const invite = await prisma.invite.create({
    data: {
      token: randomBytes(24).toString('base64url'),
      name,
      email,
      role,
      expiresAt,
      schoolId: req.user.schoolId,
      invitedById: inviterId
    },
    include: { invitedBy: { select: { id: true, name: true } } }
  })

  const view = inviteView(invite, originOf(req))

  const delivery = await sendInviteEmail({
    to: invite.email,
    name: invite.name,
    inviterName: invite.invitedBy.name,
    schoolName: (await prisma.school.findUnique({
      where: { id: invite.schoolId },
      select: { name: true }
    }))?.name ?? 'the school',
    role: invite.role,
    link: view.link
  })

  res.status(201).json({ invite: view, delivery })
})

invitesRouter.post('/:id/resend', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const invite = await prisma.invite.findFirst({
    where: {
      id: req.params.id,
      schoolId: req.user.schoolId,
      acceptedAt: null,
      ...(req.user.role === 'TEACHER' ? { invitedById: req.user.id } : {})
    },
    include: {
      invitedBy: { select: { id: true, name: true } },
      school: { select: { name: true } }
    }
  })
  if (!invite) return res.status(404).json({ error: 'Invitation not found' })

  const delivery = await sendInviteEmail({
    to: invite.email,
    name: invite.name,
    inviterName: invite.invitedBy.name,
    schoolName: invite.school.name,
    role: invite.role,
    link: inviteView(invite, originOf(req)).link
  })

  res.json({ delivery })
})

invitesRouter.delete('/:id', requireRole('OWNER', 'TEACHER'), async (req, res) => {
  const invite = await prisma.invite.findFirst({
    where: {
      id: req.params.id,
      schoolId: req.user.schoolId,
      ...(req.user.role === 'TEACHER' ? { invitedById: req.user.id } : {})
    }
  })
  if (!invite) return res.status(404).json({ error: 'Invitation not found' })

  await prisma.invite.delete({ where: { id: invite.id } })
  res.json({ ok: true })
})
