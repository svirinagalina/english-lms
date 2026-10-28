import { z } from 'zod'
import { prisma } from './db.js'
import { debouncedSaver } from './saver.js'

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

// A key is a classroom id (its one Writing document) or "hw:<id>" for a
// homework document.
export const HOMEWORK_PREFIX = 'hw:'
const homeworkId = (key) => key.startsWith(HOMEWORK_PREFIX) ? key.slice(HOMEWORK_PREFIX.length) : null

// Tabs 2, 3, … are "<key>#<tab id>"; the key alone is tab 1.
export const TAB_SEPARATOR = '#'
export const splitTab = (key) => {
  const at = key.indexOf(TAB_SEPARATOR)
  return at < 0 ? { base: key, tabId: null } : { base: key.slice(0, at), tabId: key.slice(at + 1) }
}

// The extra tabs of a document, in the order they were made.
export const listTabs = (base) => prisma.docTab.findMany({ where: { key: base }, orderBy: { createdAt: 'asc' }, select: { id: true } })

export async function addTab(base) {
  return prisma.docTab.create({ data: { key: base, runs: [] }, select: { id: true } })
}

export async function deleteTab(base, tabId) {
  const { count } = await prisma.docTab.deleteMany({ where: { id: tabId, key: base } })
  dropDocument(base + TAB_SEPARATOR + tabId)
  return count > 0
}

// Every tab of a deleted document goes with it.
export async function deleteTabsOf(base) {
  for (const { id } of await listTabs(base)) dropDocument(base + TAB_SEPARATOR + id)
  await prisma.docTab.deleteMany({ where: { key: base } })
}

export async function loadDocument(classroomId) {
  if (docs.has(classroomId)) return docs.get(classroomId)
  const { base, tabId } = splitTab(classroomId)
  if (tabId) {
    const record = await prisma.docTab.findFirst({ where: { id: tabId, key: base } })
    if (!record) throw new Error('Tab not found')
    const runs = Array.isArray(record.runs) ? record.runs : []
    docs.set(classroomId, runs)
    return runs
  }
  const hwId = homeworkId(classroomId)
  if (hwId) {
    const record = await prisma.homeworkDoc.findUnique({ where: { id: hwId } })
    if (!record) throw new Error('Homework document not found')
    const runs = Array.isArray(record.runs) ? record.runs : []
    docs.set(classroomId, runs)
    return runs
  }
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

const saver = debouncedSaver('document', async (classroomId) => {
  const runs = docs.get(classroomId)
  if (!runs) return
  const { tabId } = splitTab(classroomId)
  if (tabId) { await prisma.docTab.updateMany({ where: { id: tabId }, data: { runs } }); return }
  const hwId = homeworkId(classroomId)
  if (hwId) await prisma.homeworkDoc.update({ where: { id: hwId }, data: { runs } })
  else await prisma.document.update({ where: { classroomId }, data: { runs } })
}, SAVE_DELAY_MS)

const scheduleSave = (classroomId) => saver.schedule(classroomId)

// Writes every document still waiting for its save (server shutdown).
export const flushDocuments = () => saver.flush()
export const failingDocumentSaves = () => saver.failing()

export function replaceDocument(classroomId, runs) {
  docs.set(classroomId, runs)
  scheduleSave(classroomId)
}

// Forgets a deleted homework document without saving it back.
export function dropDocument(key) {
  saver.cancel(key)
  docs.delete(key)
}

// Saves what is pending for these cabinets and forgets the cached copies, so
// the next open reads the database (a document moved to another cabinet).
export async function settleDocuments(...classroomIds) {
  for (const id of classroomIds) {
    await saver.settle(id)
    docs.delete(id)
  }
}
