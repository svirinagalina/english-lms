import { z } from 'zod'
import { prisma } from './db.js'

const MAX_ELEMENTS = 5000
const SAVE_DELAY_MS = 1500

const colour = z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const elementSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(['path', 'rect', 'ellipse', 'arrow', 'text']),
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
  authorId: z.string().max(64).optional()
})

const boards = new Map()
const saveTimers = new Map()

export async function loadBoard(lessonId) {
  if (boards.has(lessonId)) return boards.get(lessonId)

  const record = await prisma.board.findUnique({ where: { lessonId } })
  const elements = Array.isArray(record?.elements) ? record.elements : []
  boards.set(lessonId, elements)
  return elements
}

function scheduleSave(lessonId) {
  clearTimeout(saveTimers.get(lessonId))

  saveTimers.set(
    lessonId,
    setTimeout(async () => {
      saveTimers.delete(lessonId)
      const elements = boards.get(lessonId)
      if (!elements) return

      try {
        await prisma.board.upsert({
          where: { lessonId },
          create: { lessonId, elements },
          update: { elements }
        })
      } catch (error) {
        console.error('Failed to save board', lessonId, error)
      }
    }, SAVE_DELAY_MS)
  )
}

export async function addElement(lessonId, element) {
  const elements = await loadBoard(lessonId)
  if (elements.length >= MAX_ELEMENTS) return false

  elements.push(element)
  scheduleSave(lessonId)
  return true
}

export async function updateElement(lessonId, element) {
  const elements = await loadBoard(lessonId)
  const index = elements.findIndex((item) => item.id === element.id)
  if (index === -1) return false

  elements[index] = element
  scheduleSave(lessonId)
  return true
}

export async function deleteElement(lessonId, elementId) {
  const elements = await loadBoard(lessonId)
  const index = elements.findIndex((item) => item.id === elementId)
  if (index === -1) return false

  elements.splice(index, 1)
  scheduleSave(lessonId)
  return true
}

export async function clearBoard(lessonId) {
  boards.set(lessonId, [])
  scheduleSave(lessonId)
}
