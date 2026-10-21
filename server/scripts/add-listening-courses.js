#!/usr/bin/env node

/**
 * Creates (or updates) the school's Listening courses from data/listening/:
 * a "Listening" skillset with one course per level (Intermediate,
 * Upper-Intermediate, Advanced), each holding detective stories and
 * interesting-facts podcasts. A lesson = an "audiobook" block (paragraphs,
 * with the MP3 of each one that exists under uploads/listening-tts/ — see
 * generate-listening-audio.js) + comprehension questions.
 *
 * Re-running updates lessons in place (matched by title, position kept), adds
 * new ones at the end and never touches anything else, so student progress
 * stays. Courses are matched by title.
 *
 * Usage: node scripts/add-listening-courses.js <schoolId>
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { prisma } from '../src/db.js'
import { LISTENING_COURSES, AUDIO_SUBDIR, audioFile, audioUrl } from '../data/listening/index.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const UPLOAD_ROOT = process.env.UPLOAD_DIR ?? path.resolve(here, '../uploads')

async function run() {
  const [, , schoolId] = process.argv
  if (!schoolId) {
    console.error('Usage: node scripts/add-listening-courses.js <schoolId>')
    process.exit(1)
  }
  const skillset = await prisma.skillset.upsert({
    where: { schoolId_name: { schoolId, name: 'Listening' } },
    create: { schoolId, name: 'Listening' },
    update: {},
  })

  let voiced = 0
  let silent = 0
  for (const def of LISTENING_COURSES) {
    let course = await prisma.course.findFirst({ where: { skillsetId: skillset.id, title: def.title } })
    if (!course) course = await prisma.course.create({ data: { skillsetId: skillset.id, title: def.title, description: def.description } })
    else await prisma.course.update({ where: { id: course.id }, data: { description: def.description } })

    let added = 0
    let updated = 0
    for (const lesson of def.lessons) {
      const paragraphs = lesson.paragraphs.map((text) => {
        const file = audioFile(lesson.voice, def.rate, text)
        const exists = fs.existsSync(path.join(UPLOAD_ROOT, AUDIO_SUBDIR, file))
        if (exists) voiced++; else silent++
        return { text, url: exists ? audioUrl(file) : null }
      })
      const blocks = [
        { type: 'audiobook', payload: { title: lesson.label, paragraphs } },
        { type: 'choice', payload: { title: 'Check your understanding', questions: lesson.questions } },
      ]
      await prisma.$transaction(async (tx) => {
        let row = await tx.courseLesson.findFirst({ where: { courseId: course.id, title: lesson.title } })
        if (row) {
          await tx.courseLessonBlock.deleteMany({ where: { lessonId: row.id } })
          await tx.courseLesson.update({ where: { id: row.id }, data: { type: lesson.type } })
          updated++
        } else {
          const last = await tx.courseLesson.aggregate({ where: { courseId: course.id }, _max: { position: true } })
          row = await tx.courseLesson.create({ data: { courseId: course.id, position: (last._max.position ?? 0) + 1, title: lesson.title, type: lesson.type } })
          added++
        }
        await tx.courseLessonBlock.createMany({ data: blocks.map((b, i) => ({ lessonId: row.id, position: i, type: b.type, payload: b.payload })) })
      })
    }
    console.log(`${def.title}: ${added} added, ${updated} updated`)
  }
  console.log(`Paragraphs with audio: ${voiced}, without (browser voice): ${silent}`)
}

run()
  .catch((err) => { console.error(err); process.exit(1) })
  .finally(() => prisma.$disconnect())
