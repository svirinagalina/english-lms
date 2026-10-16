import { Router } from 'express'
import { prisma } from '../db.js'
import { requireAuth, requireRole } from '../auth.js'
import { canOpenCourse, courseSalesRouter } from '../coursePurchases.js'
import { assistantEnabled, judgeWriting } from '../assistant.js'

// Courses: self-paced learning modules (IELTS, FCE, etc), organized by
// skillset. Content is text/image/video/file blocks plus exercises, imported
// in bulk from an external source (see scripts/import-course.js).
export const coursesRouter = Router()
coursesRouter.use(requireAuth)
// Price, purchases and access (admins): /api/courses/:courseId/sales.
coursesRouter.use('/:courseId/sales', courseSalesRouter)
// Not part of the free tier, except a course bought on its own (canOpenCourse).
const LOCKED = { error: 'This course opens after purchase', locked: true, feature: 'course' }

// POST /api/courses/blocks/:id/check { answer } — AI check of a writing
// block. The task and the key are read from the block, never from the client.
const writingVerdicts = new Map()
coursesRouter.post('/blocks/:id/check', async (req, res) => {
  const answer = String(req.body?.answer ?? '').trim().slice(0, 4000)
  if (!answer) return res.status(400).json({ error: 'Write your answer first' })
  if (!assistantEnabled()) return res.status(503).json({ error: 'AI checking is not set up on this platform' })
  const block = await prisma.courseLessonBlock.findUnique({
    where: { id: req.params.id },
    include: { lesson: { include: { course: { include: { skillset: true } } } } },
  })
  if (!block || block.type !== 'writing' || block.lesson.course.skillset.schoolId !== req.user.schoolId) {
    return res.status(404).json({ error: 'Exercise not found' })
  }
  if (!(await canOpenCourse(req.user, block.lesson.courseId))) return res.status(403).json(LOCKED)
  const key = `${block.id}\u0000${answer.replace(/\s+/g, ' ')}`
  let verdict = writingVerdicts.get(key)
  if (!verdict) {
    const { task, source, key: courseAnswer } = block.payload
    verdict = await Promise.race([
      judgeWriting({ lesson: block.lesson.title, task, source, key: courseAnswer, answer }).catch(() => null),
      new Promise((resolve) => setTimeout(() => resolve(null), 30000)),
    ])
    if (!verdict) return res.status(502).json({ error: 'The check did not answer — try again in a minute' })
    if (writingVerdicts.size > 5000) writingVerdicts.clear()
    writingVerdicts.set(key, verdict)
  }
  res.json(verdict)
})

// GET /api/courses — list skillsets with their courses, for this school
coursesRouter.get('/', async (req, res) => {
  const { schoolId } = req.user

  const skillsets = await prisma.skillset.findMany({
    where: { schoolId },
    include: {
      courses: {
        select: { id: true, title: true, description: true, priceRub: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  })

  // A free account sees only courses it bought or can buy, each with `locked`.
  if (req.user.role === 'STUDENT' && req.user.free) {
    for (const skillset of skillsets) {
      const open = await Promise.all(skillset.courses.map((c) => canOpenCourse(req.user, c.id)))
      skillset.courses = skillset.courses.map((c, i) => ({ ...c, locked: !open[i] })).filter((c) => !c.locked || c.priceRub)
    }
    return res.json(skillsets.filter((s) => s.courses.length))
  }
  res.json(skillsets)
})

// GET /api/courses/:courseId/full — the whole course: every lesson with its
// content blocks and exercises, for showing/browsing outside a call.
coursesRouter.get('/:courseId/full', async (req, res) => {
  const { courseId } = req.params
  const { schoolId } = req.user

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      skillset: true,
      lessons: {
        orderBy: { position: 'asc' },
        include: {
          blocks: { orderBy: { position: 'asc' } },
          exercises: { orderBy: { position: 'asc' } },
        },
      },
    },
  })

  if (!course) return res.status(404).json({ error: 'Course not found' })
  if (course.skillset.schoolId !== schoolId) {
    return res.status(403).json({ error: 'Not allowed' })
  }
  // Not bought: the outline only, so the page can say what opens after purchase.
  if (!(await canOpenCourse(req.user, course.id))) {
    if (!course.priceRub) return res.status(403).json(LOCKED)
    return res.json({ ...course, locked: true, lessons: course.lessons.map(({ blocks, exercises, ...l }) => ({ ...l, blocks: [], exercises: [] })) })
  }
  const access = req.user.free ? await prisma.courseAccess.findUnique({ where: { courseId_userId: { courseId: course.id, userId: req.user.id } }, select: { until: true } }) : null
  res.json({ ...course, accessUntil: access?.until ?? null })
})

// GET /api/courses/:courseId/lessons/:position — one lesson by its position
// in the course, e.g. for opening lesson 12 on a call.
coursesRouter.get('/:courseId/lessons/:position', async (req, res) => {
  const { courseId, position } = req.params
  const { schoolId } = req.user
  const pos = Number.parseInt(position, 10)

  const lesson = await prisma.courseLesson.findUnique({
    where: { courseId_position: { courseId, position: pos } },
    include: {
      course: { include: { skillset: true } },
      blocks: { orderBy: { position: 'asc' } },
      exercises: { orderBy: { position: 'asc' } },
    },
  })

  if (!lesson) return res.status(404).json({ error: 'Lesson not found' })
  if (lesson.course.skillset.schoolId !== schoolId) {
    return res.status(403).json({ error: 'Not allowed' })
  }
  if (!(await canOpenCourse(req.user, courseId))) return res.status(403).json(LOCKED)

  res.json(lesson)
})

// POST /api/courses/import — bulk-create a course from JSON (OWNER/PARTNER).
// Body shape: { skillsetName, course: { title, description, lessons: [
//   { position, title, type, blocks: [{position,type,payload}], exercises: [{position,type,question,payload}] }
// ]}} — see scripts/example-course-import.json for a worked example.
coursesRouter.post('/import', requireRole('OWNER'), async (req, res) => {
  const { schoolId } = req.user
  const { skillsetName, course: courseData } = req.body ?? {}

  if (!skillsetName || !courseData?.title) {
    return res.status(400).json({ error: 'Missing skillsetName or course.title' })
  }

  const skillset = await prisma.skillset.upsert({
    where: { schoolId_name: { schoolId, name: skillsetName } },
    update: {},
    create: { schoolId, name: skillsetName },
  })

  const course = await prisma.course.create({
    data: {
      skillsetId: skillset.id,
      title: courseData.title,
      description: courseData.description,
    },
  })

  let blockCount = 0
  let exerciseCount = 0

  for (const lessonData of courseData.lessons ?? []) {
    const lesson = await prisma.courseLesson.create({
      data: {
        courseId: course.id,
        position: lessonData.position,
        title: lessonData.title,
        type: lessonData.type ?? 'theory',
      },
    })

    if (lessonData.blocks?.length) {
      await prisma.courseLessonBlock.createMany({
        data: lessonData.blocks.map((block) => ({
          lessonId: lesson.id,
          position: block.position,
          type: block.type,
          payload: block.payload ?? {},
        })),
      })
      blockCount += lessonData.blocks.length
    }

    if (lessonData.exercises?.length) {
      await prisma.courseExercise.createMany({
        data: lessonData.exercises.map((exercise) => ({
          lessonId: lesson.id,
          position: exercise.position,
          type: exercise.type,
          question: exercise.question,
          payload: exercise.payload ?? {},
        })),
      })
      exerciseCount += lessonData.exercises.length
    }
  }

  res.json({
    course: { id: course.id, title: course.title, skillset: skillset.name },
    lessons: courseData.lessons?.length ?? 0,
    blocks: blockCount,
    exercises: exerciseCount,
  })
})
