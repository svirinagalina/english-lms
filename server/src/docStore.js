import { z } from 'zod'
import { prisma } from './db.js'

// A writing document is a list of runs. Base text is what stands; "ins"
// and "del" are the teacher's tracked changes until accepted or rejected.
const MAX_CHARS = 100000
const SAVE_DELAY_MS = 1000

const runSchema = z.object({
  text: z.string().max(20000),
  kind: z.enum(['base', 'ins', 'del', 'image']),
  author: z.string().max(64).optional(),
  // Images sit in the text as one placeholder character each.
  src: z.string().regex(/^\/uploads\/[a-z0-9]+\/[a-z0-9]+\.(png|jpe?g|gif|webp)$/i).optional()
})

export const runsSchema = z.array(runSchema).max(5000).refine(
  (runs) => runs.reduce((n, run) => n + run.text.length, 0) <= MAX_CHARS,
  { message: 'Document too long' }
)

const docs = new Map()
const saveTimers = new Map()

export async function loadDocument(classroomId) {
  if (docs.has(classroomId)) return docs.get(classroomId)
  let record = await prisma.document.findUnique({ where: { classroomId } })
  if (!record) {
    // Two people opening a fresh document at once both try to create it;
    // whoever loses the race reads what the other created.
    try {
      record = await prisma.document.create({ data: { classroomId, runs: [] } })
    } catch {
      record = await prisma.document.findUnique({ where: { classroomId } })
    }
  }
  const runs = Array.isArray(record?.runs) ? record.runs : []
  docs.set(classroomId, runs)
  return runs
}

function scheduleSave(classroomId) {
  clearTimeout(saveTimers.get(classroomId))
  saveTimers.set(
    classroomId,
    setTimeout(async () => {
      saveTimers.delete(classroomId)
      const runs = docs.get(classroomId)
      if (!runs) return
      try {
        await prisma.document.update({ where: { classroomId }, data: { runs } })
      } catch (error) {
        console.error(`Failed to save document ${classroomId}:`, error.message)
      }
    }, SAVE_DELAY_MS)
  )
}

export function replaceDocument(classroomId, runs) {
  docs.set(classroomId, runs)
  scheduleSave(classroomId)
}
