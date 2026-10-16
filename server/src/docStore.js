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
  // Formatting that isn't a suggestion: a heading line (listed in the
  // outline) and a highlighter colour.
  h: z.number().int().min(1).max(2).optional(),
  hl: z.enum(['yellow', 'green', 'pink', 'blue']).optional(),
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

async function save(classroomId) {
  saveTimers.delete(classroomId)
  const runs = docs.get(classroomId)
  if (!runs) return
  try {
    await prisma.document.update({ where: { classroomId }, data: { runs } })
  } catch (error) {
    console.error(`Failed to save document ${classroomId}:`, error.message)
  }
}

function scheduleSave(classroomId) {
  clearTimeout(saveTimers.get(classroomId))
  saveTimers.set(classroomId, setTimeout(() => save(classroomId), SAVE_DELAY_MS))
}

// Writes every document still waiting for its save (server shutdown).
export async function flushDocuments() {
  const pending = [...saveTimers.keys()]
  for (const id of pending) clearTimeout(saveTimers.get(id))
  await Promise.all(pending.map(save))
}

export function replaceDocument(classroomId, runs) {
  docs.set(classroomId, runs)
  scheduleSave(classroomId)
}

// Saves what is pending for these cabinets and forgets the cached copies, so
// the next open reads the database (a document moved to another cabinet).
export async function settleDocuments(...classroomIds) {
  for (const id of classroomIds) {
    if (saveTimers.has(id)) { clearTimeout(saveTimers.get(id)); await save(id) }
    docs.delete(id)
  }
}
