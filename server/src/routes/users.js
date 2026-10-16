import { Router } from 'express'
import { prisma } from '../db.js'
import { limitedToSite, peopleScope, siteStudentIds, maySeeStudent } from '../partnerScope.js'
import { requireAuth, requireRole, isAdmin } from '../auth.js'
import { enrollStudent, moveStudent, unenrollStudent } from '../advent.js'
import { loadBoard } from '../boardStore.js'
import { ensureClassroom, carryStudentOver } from './classrooms.js'

export const usersRouter = Router()

usersRouter.use(requireAuth)

const personView = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  createdAt: user.createdAt,
  priceAmount: user.priceAmount,
  priceCurrency: user.priceCurrency,
  paymentLink: user.paymentLink,
  paidUntil: user.paidUntil,
  // Signed up in the app, no teacher yet (see freeTier.js).
  free: user.free,
  // Came by a trial booking, no email and password yet (the invite form offers them).
  viaLink: user.viaLink,
  trialRequestedAt: user.trialRequestedAt,
  trialRequestNote: user.trialRequestNote,
  plan: user.plan && user.planUntil && new Date(user.planUntil) > new Date() ? { id: user.plan, until: user.planUntil, source: user.planSource } : null,
  contact: [user.messenger, user.phone].filter(Boolean).join(' · ') || null,
  teachers: user.studentLinks?.map((link) => ({ id: link.teacher.id, name: link.teacher.name })),
  students: user.teacherLinks?.map((link) => ({ id: link.student.id, name: link.student.name })),
  // A student's cabinets (one per teacher), for "Open cabinet" in People.
  // A cabinet of a former teacher with nothing in it is not worth listing.
  classrooms: user.studentClassrooms
    ?.filter((c) => user.studentLinks?.some((l) => l.teacher.id === c.teacherId) || c._count.sessions + c._count.boards + c._count.sharedBoards > 0)
    .map((c) => ({ id: c.id, teacherId: c.teacherId }))
})

const SELECT = {
  id: true, name: true, email: true, role: true, createdAt: true,
  priceAmount: true, priceCurrency: true, paymentLink: true, paidUntil: true,
  free: true, viaLink: true, trialRequestedAt: true, trialRequestNote: true, messenger: true, phone: true,
  studentLinks: { include: { teacher: { select: { id: true, name: true } } } },
  teacherLinks: { include: { student: { select: { id: true, name: true } } } },
  studentClassrooms: { select: { id: true, teacherId: true, _count: { select: { sessions: true, boards: true, sharedBoards: true } } } }
}

// Everyone sees a different slice: the owner sees the school, a teacher sees
// their own students, a student sees their teachers.
usersRouter.get('/', async (req, res) => {
  if (isAdmin(req.user)) {
    const users = await prisma.user.findMany({
      where: { schoolId: req.user.schoolId, ...(await peopleScope(req.user)) },
      select: SELECT,
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }]
    })
    let people = users.map(personView)
    // The partner: a teacher's list of students shows only the site's too.
    if (limitedToSite(req.user)) {
      const site = new Set(await siteStudentIds())
      people = people.map((p) => ({ ...p, students: p.students?.filter((s) => site.has(s.id)) }))
    }
    return res.json({ people })
  }

  if (req.user.role === 'TEACHER') {
    const links = await prisma.teacherStudent.findMany({
      where: { teacherId: req.user.id },
      include: { student: { select: SELECT } }
    })
    return res.json({ people: links.map((link) => personView(link.student)) })
  }

  const links = await prisma.teacherStudent.findMany({
    where: { studentId: req.user.id },
    include: { teacher: { select: { id: true, name: true, email: true, role: true, createdAt: true } } }
  })
  res.json({ people: links.map((link) => personView(link.teacher)) })
})

usersRouter.get('/teachers', requireRole('OWNER'), async (req, res) => {
  const teachers = await prisma.user.findMany({
    where: { schoolId: req.user.schoolId, role: { in: ['OWNER', 'PARTNER', 'TEACHER'] } },
    select: { id: true, name: true, role: true },
    orderBy: { createdAt: 'asc' }
  })
  res.json({ teachers })
})

// A lesson whose end was never recorded is read as at most this long.
const OPEN_LESSON_MS = 2 * 3600 * 1000
// Elements added this close before a lesson started or after it ended still belong to it.
const LESSON_MARGIN_MS = 60 * 1000
// A call made this long before its lesson started still belongs to it.
const CALL_LEAD_MS = 30 * 60 * 1000

// A teacher's lessons, for the administrator: with whom, when, how long, and
// the board(s) written on during each. The board is found by when its
// elements were added (and by whom), not by where it is attached today, so
// it stays right after a board has been reassigned to someone else.
usersRouter.get('/:id/lessons', requireRole('OWNER'), async (req, res) => {
  const teacher = await prisma.user.findFirst({
    where: { id: req.params.id, schoolId: req.user.schoolId, role: { in: ['OWNER', 'PARTNER', 'TEACHER'] } },
    select: { id: true, name: true, email: true, role: true }
  })
  if (!teacher) return res.status(404).json({ error: 'Teacher not found' })

  const sessions = await prisma.session.findMany({
    where: { classroom: { teacherId: teacher.id, studentId: limitedToSite(req.user) ? { in: await siteStudentIds() } : { not: null } } },
    orderBy: { startedAt: 'desc' },
    include: { classroom: { select: { id: true, student: { select: { id: true, name: true } } } } }
  })

  // Every board these lessons could have used: the teacher's own shelf and
  // students' boards, and boards shared into their students' spaces.
  const boards = await prisma.board.findMany({
    where: { scratch: false, OR: [{ classroom: { teacherId: teacher.id } }, { sharedWith: { some: { teacherId: teacher.id } } }] },
    select: { id: true, title: true, classroomId: true, sharedWith: { select: { id: true } } }
  })
  // The board each call was started on: the fallback for a lesson where
  // the board was shown but nothing new was added to it.
  const calls = await prisma.call.findMany({
    where: { hostId: teacher.id, boardId: { not: null }, classroomId: { not: null } },
    select: { classroomId: true, boardId: true, createdAt: true },
    orderBy: { createdAt: 'asc' }
  })
  const missing = [...new Set(calls.map((c) => c.boardId))].filter((id) => !boards.some((b) => b.id === id))
  if (missing.length) {
    boards.push(...await prisma.board.findMany({
      where: { id: { in: missing }, scratch: false },
      select: { id: true, title: true, classroomId: true, sharedWith: { select: { id: true } } }
    }))
  }
  const boardById = new Map(boards.map((b) => [b.id, b]))
  const added = [] // { at, boardId, elementId, authorId }, sorted by time
  for (const board of boards) {
    for (const element of await loadBoard(board.id)) {
      if (typeof element.at === 'number') added.push({ at: element.at, boardId: board.id, elementId: element.id, authorId: element.authorId })
    }
  }
  added.sort((a, b) => a.at - b.at)
  const firstAtOrAfter = (time) => {
    let lo = 0, hi = added.length
    while (lo < hi) { const mid = (lo + hi) >> 1; if (added[mid].at < time) lo = mid + 1; else hi = mid }
    return lo
  }

  const now = Date.now()
  const lessons = sessions.map((session) => {
    const start = session.startedAt.getTime()
    const end = session.endedAt ? session.endedAt.getTime() : Math.min(now, start + OPEN_LESSON_MS)
    const student = session.classroom.student
    const people = new Set([teacher.id, student.id])
    const used = new Map() // boardId → { count, focus }
    for (let i = firstAtOrAfter(start - LESSON_MARGIN_MS); i < added.length && added[i].at <= end + LESSON_MARGIN_MS; i++) {
      const item = added[i]
      if (item.authorId && !people.has(item.authorId)) continue
      const entry = used.get(item.boardId) ?? { count: 0, focus: item.elementId }
      entry.count += 1
      used.set(item.boardId, entry)
    }
    if (!used.size) {
      // Nothing added: the board the lesson's call was started on, if any.
      const call = calls.filter((c) => c.classroomId === session.classroom.id && c.createdAt.getTime() >= start - CALL_LEAD_MS && c.createdAt.getTime() <= end).pop()
      if (call && boardById.has(call.boardId)) used.set(call.boardId, { count: 0, focus: null })
    }
    const lessonBoards = [...used.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([boardId, { count, focus }]) => {
        const board = boardById.get(boardId)
        // Opened from the student's space when the board is still theirs,
        // otherwise from wherever it lives now.
        const here = board.classroomId === session.classroom.id || board.sharedWith.some((c) => c.id === session.classroom.id)
        return { id: board.id, title: board.title, added: count, classroomId: here ? session.classroom.id : board.classroomId, focus }
      })
    return {
      id: session.id,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      minutes: Math.max(1, Math.round((end - start) / 60000)),
      counted: session.counted,
      note: session.note,
      // A group lesson: the same callId on each student's session.
      groupId: session.callId ?? null,
      groupSize: session.callId ? sessions.filter((s) => s.callId === session.callId).length : 1,
      student,
      classroomId: session.classroom.id,
      boards: lessonBoards
    }
  })

  res.json({ teacher, lessons })
})

usersRouter.post('/links', requireRole('OWNER'), async (req, res) => {
  const { teacherId, studentId } = req.body ?? {}
  if (typeof teacherId !== 'string' || typeof studentId !== 'string') {
    return res.status(400).json({ error: 'teacherId and studentId are required' })
  }

  const [teacher, student] = await Promise.all([
    prisma.user.findFirst({
      where: { id: teacherId, schoolId: req.user.schoolId, role: { in: ['OWNER', 'PARTNER', 'TEACHER'] } }
    }),
    prisma.user.findFirst({
      where: { id: studentId, schoolId: req.user.schoolId, role: 'STUDENT' }
    })
  ])

  if (!teacher) return res.status(404).json({ error: 'Teacher not found' })
  if (!student || !(await maySeeStudent(req.user, student.id))) return res.status(404).json({ error: 'Student not found' })

  await prisma.teacherStudent.upsert({
    where: { teacherId_studentId: { teacherId, studentId } },
    create: { teacherId, studentId },
    update: {}
  })
  // A free app user with a teacher is a student: everything opens, and the
  // trainer gets full access like every other student's.
  if (student.free) {
    await prisma.user.update({ where: { id: student.id }, data: { free: false } })
    enrollStudent(student.email, student.name)
  }

  res.status(201).json({ ok: true })
})

// Taking a teacher away from a student. Nothing is deleted: the old cabinet
// keeps its lessons as history, and the student's board and Writing move to
// the cabinet of the teacher they still have (the newest one), if that
// cabinet has no board yet. With no teacher left, the board stays where it
// is and the student still sees it.
async function removeTeacher(teacherId, studentId, schoolId) {
  const link = await prisma.teacherStudent.findUnique({ where: { teacherId_studentId: { teacherId, studentId } } })
  if (!link) return { boards: [], writing: false }
  await prisma.teacherStudent.delete({ where: { id: link.id } })
  const fromRoom = await prisma.classroom.findUnique({ where: { teacherId_studentId: { teacherId, studentId } } })
  const next = await prisma.teacherStudent.findFirst({ where: { studentId }, orderBy: { createdAt: 'desc' } })
  if (!fromRoom || !next) return { boards: [], writing: false }
  return carryStudentOver(fromRoom, await ensureClassroom(next.teacherId, studentId, schoolId))
}

usersRouter.delete('/links/:teacherId/:studentId', requireRole('OWNER'), async (req, res) => {
  const { teacherId, studentId } = req.params

  const teacher = await prisma.user.findFirst({
    where: { id: teacherId, schoolId: req.user.schoolId }
  })
  if (!teacher) return res.status(404).json({ error: 'Teacher not found' })
  if (!(await maySeeStudent(req.user, studentId))) return res.status(404).json({ error: 'Student not found' })

  const moved = await removeTeacher(teacherId, studentId, req.user.schoolId)
  res.json({ ok: true, moved })
})

// Change of teacher in one step: the new one is linked, the old one removed,
// and the student's board and Writing go to the new teacher's cabinet.
usersRouter.post('/:id/change-teacher', requireRole('OWNER'), async (req, res) => {
  const { from, to } = req.body ?? {}
  if (typeof from !== 'string' || typeof to !== 'string' || from === to) return res.status(400).json({ error: 'from and to are required' })
  const [teacher, student] = await Promise.all([
    prisma.user.findFirst({ where: { id: to, schoolId: req.user.schoolId, role: { in: ['OWNER', 'PARTNER', 'TEACHER'] } } }),
    prisma.user.findFirst({ where: { id: req.params.id, schoolId: req.user.schoolId, role: 'STUDENT' } })
  ])
  if (!teacher) return res.status(404).json({ error: 'Teacher not found' })
  if (!student || !(await maySeeStudent(req.user, student.id))) return res.status(404).json({ error: 'Student not found' })
  if (!(await prisma.teacherStudent.findUnique({ where: { teacherId_studentId: { teacherId: from, studentId: student.id } } }))) {
    return res.status(404).json({ error: 'This teacher is not linked to the student' })
  }

  // Re-linking an old teacher counts as the newest link, so the board goes there.
  await prisma.teacherStudent.deleteMany({ where: { teacherId: to, studentId: student.id } })
  await prisma.teacherStudent.create({ data: { teacherId: to, studentId: student.id } })
  await ensureClassroom(to, student.id, req.user.schoolId)
  const moved = await removeTeacher(from, student.id, req.user.schoolId)
  res.json({ ok: true, moved })
})

// Only the owner hands out roles; a partner cannot promote or demote anyone.
// Takes effect on the person's next request — no re-login needed.
const ASSIGNABLE_ROLES = ['TEACHER', 'STUDENT', 'PARTNER']

usersRouter.patch('/:id/role', async (req, res) => {
  if (req.user.role !== 'OWNER') return res.status(403).json({ error: 'Only the administrator can change roles' })
  const { role } = req.body ?? {}
  if (!ASSIGNABLE_ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' })

  const target = await prisma.user.findFirst({
    where: { id: req.params.id, schoolId: req.user.schoolId }
  })
  if (!target) return res.status(404).json({ error: 'User not found' })
  if (target.id === req.user.id) return res.status(400).json({ error: 'Cannot change your own role' })

  // Staff are never on the free tier.
  await prisma.user.update({ where: { id: target.id }, data: { role, ...(role !== 'STUDENT' ? { free: false } : {}) } })
  res.json({ ok: true })
})

// Name and email of a student or teacher can be corrected by an admin.
// The owner edits anyone's name and email; a teacher, the name of one of
// their own students (a typo, a surname added after a trial lesson).
usersRouter.patch('/:id', requireRole('OWNER', 'TEACHER', 'PARTNER'), async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : undefined
  let email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : undefined
  if (req.user.role !== 'OWNER') {
    const own = await prisma.teacherStudent.findFirst({ where: { teacherId: req.user.id, studentId: req.params.id } })
    if (!own) return res.status(403).json({ error: 'You can only rename your own students' })
    email = undefined
  }
  if (name !== undefined && (name.length < 2 || name.length > 80)) return res.status(400).json({ error: 'Name must be 2–80 characters' })
  if (email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email' })

  const target = await prisma.user.findFirst({ where: { id: req.params.id, schoolId: req.user.schoolId } })
  if (!target) return res.status(404).json({ error: 'User not found' })
  if (req.user.role !== 'OWNER' && isAdmin(target) && target.id !== req.user.id) {
    return res.status(403).json({ error: 'Only the administrator can edit an administrator or partner' })
  }
  if (email && email !== target.email && await prisma.user.findUnique({ where: { email } })) {
    return res.status(409).json({ error: 'An account with this email already exists' })
  }

  await prisma.user.update({ where: { id: target.id }, data: { ...(name !== undefined ? { name } : {}), ...(email !== undefined ? { email } : {}) } })
  if (target.role === 'STUDENT' && email && email !== target.email) moveStudent(target.email, email, name ?? target.name)
  res.json({ ok: true })
})

usersRouter.delete('/:id', requireRole('OWNER'), async (req, res) => {
  const target = await prisma.user.findFirst({
    where: { id: req.params.id, schoolId: req.user.schoolId }
  })
  if (!target || (target.role === 'STUDENT' && !(await maySeeStudent(req.user, target.id)))) return res.status(404).json({ error: 'User not found' })
  if (target.id === req.user.id) return res.status(400).json({ error: 'Cannot remove yourself' })
  if (req.user.role !== 'OWNER' && isAdmin(target)) {
    return res.status(403).json({ error: 'Only the administrator can remove an administrator or partner' })
  }

  await prisma.user.delete({ where: { id: target.id } })
  if (target.role === 'STUDENT') unenrollStudent(target.email)
  res.json({ ok: true })
})
