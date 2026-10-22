import { randomBytes } from 'crypto'
import { prisma } from './db.js'
import { notifyCallStarted } from './push.js'
import { linkCallToAdventLesson } from './adventLessons.js'

// A student who came through a trial booking (Maxim's site, the /trial page)
// and hasn't paid yet: every lesson with them is the trial lesson — never a
// counted one, whichever button the teacher pressed (Galina, 2026-10-14).
// Paid = a Stripe purchase or paid lessons in their package.
export async function isUnpaidLead(studentId) {
  if (!studentId) return false
  const booked = await prisma.adventLesson.findFirst({ where: { studentUserId: studentId, kind: 'trial' }, select: { id: true } })
  if (!booked) return false
  if (await prisma.offerPurchase.findFirst({ where: { userId: studentId }, select: { id: true } })) return false
  const student = await prisma.user.findUnique({ where: { id: studentId }, select: { lessonsPaid: true } })
  return !(student?.lessonsPaid > 0)
}

// The trial call for a classroom: opens the board the teacher prepared (or
// the student's own, or a new one), carries on an open trial from the last
// 3 hours, makes the report the teacher fills in afterwards. Used by "Trial
// lesson" and by any "Start lesson" for an unpaid trial student.
export async function startTrialCall(user, classroom, origin, boardId = null) {
  const boards = await prisma.board.findMany({
    where: { scratch: false, OR: [{ classroomId: classroom.id }, { sharedWith: { some: { id: classroom.id } } }] },
    select: { id: true, classroomId: true },
    orderBy: { updatedAt: 'desc' }
  })
  // The board the teacher chose (Timetable, a board's own call button) wins,
  // as long as it is one of this student's.
  let board = boards.find((b) => b.id === boardId) ?? boards.find((b) => b.classroomId !== classroom.id) ?? boards[0]
  if (!board) board = await prisma.board.create({ data: { classroomId: classroom.id, title: `${classroom.student.name} — lessons`, elements: [] } })

  // Pressing it again must not make another lesson and another empty report.
  const open = await prisma.call.findFirst({
    where: { kind: 'TRIAL', hostId: user.id, classroomId: classroom.id, endedAt: null, createdAt: { gt: new Date(Date.now() - 3 * 60 * 60 * 1000) } },
    orderBy: { createdAt: 'desc' }
  })
  const openReport = open && await prisma.trialReport.findUnique({ where: { callId: open.id } })
  if (open && openReport && !openReport.publishedAt) {
    return { status: 200, call: open, body: { call: { id: open.id, token: open.token, link: `${origin}/call/${open.token}` }, reportId: openReport.id, boardId: open.boardId } }
  }

  const call = await prisma.call.create({
    data: {
      token: randomBytes(9).toString('base64url'),
      title: `Trial lesson with ${classroom.student.name}`,
      kind: 'TRIAL',
      hostId: user.id,
      schoolId: user.schoolId,
      classroomId: classroom.id,
      boardId: board.id
    }
  })
  const report = await prisma.trialReport.create({
    data: { classroomId: classroom.id, studentId: classroom.studentId, teacherId: user.id, callId: call.id }
  })
  notifyCallStarted(call.id)
  await linkCallToAdventLesson(call).catch((error) => console.error('[advent] link', error.message))
  return { status: 201, call, body: { call: { id: call.id, token: call.token, link: `${origin}/call/${call.token}` }, reportId: report.id, boardId: board.id } }
}
