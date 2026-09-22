#!/usr/bin/env node

/**
 * Import a course scraped from Edvibe.
 * Usage: node scripts/import-course.js <schoolId> <jsonFilePath> [skillsetName]
 * Example: node scripts/import-course.js clk123abc ../ielts-course.json IELTS
 *
 * Accepts the Edvibe export shape:
 *   { course: { title, description, language }, lessons: [
 *     { title, type, contents: [{ type, title, content }], exercises: [...] }
 *   ]}
 * `contents[].content` is a plain URL for video/file; it's converted into
 * this app's block payload shape (youtubeId extracted for YouTube links).
 */

import fs from 'fs';
import { prisma } from '../src/db.js';

function extractYoutubeId(url) {
  const match = url.match(/(?:youtu\.be\/|v=)([\w-]{11})/);
  return match ? match[1] : null;
}

// Edvibe's flat { type, title, content } into this app's { type, payload }.
function toBlock(content, position) {
  if (content.type === 'video') {
    const youtubeId = extractYoutubeId(content.content);
    return {
      position,
      type: 'video',
      payload: youtubeId
        ? { youtubeId, title: content.title }
        : { url: content.content, title: content.title },
    };
  }
  if (content.type === 'file' || content.type === 'audio') {
    return {
      position,
      type: content.type,
      payload: { url: content.content, name: content.title },
    };
  }
  if (content.type === 'image') {
    return { position, type: 'image', payload: { url: content.content, caption: content.title } };
  }
  // text, or anything unrecognized: keep the raw content as text.
  return { position, type: 'text', payload: { content: content.content ?? content.title ?? '' } };
}

async function importCourse() {
  const [, , schoolId, jsonPath, skillsetNameArg] = process.argv;

  if (!schoolId || !jsonPath) {
    console.error('Usage: node scripts/import-course.js <schoolId> <jsonFilePath> [skillsetName]');
    process.exit(1);
  }

  if (!fs.existsSync(jsonPath)) {
    console.error(`File not found: ${jsonPath}`);
    process.exit(1);
  }

  try {
    const school = await prisma.school.findUniqueOrThrow({ where: { id: schoolId } });
    console.log(`✓ School found: ${school.name}`);

    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    const courseData = jsonData.course;
    const lessons = jsonData.lessons ?? courseData?.lessons;
    const skillsetName = skillsetNameArg || jsonData.skillsetName || 'IELTS';

    if (!courseData?.title || !Array.isArray(lessons)) {
      throw new Error('JSON must have "course.title" and a "lessons" array (top-level or under course)');
    }

    const skillset = await prisma.skillset.upsert({
      where: { schoolId_name: { schoolId, name: skillsetName } },
      update: {},
      create: { schoolId, name: skillsetName },
    });
    console.log(`✓ Skillset: ${skillset.name} (${skillset.id})`);

    const course = await prisma.course.create({
      data: { skillsetId: skillset.id, title: courseData.title, description: courseData.description },
    });
    console.log(`✓ Course created: ${course.title} (${course.id})`);

    let blockCount = 0
    let exerciseCount = 0

    for (const [index, lessonData] of lessons.entries()) {
      const position = lessonData.position ?? index + 1

      const lesson = await prisma.courseLesson.create({
        data: {
          courseId: course.id,
          position,
          title: lessonData.title,
          type: lessonData.type || 'theory',
        },
      })

      const contents = lessonData.contents ?? lessonData.blocks ?? []
      if (contents.length) {
        const blocks = lessonData.blocks
          // Already in this app's shape (position/type/payload).
          ? contents.map((b, i) => ({ position: b.position ?? i, type: b.type, payload: b.payload || {} }))
          // Edvibe's shape (type/title/content) — convert.
          : contents.map((c, i) => toBlock(c, i))

        await prisma.courseLessonBlock.createMany({
          data: blocks.map((b) => ({ lessonId: lesson.id, ...b })),
        })
        blockCount += blocks.length
      }

      if (lessonData.exercises?.length) {
        await prisma.courseExercise.createMany({
          data: lessonData.exercises.map((exercise, i) => ({
            lessonId: lesson.id,
            position: exercise.position ?? i,
            type: exercise.type,
            question: exercise.question,
            payload: exercise.payload || {},
          })),
        })
        exerciseCount += lessonData.exercises.length
      }

      console.log(`  └─ Lesson ${lesson.position}: ${lesson.title}`)
    }

    console.log(`\n✓ Import complete!`)
    console.log(`  Lessons: ${lessons.length}`)
    console.log(`  Content blocks: ${blockCount}`)
    console.log(`  Exercises: ${exerciseCount}`)
  } catch (error) {
    console.error('✗ Error:', error.message)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

importCourse()
