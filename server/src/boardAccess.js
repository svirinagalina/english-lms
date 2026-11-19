import { prisma } from './db.js'
import { accessibleClassroom } from './routes/classrooms.js'

// May this person put things (pictures, audio) on this board? The same rule
// as opening it over the socket (signaling's boardBelongsHere), without the
// call-room shortcuts: their own classroom's board, one shared with them, or
// the scratch board of an open call in their school.
export async function mayUseBoard(user, boardId) {
  if (typeof boardId !== 'string' || !boardId) return null
  const board = await prisma.board.findUnique({
    where: { id: boardId },
    select: { id: true, classroomId: true, scratch: true, sharedWith: { select: { id: true, studentId: true } } }
  })
  if (!board) return null
  if (board.scratch) {
    const call = await prisma.call.findFirst({ where: { boardId, endedAt: null, classroomId: null, schoolId: user.schoolId }, select: { id: true } })
    if (call) return board
  }
  if (user.role === 'STUDENT' && board.sharedWith.some((c) => c.studentId === user.id)) return board
  if (board.classroomId && await accessibleClassroom(user, board.classroomId)) return board
  if (user.role !== 'STUDENT') {
    for (const c of board.sharedWith) if (await accessibleClassroom(user, c.id)) return board
  }
  return null
}
