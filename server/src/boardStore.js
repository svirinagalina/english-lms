import { z } from 'zod'
import { prisma } from './db.js'

const MAX_ELEMENTS = 5000
const SAVE_DELAY_MS = 1500

const colour = z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const elementSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(['path', 'rect', 'ellipse', 'arrow', 'text', 'image']),
  color: colour,
  width: z.number().min(1).max(64),
  // Flat [x0, y0, x1, y1, …] list; capped so one stroke cannot bloat the board.
  points: z.array(z.number().finite()).max(4000).optional(),
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  w: z.number().finite().optional(),
  h: z.number().finite().optional(),
  text: z.string().max(2000).optional(),
  fontSize: z.number().min(8).max(200).optional(),
  // Images reference an uploaded file, never inline data — keeps board JSON small.
  src: z.string().regex(/^\/uploads\/[a-z0-9]+\/[a-z0-9]+\.(png|jpe?g|gif|webp)$/i).optional(),
  authorId: z.string().max(64).optional()
})

const boards = new Map()
const saveTimers = new Map()

export async function loadBoard(boardId) {
  if (boards.has(boardId)) return boards.get(boardId)

  const record = await prisma.board.findUnique({ where: { id: boardId } })
  const elements = Array.isArray(record?.elements) ? record.elements : []
  boards.set(boardId, elements)
  return elements
}

function scheduleSave(boardId) {
  clearTimeout(saveTimers.get(boardId))

  saveTimers.set(
    boardId,
    setTimeout(async () => {
      saveTimers.delete(boardId)
      const elements = boards.get(boardId)
      if (!elements) return

      try {
        await prisma.board.update({ where: { id: boardId }, data: { elements } })
      } catch (error) {
        console.error('Failed to save board', boardId, error.message)
      }
    }, SAVE_DELAY_MS)
  )
}

export async function addElement(boardId, element) {
  const elements = await loadBoard(boardId)
  if (elements.length >= MAX_ELEMENTS) return false

  elements.push(element)
  scheduleSave(boardId)
  return true
}

export async function updateElement(boardId, element) {
  const elements = await loadBoard(boardId)
  const index = elements.findIndex((item) => item.id === element.id)
  if (index === -1) return false

  elements[index] = element
  scheduleSave(boardId)
  return true
}

export async function deleteElement(boardId, elementId) {
  const elements = await loadBoard(boardId)
  const index = elements.findIndex((item) => item.id === elementId)
  if (index === -1) return false

  elements.splice(index, 1)
  scheduleSave(boardId)
  return true
}

export async function clearBoard(boardId) {
  boards.set(boardId, [])
  scheduleSave(boardId)
}

export function forgetBoard(boardId) {
  boards.delete(boardId)
}
