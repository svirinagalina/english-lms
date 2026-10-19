#!/usr/bin/env node

/**
 * Creates (or updates) the "TOEFL iBT 2026" course from data/toefl in the
 * school's TOEFL skillset. Lessons are matched by title and blocks by
 * position, and updated in place — block ids stay the same, so students'
 * results and works keep pointing at the right task. Generated audio that
 * already exists under uploads/toefl-tts is attached to the tasks.
 *
 * Usage: node scripts/add-toefl-course.js <schoolId>
 */

import path from 'path'
import { fileURLToPath } from 'url'
import { prisma } from '../src/db.js'
import { COURSE, LESSONS } from '../data/toefl/index.js'
import { attachAudio } from '../data/toefl/audio.js'

const UPLOAD_ROOT = process.env.UPLOAD_DIR ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../uploads')

async function run() {
  const [, , schoolId] = process.argv
  if (!schoolId) {
    console.error('Usage: node scripts/add-toefl-course.js <schoolId>')
    process.exit(1)
  }
  const school = await prisma.school.findUnique({ where: { id: schoolId } })
  if (!school) throw new Error(`No school ${schoolId}`)

  const skillset = await prisma.skillset.upsert({
    where: { schoolId_name: { schoolId, name: COURSE.skillset } },
    update: {},
    create: { schoolId, name: COURSE.skillset },
  })
  let course = await prisma.course.findFirst({ where: { skillsetId: skillset.id, title: COURSE.title } })
  if (!course) course = await prisma.course.create({ data: { skillsetId: skillset.id, title: COURSE.title, description: COURSE.description } })
  else await prisma.course.update({ where: { id: course.id }, data: { description: COURSE.description } })

  let missing = 0
  for (const [i, lesson] of LESSONS.entries()) {
    const position = i + 1
    const blocks = lesson.blocks.map((b) => {
      const payload = structuredClone(b.payload)
      if (b.type.startsWith('toefl')) missing += attachAudio(payload, UPLOAD_ROOT)
      return { type: b.type, payload }
    })
    await prisma.$transaction(async (tx) => {
      let row = await tx.courseLesson.findFirst({ where: { courseId: course.id, title: lesson.title } })
      if (row && row.position !== position) {
        // Make room: move whatever sits at this position out of the way.
        await tx.courseLesson.updateMany({ where: { courseId: course.id, position }, data: { position: 10000 + position } })
        row = await tx.courseLesson.update({ where: { id: row.id }, data: { position } })
      }
      if (!row) {
        await tx.courseLesson.updateMany({ where: { courseId: course.id, position }, data: { position: 10000 + position } })
        row = await tx.courseLesson.create({ data: { courseId: course.id, position, title: lesson.title, type: lesson.type } })
      } else {
        await tx.courseLesson.update({ where: { id: row.id }, data: { type: lesson.type } })
      }
      const existing = await tx.courseLessonBlock.findMany({ where: { lessonId: row.id }, orderBy: { position: 'asc' } })
      for (const [bi, b] of blocks.entries()) {
        const old = existing[bi]
        if (old) await tx.courseLessonBlock.update({ where: { id: old.id }, data: { position: bi, type: b.type, payload: b.payload } })
        else await tx.courseLessonBlock.create({ data: { lessonId: row.id, position: bi, type: b.type, payload: b.payload } })
      }
      if (existing.length > blocks.length) {
        await tx.courseLessonBlock.deleteMany({ where: { id: { in: existing.slice(blocks.length).map((b) => b.id) } } })
      }
    })
  }
  // Lessons that used to be in the course but are not in the data any more.
  const titles = LESSONS.map((l) => l.title)
  const stale = await prisma.courseLesson.findMany({ where: { courseId: course.id, title: { notIn: titles } } })
  for (const l of stale) await prisma.courseLesson.delete({ where: { id: l.id } })

  console.log(`TOEFL course "${COURSE.title}" (${course.id}): ${LESSONS.length} lessons${stale.length ? `, ${stale.length} old removed` : ''}; audio lines without a file: ${missing}`)
}

run()
  .catch((err) => { console.error(err); process.exit(1) })
  .finally(() => prisma.$disconnect())
