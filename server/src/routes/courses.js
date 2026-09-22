import { Router } from 'express'
import { prisma } from '../db.js'
import { requireAuth, requireRole } from '../auth.js'

// Courses: self-paced learning modules (IELTS, FCE, etc), organized by
// skillset. Content is text/image/video/file blocks plus exercises, imported
// in bulk from an external source (see scripts/import-course.js).
export const coursesRouter = Router()
coursesRouter.use(requireAuth)

// GET /api/courses — list skillsets with their courses, for this school
coursesRouter.get('/', async (req, res) => {
  const { schoolId } = req.user

  const skillsets = await prisma.skillset.findMany({
    where: { schoolId },
    include: {
      courses: {
        select: { id: true, title: true, description: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  })

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

  res.json(course)
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
