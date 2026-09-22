import { Router } from 'express';
import { requireAuth, requireRole } from '../auth.js';
import { prisma } from '../db.js';

const router = Router();

// GET /api/courses/:courseId/full — get entire course with all lessons and blocks
router.get('/:courseId/full', requireAuth, async (req, res) => {
  try {
    const { courseId } = req.params;
    const { schoolId } = req.user;

    const course = await prisma.course.findUniqueOrThrow({
      where: { id: courseId },
      include: {
        skillset: {
          where: { schoolId },
        },
        lessons: {
          orderBy: { position: 'asc' },
          include: {
            blocks: {
              orderBy: { position: 'asc' },
            },
            exercises: {
              orderBy: { position: 'asc' },
            },
          },
        },
      },
    });

    // Verify school access
    if (!course.skillset) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(course);
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Course not found' });
    }
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/courses/:courseId/lessons/:position — get one lesson
router.get('/:courseId/lessons/:position', requireAuth, async (req, res) => {
  try {
    const { courseId, position } = req.params;
    const { schoolId } = req.user;
    const pos = parseInt(position, 10);

    const lesson = await prisma.courseLesson.findUniqueOrThrow({
      where: {
        courseId_position: {
          courseId,
          position: pos,
        },
      },
      include: {
        course: {
          include: {
            skillset: {
              where: { schoolId },
            },
          },
        },
        blocks: {
          orderBy: { position: 'asc' },
        },
        exercises: {
          orderBy: { position: 'asc' },
        },
      },
    });

    // Verify school access
    if (!lesson.course.skillset) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(lesson);
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Lesson not found' });
    }
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/skillsets — list skillsets in this school
router.get('/', requireAuth, async (req, res) => {
  try {
    const { schoolId } = req.user;

    const skillsets = await prisma.skillset.findMany({
      where: { schoolId },
      include: {
        courses: {
          select: {
            id: true,
            title: true,
            description: true,
            createdAt: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    res.json(skillsets);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/courses/import — import a course from JSON (OWNER only)
// Expected body:
// {
//   "skillsetName": "IELTS",
//   "course": {
//     "title": "IELTS 2024",
//     "description": "...",
//     "lessons": [
//       {
//         "position": 1,
//         "title": "...",
//         "type": "theory",
//         "blocks": [
//           { "position": 0, "type": "text", "payload": { "content": "..." } },
//           { "position": 1, "type": "image", "payload": { "url": "..." } }
//         ],
//         "exercises": [
//           {
//             "position": 0,
//             "type": "MULTIPLE_CHOICE",
//             "question": "...",
//             "payload": { "options": [...], "correctAnswer": "A" }
//           }
//         ]
//       }
//     ]
//   }
// }
router.post('/import', requireAuth, requireRole('OWNER'), async (req, res) => {
  try {
    const { schoolId } = req.user;
    const { skillsetName, course: courseData } = req.body;

    if (!skillsetName || !courseData || !courseData.title) {
      return res.status(400).json({ error: 'Missing skillsetName or course data' });
    }

    // Create or find skillset
    const skillset = await prisma.skillset.upsert({
      where: { schoolId_name: { schoolId, name: skillsetName } },
      update: {},
      create: {
        schoolId,
        name: skillsetName,
      },
    });

    // Create course
    const course = await prisma.course.create({
      data: {
        skillsetId: skillset.id,
        title: courseData.title,
        description: courseData.description,
      },
    });

    // Create lessons with blocks and exercises
    if (courseData.lessons && Array.isArray(courseData.lessons)) {
      for (const lessonData of courseData.lessons) {
        const lesson = await prisma.courseLesson.create({
          data: {
            courseId: course.id,
            position: lessonData.position,
            title: lessonData.title,
            type: lessonData.type || 'theory',
          },
        });

        // Create blocks
        if (lessonData.blocks && Array.isArray(lessonData.blocks)) {
          await prisma.courseLessonBlock.createMany({
            data: lessonData.blocks.map((block) => ({
              lessonId: lesson.id,
              position: block.position,
              type: block.type,
              payload: block.payload || {},
            })),
          });
        }

        // Create exercises
        if (lessonData.exercises && Array.isArray(lessonData.exercises)) {
          await prisma.courseExercise.createMany({
            data: lessonData.exercises.map((exercise) => ({
              lessonId: lesson.id,
              position: exercise.position,
              type: exercise.type,
              question: exercise.question,
              payload: exercise.payload || {},
            })),
          });
        }
      }
    }

    res.json({
      message: 'Course imported successfully',
      course: {
        id: course.id,
        title: course.title,
        skillset: skillsetName,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to import course' });
  }
});

export default router;
