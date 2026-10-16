#!/usr/bin/env node

/**
 * Appends the "Practice Lab" lessons (data/ielts-practice-lab.js — original
 * reading, listening, writing, vocabulary and speaking practice) to the end
 * of the school's IELTS course. Existing lessons are never touched. Re-running
 * updates the Practice Lab lessons in place (matched by title, position kept),
 * so content fixes are just an edit + another run.
 *
 * Usage: node scripts/add-ielts-practice-lab.js <schoolId>
 */

import { prisma } from '../src/db.js'
import { PRACTICE_LAB } from '../data/ielts-practice-lab.js'

async function run() {
  const [, , schoolId] = process.argv
  if (!schoolId) {
    console.error('Usage: node scripts/add-ielts-practice-lab.js <schoolId>')
    process.exit(1)
  }

  const skillset = await prisma.skillset.findFirst({ where: { schoolId, name: 'IELTS' } })
  if (!skillset) throw new Error('No IELTS skillset found for this school')
  const course = await prisma.course.findFirst({ where: { skillsetId: skillset.id } })
  if (!course) throw new Error('No course found in the IELTS skillset')

  let added = 0
  let updated = 0
  for (const lesson of PRACTICE_LAB) {
    await prisma.$transaction(async (tx) => {
      let row = await tx.courseLesson.findFirst({ where: { courseId: course.id, title: lesson.title } })
      if (row) {
        await tx.courseLessonBlock.deleteMany({ where: { lessonId: row.id } })
        await tx.courseExercise.deleteMany({ where: { lessonId: row.id } })
        updated++
      } else {
        const last = await tx.courseLesson.aggregate({ where: { courseId: course.id }, _max: { position: true } })
        row = await tx.courseLesson.create({
          data: { courseId: course.id, position: (last._max.position ?? 0) + 1, title: lesson.title, type: 'practice' },
        })
        added++
      }
      if (lesson.blocks?.length) {
        await tx.courseLessonBlock.createMany({
          data: lesson.blocks.map((b, i) => ({ lessonId: row.id, position: i, type: b.type, payload: b.payload })),
        })
      }
      if (lesson.exercises?.length) {
        await tx.courseExercise.createMany({
          data: lesson.exercises.map((e, i) => ({ lessonId: row.id, position: i, type: e.type, question: e.question, payload: e.payload })),
        })
      }
    })
  }
  console.log(`IELTS Practice Lab: ${added} lesson(s) added, ${updated} updated in "${course.title}"`)
}

run()
  .catch((err) => { console.error(err); process.exit(1) })
  .finally(() => prisma.$disconnect())
