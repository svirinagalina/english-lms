#!/usr/bin/env node

/**
 * Adds Galina's two Writing handouts — «Graphs Descriptions Useful
 * Vocabulary» (Task 1) and «Linking words» (both tasks), her own PDFs with
 * Russian translations — to the school's IELTS course as one lesson right
 * after the last Writing lesson (before Speaking; later lessons move down).
 * The PDFs live in UPLOAD_DIR/course-files/ under random names (copied there
 * by hand; uploads are not in git). Re-running updates the lesson in place.
 *
 * Usage: node scripts/add-ielts-writing-vocabulary.js <schoolId> <graphs.pdf name> <linking.pdf name>
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { prisma } from '../src/db.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const UPLOAD_ROOT = process.env.UPLOAD_DIR ?? path.resolve(here, '../uploads')
const TITLE = 'Writing. Useful vocabulary: describing graphs and linking words'

async function run() {
  const [, , schoolId, graphs, linking] = process.argv
  if (!schoolId || !graphs || !linking) {
    console.error('Usage: node scripts/add-ielts-writing-vocabulary.js <schoolId> <graphs.pdf name> <linking.pdf name>')
    process.exit(1)
  }
  for (const name of [graphs, linking]) {
    if (!fs.existsSync(path.join(UPLOAD_ROOT, 'course-files', name))) throw new Error(`No ${name} in ${UPLOAD_ROOT}/course-files`)
  }
  const skillset = await prisma.skillset.findFirst({ where: { schoolId, name: 'IELTS' } })
  if (!skillset) throw new Error('No IELTS skillset found for this school')
  const course = await prisma.course.findFirst({ where: { skillsetId: skillset.id } })
  if (!course) throw new Error('No course found in the IELTS skillset')

  const blocks = [
    { type: 'html', payload: { title: 'How to use these handouts', html: `Две памятки по Writing с переводом на русский.

<b>Graphs Descriptions Useful Vocabulary</b> — Writing Task 1 (Academic): структура описания, образцы для bar chart, pie chart, line graph, table, process и map, фразы для вступления, общей картины (overview), трендов, сравнений и цифр.
<b>Linking words</b> — связки для обоих заданий: причины, примеры, согласие и несогласие, последовательность, сходство и различие, причина и следствие, вывод.

Совет: перед тем как писать, выберите из памятки 3–4 фразы, которые используете в этом тексте, и отметьте их после проверки — так они переходят в активный словарь.` } },
    { type: 'file', payload: { url: `/uploads/course-files/${graphs}`, name: 'Graphs Descriptions Useful Vocabulary.pdf' } },
    { type: 'file', payload: { url: `/uploads/course-files/${linking}`, name: 'Linking words.pdf' } },
  ]

  await prisma.$transaction(async (tx) => {
    let row = await tx.courseLesson.findFirst({ where: { courseId: course.id, title: TITLE } })
    if (row) {
      await tx.courseLessonBlock.deleteMany({ where: { lessonId: row.id } })
    } else {
      // After the last Writing lesson of the main course (not the Practice Lab).
      const writing = await tx.courseLesson.findFirst({
        where: { courseId: course.id, title: { contains: 'Writing' }, NOT: { title: { startsWith: 'Practice Lab' } } },
        orderBy: { position: 'desc' },
        select: { position: true },
      })
      const after = writing?.position ?? (await tx.courseLesson.aggregate({ where: { courseId: course.id }, _max: { position: true } }))._max.position ?? 0
      await tx.courseLesson.updateMany({ where: { courseId: course.id, position: { gt: after } }, data: { position: { increment: 100000 } } })
      await tx.courseLesson.updateMany({ where: { courseId: course.id, position: { gt: 100000 } }, data: { position: { decrement: 99999 } } })
      row = await tx.courseLesson.create({ data: { courseId: course.id, position: after + 1, title: TITLE, type: 'supplementary' } })
    }
    await tx.courseLessonBlock.createMany({ data: blocks.map((b, i) => ({ lessonId: row.id, position: i, type: b.type, payload: b.payload })) })
    console.log(`"${TITLE}" is lesson ${row.position} of "${course.title}"`)
  })
}

run()
  .catch((err) => { console.error(err); process.exit(1) })
  .finally(() => prisma.$disconnect())
