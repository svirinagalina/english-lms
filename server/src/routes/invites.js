import { Router } from 'express'
import { enrollStudent } from '../advent.js'
import { randomBytes } from 'crypto'
import { z } from 'zod'
import { prisma } from '../db.js'
import { hashPassword, issueToken, requireAuth, requireRole, isAdmin } from '../auth.js'
import { sendInviteEmail, mailEnabled } from '../mailer.js'

export const invitesRouter = Router()

const INVITE_DAYS = 14

const inviteSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().trim().toLowerCase().email().optional(),
  role: z.enum(['TEACHER', 'STUDENT']),
  // No email: the student's Telegram (@name). The teacher sends the link
  // there; accepting asks for a login and a password (students only).
  telegram: z.string().trim().regex(/^@?[A-Za-z0-9_]{4,32}$/).optional(),
  // Which teacher the invited student will be linked to. Defaults to the inviter.
  teacherId: z.string().optional(),
  // A student already here from a trial lesson link: the invitation gives
  // that same account an email and a password (the board stays theirs).
  userId: z.string().optional()
})

const acceptSchema = z.object({
  password: z.string().min(8).max(200),
  // A Telegram invitation: the login the student picks (letters, digits, . _ -).
  login: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,32}$/).optional()
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
  viaTelegram: invite.viaTelegram,
  telegram: invite.telegram,
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
      // A Telegram invitation has no email: the page asks for a login.
      email: invite.viaTelegram ? null : invite.email,
      needsLogin: invite.viaTelegram,
      role: invite.role,
      schoolName: invite.school.name,
      invitedBy: invite.invitedBy.name
    }
  })
})

invitesRouter.post('/token/:token/accept', async (req, res) => {
  const parsed = acceptSchema.safeParse(req.body)
  if (!parsed.success) {
    if (parsed.error.issues.some((i) => i.path[0] === 'login')) return res.status(400).json({ error: 'Логин: от 3 до 32 латинских букв, цифр, точек, _ или -' })
    return res.status(400).json({ error: 'Password must be at least 8 characters' })
  }

  const invite = await prisma.invite.findUnique({ where: { token: req.params.token } })
  if (!invite) return res.status(404).json({ error: 'Invitation not found' })
  if (invite.acceptedAt) return res.status(410).json({ error: 'This invitation has already been used' })
  if (invite.expiresAt < new Date()) return res.status(410).json({ error: 'This invitation has expired' })
  let username = null
  if (invite.viaTelegram) {
    username = parsed.data.login
    if (!username) return res.status(400).json({ error: 'Придумайте логин' })
    if (await prisma.user.findUnique({ where: { username } })) return res.status(409).json({ error: 'Такой логин уже занят — придумайте другой' })
  }

  const existing = await prisma.user.findUnique({ where: { email: invite.email } })
  if (existing && existing.id !== invite.userId) return res.status(409).json({ error: 'An account with this email already exists' })

  const passwordHash = await hashPassword(parsed.data.password)

  // The trial-link account takes the email and the password.
  if (invite.userId) {
    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({ where: { id: invite.userId }, data: { email: invite.email, passwordHash, viaLink: false } })
      await tx.teacherStudent.upsert({ where: { teacherId_studentId: { teacherId: invite.invitedById, studentId: updated.id } }, create: { teacherId: invite.invitedById, studentId: updated.id }, update: {} })
      await tx.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } })
      return updated
    })
    enrollStudent(user.email, user.name)
    issueToken(res, user)
    return res.status(201).json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, schoolId: user.schoolId } })
  }

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        // A Telegram invitation: the login stands in for the email.
        email: username ? `${username}@login.invalid` : invite.email,
        username,
        messenger: invite.telegram ?? undefined,
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

  // Their Advent trainer account, set up straight away (same email).
  if (user.role === 'STUDENT' && !username) enrollStudent(user.email, user.name)

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
      // Teachers (and the partner) only see the invitations they sent themselves.
      ...(req.user.role !== 'OWNER' ? { invitedById: req.user.id } : {})
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

  const { name, role, teacherId, userId, telegram } = parsed.data
  let { email } = parsed.data

  if (role === 'TEACHER' && !isAdmin(req.user)) {
    return res.status(403).json({ error: 'Only the school owner can invite teachers' })
  }
  if (telegram) {
    if (role !== 'STUDENT' || userId) return res.status(400).json({ error: 'Через Telegram можно пригласить только нового ученика' })
    // A placeholder until the student picks a login (never mailed: .invalid).
    email = `tg-${randomBytes(6).toString('hex')}@telegram.invalid`
  } else if (!email) {
    return res.status(400).json({ error: 'Invalid data', details: { email: ['Required'] } })
  }

  let trialAccount = null
  if (userId) {
    trialAccount = await prisma.user.findFirst({ where: { id: userId, schoolId: req.user.schoolId, role: 'STUDENT', viaLink: true } })
    if (!trialAccount) return res.status(404).json({ error: 'Student not found' })
    if (!isAdmin(req.user) && !(await prisma.teacherStudent.findFirst({ where: { teacherId: req.user.id, studentId: userId } }))) return res.status(404).json({ error: 'Student not found' })
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing?.free && existing.schoolId === req.user.schoolId) {
    return res.status(409).json({ error: 'This person already has a free account from the app. In People, under "Free app users", link them to a teacher — everything opens for them.' })
  }
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
      invitedById: inviterId,
      userId: trialAccount?.id ?? null,
      viaTelegram: Boolean(telegram),
      telegram: telegram ? `@${telegram.replace(/^@/, '')}` : null
    },
    include: { invitedBy: { select: { id: true, name: true } } }
  })

  const view = inviteView(invite, originOf(req))
  if (invite.viaTelegram) return res.status(201).json({ invite: view, delivery: { sent: false, telegram: invite.telegram } })

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
  if (invite.viaTelegram) return res.status(400).json({ error: 'У этого приглашения нет почты — отправьте ссылку в Telegram сами' })

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
