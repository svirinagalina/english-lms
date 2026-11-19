import { z } from 'zod'
import { prisma } from './db.js'
import { debouncedSaver } from './saver.js'

const MAX_ELEMENTS = 5000
const SAVE_DELAY_MS = 1500

const colour = z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const elementSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(['path', 'rect', 'ellipse', 'arrow', 'text', 'image', 'note', 'sticker', 'audio']),
  // Which drawn sticker ("well-done", "great-job").
  kind: z.string().max(32).optional(),
  color: colour,
  width: z.number().min(1).max(64),
  // Flat [x0, y0, x1, y1, …] list; capped so one stroke cannot bloat the board.
  points: z.array(z.number().finite()).max(4000).optional(),
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  w: z.number().finite().optional(),
  h: z.number().finite().optional(),
  text: z.string().max(40000).optional(), // a long reading with coloured words runs well past 4000 (2026-10-21)
  // Marker strokes are translucent; notes carry their own background.
  highlight: z.boolean().optional(),
  fill: colour.optional(),
  fontSize: z.number().min(8).max(2000).optional(),
  // Images reference an uploaded file, never inline data — keeps board JSON small.
  // Visible part of an image as fractions of its natural size, so cropping
  // never touches the stored file and can be undone.
  crop: z.object({
    x: z.number().min(0).max(1), y: z.number().min(0).max(1),
    w: z.number().min(0.01).max(1), h: z.number().min(0.01).max(1)
  }).optional(),
  src: z.string().regex(/^\/uploads\/[a-z0-9]+\/[a-z0-9]+\.(png|jpe?g|gif|webp|mp3|wav|m4a|aac|ogg|flac)$/i).optional(),
  // An audio card's title (the Drive file's name).
  name: z.string().max(200).optional(),
  authorId: z.string().max(64).optional(),
  // A note written with the Mistake tool points at its notebook record.
  mistakeId: z.string().max(64).optional(),
  // When the element was added (set by the server), so a lesson's summary
  // knows what appeared during it.
  at: z.number().int().positive().optional()
})

// Rounding noise from the client's crop maths (1.0000000002, -1e-17) is not
// a reason to throw a whole edit away.
export function tidyElement(raw) {
  if (!raw || typeof raw !== 'object' || !raw.crop || typeof raw.crop !== 'object') return raw
  const clamp = (v, lo) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(lo, v)) : v)
  const { x, y, w, h } = raw.crop
  return { ...raw, crop: { x: clamp(x, 0), y: clamp(y, 0), w: clamp(w, 0.01), h: clamp(h, 0.01) } }
}

const boards = new Map()
// boardId → { studentId: { elementId: [dx, dy] } }: see studentMoves below.
const moves = new Map()

export async function loadBoard(boardId) {
  if (boards.has(boardId)) return boards.get(boardId)

  const record = await prisma.board.findUnique({ where: { id: boardId } })
  const elements = Array.isArray(record?.elements) ? record.elements : []
  const stored = record?.studentMoves
  boards.set(boardId, elements)
  moves.set(boardId, stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {})
  return elements
}

const saver = debouncedSaver('board', async (boardId) => {
  const elements = boards.get(boardId)
  if (!elements) return
  await prisma.board.update({ where: { id: boardId }, data: { elements, studentMoves: moves.get(boardId) ?? {} } })
}, SAVE_DELAY_MS)

// --- A student's own layout on a group board ----------------------------------
// Galina, 2026-11-14: a student wants to push the teacher's cards aside to
// make room for her own words, and the others must not see that. So a
// student moving something that is not theirs on a group board is kept as
// their own shift of it, applied only to what they are sent.

export function shiftElement(element, shift) {
  if (!shift) return element
  const [dx, dy] = shift
  if (element.type === 'path') return { ...element, points: (element.points ?? []).map((v, i) => (i % 2 === 0 ? v + dx : v + dy)) }
  return { ...element, x: (element.x ?? 0) + dx, y: (element.y ?? 0) + dy }
}

// [dx, dy] when `incoming` is `stored` only moved (nothing else changed), else null.
export function movedOnly(stored, incoming) {
  if (!stored || !incoming || stored.type !== incoming.type) return null
  let dx, dy
  if (stored.type === 'path') {
    if (!stored.points?.length || stored.points.length !== incoming.points?.length) return null
    dx = incoming.points[0] - stored.points[0]
    dy = incoming.points[1] - stored.points[1]
  } else {
    dx = (incoming.x ?? 0) - (stored.x ?? 0)
    dy = (incoming.y ?? 0) - (stored.y ?? 0)
  }
  const near = (a, b) => Math.abs(a - b) < 0.01
  const expected = shiftElement(stored, [dx, dy])
  const keys = new Set([...Object.keys(expected), ...Object.keys(incoming)])
  for (const key of keys) {
    if (key === 'authorId' || key === 'at') continue
    const a = expected[key], b = incoming[key]
    if (key === 'points' || key === 'x' || key === 'y') {
      if (key === 'points' ? !(a?.length === b?.length && a.every((v, i) => near(v, b[i]))) : !near(a ?? 0, b ?? 0)) return null
    } else if (JSON.stringify(a) !== JSON.stringify(b)) return null
  }
  return [dx, dy]
}

export async function studentMovesOf(boardId, studentId) {
  await loadBoard(boardId)
  return moves.get(boardId)?.[studentId] ?? {}
}

// Stores the student's shift of one element (none when it is back in place).
export async function setStudentMove(boardId, studentId, elementId, shift) {
  await loadBoard(boardId)
  const all = moves.get(boardId) ?? {}
  const mine = { ...(all[studentId] ?? {}) }
  if (!shift || (Math.abs(shift[0]) < 0.5 && Math.abs(shift[1]) < 0.5)) delete mine[elementId]
  else mine[elementId] = [shift[0], shift[1]]
  const next = { ...all }
  if (Object.keys(mine).length) next[studentId] = mine
  else delete next[studentId]
  moves.set(boardId, next)
  scheduleSave(boardId)
}

const scheduleSave = (boardId) => saver.schedule(boardId)

// Writes every board still waiting for its save — called when the server
// is shutting down, so the last strokes before a deploy are not lost.
export const flushBoards = () => saver.flush()
export const failingBoardSaves = () => saver.failing()

export async function addElement(boardId, element) {
  const elements = await loadBoard(boardId)
  // The same element can arrive twice (a retry, a second tab); keep one copy.
  const index = elements.findIndex((item) => item.id === element.id)
  if (index !== -1) elements[index] = keepOrigin(elements[index], element)
  else if (elements.length >= MAX_ELEMENTS) return false
  else {
    if (hasTwin(elements, element)) return false
    elements.push(element)
  }
  scheduleSave(boardId)
  return true
}

// A paste that fired several times stacks identical texts on one spot: a
// text or note with the same words already sitting exactly there counts as
// the same one. Short texts are left alone (two "A"s at one spot are legal).
function hasTwin(elements, element) {
  if (element.type !== 'text' && element.type !== 'note') return false
  if (!element.text || element.text.length < 20) return false
  return elements.some((item) => item.id !== element.id && item.type === element.type && item.text === element.text && item.x === element.x && item.y === element.y)
}

// Who made an element and when stay as first stored: a client's copy cannot
// rewrite them (a teacher's lesson list is built from authorId + at).
const keepOrigin = (stored, element) => ({ ...element, authorId: stored.authorId, at: stored.at })

export async function updateElement(boardId, element, authorId) {
  const elements = await loadBoard(boardId)
  const index = elements.findIndex((item) => item.id === element.id)
  // A live update can outrun the add that created the element; accept it.
  if (index === -1) {
    if (elements.length >= MAX_ELEMENTS || hasTwin(elements, element)) return false
    elements.push({ ...element, authorId, at: element.at ?? Date.now() })
  } else {
    elements[index] = keepOrigin(elements[index], element)
  }
  scheduleSave(boardId)
  return true
}

export async function deleteElement(boardId, elementId) {
  const elements = await loadBoard(boardId)
  const remaining = elements.filter((item) => item.id !== elementId)
  if (remaining.length === elements.length) return false

  elements.splice(0, elements.length, ...remaining)
  scheduleSave(boardId)
  return true
}

export async function clearBoard(boardId) {
  boards.set(boardId, [])
  moves.set(boardId, {})
  scheduleSave(boardId)
}

export function forgetBoard(boardId) {
  boards.delete(boardId)
  moves.delete(boardId)
}
