#!/usr/bin/env node

/**
 * Puts the "Speaking Toolkit" lessons (data/ielts-speaking-toolkit.js —
 * useful phrases and topic vocabulary, all our own) into the school's IELTS
 * course right after its Speaking lessons, so they sit in the Speaking part
 * rather than at the end. Lessons after them move down. Re-running updates
 * the Toolkit lessons in place (matched by title, position kept), so content
 * fixes are just an edit + another run. Other lessons are never changed.
 *
 * Usage: node scripts/add-ielts-speaking-toolkit.js <schoolId>
 */

import { prisma } from '../src/db.js'
import { SPEAKING_TOOLKIT } from '../data/ielts-speaking-toolkit.js'

async function run() {
  const [, , schoolId] = process.argv
  if (!schoolId) {
    console.error('Usage: node scripts/add-ielts-speaking-toolkit.js <schoolId>')
    process.exit(1)
  }

  const skillset = await prisma.skillset.findFirst({ where: { schoolId, name: 'IELTS' } })
  if (!skillset) throw new Error('No IELTS skillset found for this school')
  const course = await prisma.course.findFirst({ where: { skillsetId: skillset.id } })
  if (!course) throw new Error('No course found in the IELTS skillset')

  let added = 0
  let updated = 0
  for (const lesson of SPEAKING_TOOLKIT) {
    await prisma.$transaction(async (tx) => {
      let row = await tx.courseLesson.findFirst({ where: { courseId: course.id, title: lesson.title } })
      if (row) {
        await tx.courseLessonBlock.deleteMany({ where: { lessonId: row.id } })
        await tx.courseExercise.deleteMany({ where: { lessonId: row.id } })
        updated++
      } else {
        // After the last Speaking lesson (a Toolkit one already there counts),
        // never after the Practice Lab at the end.
        const speaking = await tx.courseLesson.findMany({
          where: { courseId: course.id, title: { startsWith: 'Speaking' } },
          select: { position: true },
          orderBy: { position: 'desc' },
          take: 1,
        })
        const last = await tx.courseLesson.aggregate({ where: { courseId: course.id }, _max: { position: true } })
        const after = speaking[0]?.position ?? last._max.position ?? 0
        // (courseId, position) is unique: move the later lessons out of the
        // way and back, one step down.
        await tx.courseLesson.updateMany({ where: { courseId: course.id, position: { gt: after } }, data: { position: { increment: 100000 } } })
        await tx.courseLesson.updateMany({ where: { courseId: course.id, position: { gt: 100000 } }, data: { position: { decrement: 99999 } } })
        row = await tx.courseLesson.create({
          data: { courseId: course.id, position: after + 1, title: lesson.title, type: 'practice' },
        })
        added++
      }
      if (lesson.blocks?.length) {
        await tx.courseLessonBlock.createMany({
          data: lesson.blocks.map((b, i) => ({ lessonId: row.id, position: i, type: b.type, payload: b.payload })),
        })
      }
    })
  }
  console.log(`IELTS Speaking Toolkit: ${added} lesson(s) added, ${updated} updated in "${course.title}"`)
}

run()
  .catch((err) => { console.error(err); process.exit(1) })
  .finally(() => prisma.$disconnect())
