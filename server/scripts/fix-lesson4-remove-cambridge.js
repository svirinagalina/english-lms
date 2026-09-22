#!/usr/bin/env node

/**
 * Lesson 4 ("Listening: Tests With Tape Scripts. Practice") still had 3 real
 * Cambridge IELTS test recordings (re-hosted from Edvibe's CDN in an earlier
 * pass, since they were "working content" at the time) — these are
 * copyrighted Cambridge material, not original, and must go along with
 * everything else that wasn't hers. Deletes those 3 audio blocks and fills
 * the lesson with an original listening script + practice, same pattern as
 * lessons 7-9 in generate-practice-content.js.
 *
 * Usage: node scripts/fix-lesson4-remove-cambridge.js <schoolId>
 */

import { prisma } from '../src/db.js'

async function run() {
  const [, , schoolId] = process.argv
  if (!schoolId) {
    console.error('Usage: node scripts/fix-lesson4-remove-cambridge.js <schoolId>')
    process.exit(1)
  }

  const skillset = await prisma.skillset.findFirst({ where: { schoolId, name: 'IELTS' } })
  if (!skillset) throw new Error('No IELTS skillset found for this school')
  const course = await prisma.course.findFirst({ where: { skillsetId: skillset.id } })
  if (!course) throw new Error('No course found in the IELTS skillset')

  const lesson = await prisma.courseLesson.findUnique({ where: { courseId_position: { courseId: course.id, position: 4 } } })
  if (!lesson) throw new Error('Lesson 4 not found')

  const removed = await prisma.courseLessonBlock.deleteMany({ where: { lessonId: lesson.id, type: 'audio' } })
  console.log(`Removed ${removed.count} Cambridge audio block(s) from lesson 4`)

  await prisma.courseLessonBlock.create({
    data: {
      lessonId: lesson.id,
      position: 0,
      type: 'tts',
      payload: {
        title: 'Listening script — Section 1: Enrolling in an evening class',
        script: `Assistant: Good evening, City Learning Centre, how can I help?
Caller: Hi, I'd like to sign up for one of your evening classes, please.
Assistant: Sure, which course are you interested in?
Caller: The Spanish for Beginners course, if there's still space.
Assistant: Let me check... yes, there are three spaces left. Can I take your name?
Caller: It's Fatima Hassan. That's H, A, S, S, A, N.
Assistant: Thank you. And the course runs on Tuesday evenings from six to eight, starting next month. The fee is one hundred and twenty pounds for the full ten-week term.
Caller: Does that include course materials?
Assistant: It includes the workbook, but not the additional grammar guide — that's an extra twelve pounds if you'd like it.
Caller: I'll take the grammar guide as well then.
Assistant: No problem. Can I have a contact number?
Caller: Yes, it's oh-seven-seven-one-one, three-three-two, two-oh-nine.
Assistant: And an email address, for the confirmation?
Caller: It's fhassan, all one word, at fastmail dot com.
Assistant: Great. One last thing — we ask new students to arrive fifteen minutes early on the first day for a short placement chat with the teacher.
Caller: That's fine, thank you.`,
      },
    },
  })

  await prisma.courseExercise.createMany({
    data: [
      { lessonId: lesson.id, position: 0, type: 'FILL_BLANK', question: 'Course the caller wants to join: Spanish for ____', payload: { answer: 'Beginners', alternatives: ['beginners'] } },
      { lessonId: lesson.id, position: 1, type: 'FILL_BLANK', question: 'Caller’s surname: ____', payload: { answer: 'Hassan', alternatives: ['hassan'] } },
      { lessonId: lesson.id, position: 2, type: 'FILL_BLANK', question: 'Full course fee: £____', payload: { answer: '120', alternatives: ['£120', 'one hundred and twenty'] } },
      { lessonId: lesson.id, position: 3, type: 'FILL_BLANK', question: 'Extra cost for the grammar guide: £____', payload: { answer: '12', alternatives: ['£12', 'twelve'] } },
      { lessonId: lesson.id, position: 4, type: 'FILL_BLANK', question: 'New students should arrive how many minutes early on the first day?', payload: { answer: '15', alternatives: ['fifteen'] } },
    ],
  })

  console.log('Lesson 4: added 1 listening script + 5 exercises')
}

run().catch((err) => { console.error(err); process.exit(1) }).finally(() => prisma.$disconnect())
