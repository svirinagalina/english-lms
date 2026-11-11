// On a board, a student sees the teacher's work and their own — never another
// student's (Galina, 2026-11-11: «когда один ученик меняет что-то на доске,
// другие это не видят; только изменения учителя видны»). Staff see everything.
// On a group board (one board for several students) a student also may not
// change or delete what isn't theirs: moving the teacher's card would move it
// for the whole group.
import { prisma } from './db.js'

const roles = new Map() // userId → role; a role never changes to or from STUDENT mid-lesson
async function rolesOf(ids) {
  const missing = [...new Set(ids)].filter((id) => id && !roles.has(id))
  if (missing.length) {
    const users = await prisma.user.findMany({ where: { id: { in: missing } }, select: { id: true, role: true } })
    for (const u of users) roles.set(u.id, u.role)
    // A deleted account: whatever it drew counts as the teacher's.
    for (const id of missing) if (!roles.has(id)) roles.set(id, 'GONE')
  }
  return roles
}

export async function byStudent(element) {
  if (!element?.authorId) return false
  return (await rolesOf([element.authorId])).get(element.authorId) === 'STUDENT'
}

// May this viewer see this element? (role is the viewer's.)
export async function visibleTo(viewer, element) {
  if (viewer?.role !== 'STUDENT' || !element?.authorId || element.authorId === viewer.id) return true
  return !(await byStudent(element))
}

// The board as this viewer may see it.
export async function boardFor(viewer, elements) {
  if (viewer?.role !== 'STUDENT') return elements
  const known = await rolesOf(elements.map((e) => e.authorId))
  return elements.filter((e) => !e.authorId || e.authorId === viewer.id || known.get(e.authorId) !== 'STUDENT')
}

// Several students on one board: its own classroom's and everyone it is shared with.
const groupCache = new Map() // boardId → { at, group }
export async function isGroupBoard(boardId) {
  const hit = groupCache.get(boardId)
  if (hit && Date.now() - hit.at < 60_000) return hit.group
  const board = await prisma.board.findUnique({ where: { id: boardId }, select: { scratch: true, classroom: { select: { studentId: true } }, sharedWith: { select: { studentId: true } } } })
  const students = new Set([board?.classroom?.studentId, ...(board?.sharedWith ?? []).map((c) => c.studentId)].filter(Boolean))
  const group = Boolean(board) && (board.scratch || students.size > 1)
  groupCache.set(boardId, { at: Date.now(), group })
  return group
}

export function forgetBoardPrivacyForTests() { roles.clear(); groupCache.clear() }
