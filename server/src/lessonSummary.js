import { z } from 'zod'
import { prisma } from './db.js'
import { assistantEnabled } from './assistant.js'
import { structured } from './llm.js'
import { lookupEntry } from './routes/dictionary.js'
import { topicLabel } from './errorAnalysis.js'
import { loadBoard } from './boardStore.js'

// A lesson summary is built from what appeared during the session: text
// added to the student's boards (elements carry `at`), words the student
// saved, mistakes noted. With the AI assistant configured it also gets
// grammar topics from the text and speaking questions for the next lesson.

const STOP = new Set(('a an the and or but so if then than that this these those there here is are am was were be been being ' +
  'do does did have has had will would shall should can could may might must ought to of in on at by for from with without ' +
  'about into onto over under up down out off as not no yes i you he she it we they me him her us them my your his its our ' +
  'their mine yours ours theirs who whom whose what which when where why how all any some many much more most few less ' +
  'very too also just only even still yet again ever never always often sometimes usually now today tomorrow yesterday ' +
  'lesson homework note notes example examples exercise page unit chapter').split(/\s+/))

const clean = (text) => String(text ?? '').replace(/\{\{#[0-9a-f]{6}:([^}]*)\}\}/gi, '$1').replace(/\*\*|__|~~/g, '')

const isLessonHeading = (t) => /^—\s*(Lesson|Homework|Speaking|Placement)/i.test(t.trim())

function wordsFrom(texts) {
  const seen = new Map()
  for (const text of texts) {
    for (const raw of text.split(/[^A-Za-z'’-]+/)) {
      const w = raw.replace(/^['’-]+|['’-]+$/g, '').toLowerCase()
      if (w.length < 3 || w.length > 30 || STOP.has(w) || !/^[a-z][a-z'’-]*$/.test(w)) continue
      seen.set(w, (seen.get(w) ?? 0) + 1)
    }
  }
  return [...seen.keys()]
}

async function withEntries(words, saved) {
  const out = []
  for (const word of words.slice(0, 30)) {
    let entry = null
    try { entry = await lookupEntry(word) } catch { /* no entry: keep the bare word */ }
    out.push({ word, transcription: entry?.transcription ?? null, translation: entry?.senses?.[0]?.translations?.slice(0, 2).join(', ') ?? entry?.translation?.slice(0, 60) ?? null, saved: saved.has(word) })
  }
  return out
}

const AiSchema = z.object({
  topics: z.array(z.string()).max(6),
  keyWords: z.array(z.string()).max(20),
  questions: z.array(z.string()).max(10)
})

async function askAi({ texts, words, mistakes }) {
  const material = [
    'BOARD TEXT FROM THE LESSON:', ...texts.slice(0, 80),
    '', 'NEW WORDS:', words.join(', '),
    '', 'MISTAKES NOTED (said → correct):', ...mistakes.map((m) => `${m.said} → ${m.correct}`)
  ].join('\n')
  return structured({
    name: 'lesson_summary',
    schema: AiSchema,
    maxTokens: 3000,
    system:
      'You help a teacher of English who works one-to-one with Russian-speaking learners. From the material of one lesson ' +
      '(text written on the whiteboard, new words, mistakes), produce: (1) topics — the grammar or language topics the lesson ' +
      'was about, 2–5 short English labels such as "Present Perfect vs Past Simple", "Articles with places", "Phrasal verbs: get"; ' +
      '(2) keyWords — up to 15 of the new words or phrases worth remembering, exactly as they appear, skipping trivial ones; ' +
      '(3) questions — 8 speaking questions for the next lesson that make the student use these words and the topics in ' +
      'conversation. Questions must be natural, answerable in a few sentences, not personal (nothing about family, health, ' +
      'money, relationships, beliefs or private life) — everyday situations, opinions on neutral things, hypotheticals. ' +
      'Match the level suggested by the material. Plain text, no numbering.',
    user: material
  })
}

// Builds (or rebuilds) the summary of one session. Safe to call again.
export async function buildSummary(sessionId) {
  const session = await prisma.session.findUnique({ where: { id: sessionId }, include: { classroom: { select: { id: true, studentId: true } } } })
  if (!session?.classroom?.studentId) return null
  const from = session.startedAt.getTime()
  const to = (session.endedAt ?? new Date()).getTime() + 60_000

  // Text that appeared on the student's boards during the lesson.
  const boards = await prisma.board.findMany({
    where: { OR: [{ classroomId: session.classroom.id }, { sharedWith: { some: { id: session.classroom.id } } }] },
    select: { id: true }
  })
  const texts = []
  const earlier = [] // text that was on the boards before this lesson: its words are not new
  for (const board of boards) {
    const elements = await loadBoard(board.id)
    for (const e of elements) {
      if ((e.type !== 'text' && e.type !== 'note') || !e.text || e.mistakeId) continue
      const plain = clean(e.text).trim()
      if (!plain || isLessonHeading(plain)) continue
      if (typeof e.at === 'number' && e.at >= from && e.at <= to) texts.push(plain)
      else if (typeof e.at !== 'number' || e.at < from) earlier.push(plain)
    }
  }
  const known = new Set(wordsFrom(earlier))

  const [saved, mistakes] = await Promise.all([
    prisma.vocabCard.findMany({ where: { set: { ownerId: session.classroom.studentId }, createdAt: { gte: new Date(from), lte: new Date(to) } }, select: { term: true } }),
    prisma.lessonMistake.findMany({ where: { classroomId: session.classroom.id, createdAt: { gte: new Date(from), lte: new Date(to) } } })
  ])
  const savedSet = new Set(saved.map((c) => c.term.toLowerCase()))
  let words = [...new Set([...saved.map((c) => c.term.toLowerCase()), ...wordsFrom(texts).filter((w) => !known.has(w))])]

  let topics = [...new Set(mistakes.flatMap((m) => m.topics.map(topicLabel)))]
  let questions = []
  let withAi = false
  if (assistantEnabled() && (texts.length || words.length || mistakes.length)) {
    try {
      const ai = await askAi({ texts, words, mistakes })
      if (ai) {
        withAi = true
        topics = [...new Set([...ai.topics, ...topics])].slice(0, 6)
        const key = ai.keyWords.map((w) => w.toLowerCase().trim()).filter(Boolean)
        // The AI's pick first, then the rest, saved words always kept.
        words = [...new Set([...key, ...words.filter((w) => savedSet.has(w)), ...words])].slice(0, 25)
        questions = ai.questions
      }
    } catch (error) {
      console.error('Lesson summary AI step failed:', error.message)
    }
  }

  const wordEntries = await withEntries(words, savedSet)
  const data = { classroomId: session.classroom.id, studentId: session.classroom.studentId, topics, words: wordEntries, mistakeIds: mistakes.map((m) => m.id), questions, withAi }
  return prisma.lessonSummary.upsert({ where: { sessionId }, create: { sessionId, ...data }, update: data })
}
