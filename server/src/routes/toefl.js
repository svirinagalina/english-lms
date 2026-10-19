import { Router } from 'express'
import express from 'express'
import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { z } from 'zod'
import { prisma } from '../db.js'
import { requireAuth, isAdmin } from '../auth.js'
import { canOpenCourse } from '../coursePurchases.js'
import { studentScope } from '../partnerScope.js'
import { assistantEnabled } from '../assistant.js'
import { scoreToefl, scoreRepeat, rawToBand, transcribe, canTranscribe } from '../toeflScoring.js'

// The TOEFL course's own endpoints: results of practice sets and simulation
// tests, written/spoken answers scored by the AI, and the teacher's review.
// The task text always comes from the course block, never from the client.
export const toeflRouter = Router()
toeflRouter.use(requireAuth)

const UPLOAD_ROOT = process.env.UPLOAD_DIR ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads')
const AUDIO_DIR = path.join(UPLOAD_ROOT, 'toefl')
const LOCKED = { error: 'This course opens after purchase', locked: true, feature: 'course' }

async function openBlock(req, blockId) {
  const block = await prisma.courseLessonBlock.findUnique({
    where: { id: blockId },
    include: { lesson: { include: { course: { include: { skillset: true } } } } },
  })
  if (!block || !block.type.startsWith('toefl') || block.lesson.course.skillset.schoolId !== req.user.schoolId) return { status: 404 }
  if (!(await canOpenCourse(req.user, block.lesson.courseId))) return { status: 403 }
  return { block }
}

// The prompt of one productive item, as the rater and the reviewer see it.
// A simulation test keeps its tasks under payload.sections.<name>.tasks.
function findTask(payload, task, path) {
  if (!path) return payload
  let node = payload
  for (const key of String(path).split('.')) node = node?.[/^\d+$/.test(key) ? Number(key) : key]
  return node?.task === task ? node : null
}

function promptFor(task, p, item) {
  if (task === 'email') {
    return `Write an Email.\nSituation: ${p.scenario}\nIn your email: ${(p.points ?? []).map((x) => `\n- ${x}`).join('')}\nTo: ${p.to ?? ''}\nSubject: ${p.subject ?? ''}`
  }
  if (task === 'discussion') {
    return `Academic Discussion.\nProfessor ${p.professor?.name ?? ''}: ${p.professor?.text ?? ''}\n${(p.students ?? []).map((s) => `${s.name}: ${s.text}`).join('\n')}`
  }
  if (task === 'interview') return `Interview. Context: ${p.scenario}\nQuestion ${item + 1}: ${p.questions?.[item] ?? ''}`
  if (task === 'listen-repeat') return `Listen and repeat: ${p.sentences?.[item] ?? ''}`
  return ''
}

// POST /api/toefl/results { blockId, task, title, correct, total, band?, detail?, kind }
const resultSchema = z.object({
  blockId: z.string().min(1),
  kind: z.enum(['set', 'test']),
  task: z.string().max(40),
  title: z.string().max(200),
  correct: z.number().int().min(0).max(1000),
  total: z.number().int().min(0).max(1000),
  band: z.number().min(1).max(6).nullable().optional(),
  detail: z.any().optional(),
})
toeflRouter.post('/results', async (req, res) => {
  const parsed = resultSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Bad result' })
  const { status } = await openBlock(req, parsed.data.blockId)
  if (status) return res.status(status).json(status === 403 ? LOCKED : { error: 'Not found' })
  const row = await prisma.toeflResult.create({ data: { ...parsed.data, band: parsed.data.band ?? null, userId: req.user.id } })
  res.json(row)
})

// POST /api/toefl/write { blockId, task, path?, text } — an email or a
// discussion post: saved, scored by the AI when it is set up.
toeflRouter.post('/write', async (req, res) => {
  const { blockId, task, path: taskPath } = req.body ?? {}
  const text = String(req.body?.text ?? '').trim().slice(0, 6000)
  if (!text) return res.status(400).json({ error: 'Write your answer first' })
  if (!['email', 'discussion'].includes(task)) return res.status(400).json({ error: 'Bad task' })
  const { block, status } = await openBlock(req, String(blockId ?? ''))
  if (status) return res.status(status).json(status === 403 ? LOCKED : { error: 'Not found' })
  const p = findTask(block.payload, task, taskPath)
  if (!p) return res.status(404).json({ error: 'Task not found' })
  const prompt = promptFor(task, p, 0)
  let ai = null
  if (assistantEnabled()) {
    ai = await Promise.race([
      scoreToefl({ task, prompt, answer: text }).catch((err) => { console.error('toefl score', err.message); return null }),
      new Promise((resolve) => setTimeout(() => resolve(null), 60000)),
    ])
  }
  const work = await prisma.toeflWork.create({
    data: { userId: req.user.id, blockId: block.id, task, item: 0, prompt, text, aiScore: ai?.score ?? null, aiFeedback: ai ?? undefined },
  })
  res.json({ id: work.id, ai, aiOff: !assistantEnabled() })
})

// POST /api/toefl/speak?blockId=&task=&item=&path= — raw audio body
// (audio/webm|mp4|ogg), header X-Transcript = the browser's own transcript
// (URI-encoded). Listen & Repeat is scored by word match, the interview by AI.
const rawAudio = express.raw({ type: () => true, limit: 8 * 1024 * 1024 })
toeflRouter.post('/speak', rawAudio, async (req, res) => {
  const { blockId, task, path: taskPath } = req.query
  const item = Number.parseInt(req.query.item, 10) || 0
  if (!['interview', 'listen-repeat'].includes(task)) return res.status(400).json({ error: 'Bad task' })
  const { block, status } = await openBlock(req, String(blockId ?? ''))
  if (status) return res.status(status).json(status === 403 ? LOCKED : { error: 'Not found' })
  const p = findTask(block.payload, task, taskPath)
  if (!p) return res.status(404).json({ error: 'Task not found' })

  let audioPath = null
  const mime = (req.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (Buffer.isBuffer(req.body) && req.body.length > 1000 && /^audio\/(webm|mp4|ogg|mpeg|wav|x-m4a|aac)$/.test(mime)) {
    await fs.mkdir(AUDIO_DIR, { recursive: true })
    const ext = mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac') ? 'm4a' : mime.includes('ogg') ? 'ogg' : mime.includes('wav') ? 'wav' : mime.includes('mpeg') ? 'mp3' : 'webm'
    const name = `${crypto.randomBytes(12).toString('hex')}.${ext}`
    await fs.writeFile(path.join(AUDIO_DIR, name), req.body)
    audioPath = `/uploads/toefl/${name}`
  }
  let said = ''
  try { said = decodeURIComponent(req.get('x-transcript') ?? '').slice(0, 3000) } catch { /* keep empty */ }
  // The browser's own recogniser is free; the server is asked only when it
  // heard nothing (Firefox has none) and an OpenAI key is set up.
  if (audioPath && !said && canTranscribe()) {
    const server = await transcribe(req.body, mime).catch(() => null)
    if (server) said = server
  }
  const prompt = promptFor(task, p, item)

  let ai = null
  if (task === 'listen-repeat') {
    // Nothing recognised is not a zero: the teacher listens and scores it.
    const { score, ratio } = scoreRepeat(p.sentences?.[item], said)
    ai = said
      ? { score, band: rawToBand(score), summary: `Совпало слов: ${Math.round(ratio * 100)}%`, strengths: [], improve: [], corrected: p.sentences?.[item] ?? '' }
      : { score: null, band: null, summary: 'Речь не распознана — учитель послушает запись.', strengths: [], improve: [], corrected: '' }
  } else if (said && assistantEnabled()) {
    ai = await Promise.race([
      scoreToefl({ task, prompt, answer: said }).catch((err) => { console.error('toefl score', err.message); return null }),
      new Promise((resolve) => setTimeout(() => resolve(null), 60000)),
    ])
  }
  const work = await prisma.toeflWork.create({
    data: { userId: req.user.id, blockId: block.id, task, item, prompt, text: said || null, audioPath, aiScore: ai?.score ?? null, aiFeedback: ai ?? undefined },
  })
  res.json({ id: work.id, transcript: said, ai, audioPath })
})

// Whose works this person may see: their own; a teacher — their students';
// an admin — the whole school.
async function visibleUserIds(user) {
  if (isAdmin(user)) {
    const rows = await prisma.user.findMany({ where: { schoolId: user.schoolId, role: 'STUDENT', ...(await studentScope(user)) }, select: { id: true } })
    return rows.map((r) => r.id)
  }
  if (user.role === 'TEACHER') {
    const rows = await prisma.teacherStudent.findMany({ where: { teacherId: user.id }, select: { studentId: true } })
    return rows.map((r) => r.studentId)
  }
  return [user.id]
}

// GET /api/toefl/overview?userId= — works and results, newest first.
toeflRouter.get('/overview', async (req, res) => {
  const allowed = await visibleUserIds(req.user)
  const staff = req.user.role !== 'STUDENT'
  const ids = req.query.userId ? (allowed.includes(String(req.query.userId)) ? [String(req.query.userId)] : []) : allowed
  const user = { select: { id: true, name: true } }
  const [works, results] = await Promise.all([
    prisma.toeflWork.findMany({ where: { userId: { in: ids } }, orderBy: { createdAt: 'desc' }, take: 200, include: { user } }),
    prisma.toeflResult.findMany({ where: { userId: { in: ids } }, orderBy: { createdAt: 'desc' }, take: 200, include: { user } }),
  ])
  res.json({ staff, works, results })
})

// PATCH /api/toefl/works/:id { teacherScore, teacherComment } — staff only.
toeflRouter.patch('/works/:id', async (req, res) => {
  if (req.user.role === 'STUDENT') return res.status(403).json({ error: 'Not allowed' })
  const work = await prisma.toeflWork.findUnique({ where: { id: req.params.id } })
  if (!work || !(await visibleUserIds(req.user)).includes(work.userId)) return res.status(404).json({ error: 'Not found' })
  const score = req.body?.teacherScore
  const data = {
    teacherScore: score === null || score === '' || score === undefined ? null : Math.max(0, Math.min(5, Number(score))),
    teacherComment: String(req.body?.teacherComment ?? '').slice(0, 4000) || null,
    reviewedById: req.user.id,
    reviewedAt: new Date(),
  }
  res.json(await prisma.toeflWork.update({ where: { id: work.id }, data }))
})
