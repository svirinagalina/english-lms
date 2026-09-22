#!/usr/bin/env node

/**
 * Import a course from JSON file.
 * Usage: node scripts/import-course.js <schoolId> <jsonFilePath>
 * Example: node scripts/import-course.js clk123abc /path/to/ielts_course_export.json
 */

import fs from 'fs';
import path from 'path';
import { prisma } from '../src/db.js';

async function importCourse() {
  const [, , schoolId, jsonPath] = process.argv;

  if (!schoolId || !jsonPath) {
    console.error('Usage: node scripts/import-course.js <schoolId> <jsonFilePath>');
    process.exit(1);
  }

  if (!fs.existsSync(jsonPath)) {
    console.error(`File not found: ${jsonPath}`);
    process.exit(1);
  }

  try {
    const school = await prisma.school.findUniqueOrThrow({
      where: { id: schoolId },
    });
    console.log(`✓ School found: ${school.name}`);

    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    const { skillsetName, course: courseData } = jsonData;

    if (!skillsetName || !courseData) {
      throw new Error('JSON must have "skillsetName" and "course" properties');
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
    console.log(`✓ Skillset: ${skillset.name} (${skillset.id})`);

    // Create course
    const course = await prisma.course.create({
      data: {
        skillsetId: skillset.id,
        title: courseData.title,
        description: courseData.description,
      },
    });
    console.log(`✓ Course created: ${course.title} (${course.id})`);

    let blockCount = 0;
    let exerciseCount = 0;

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
          blockCount += lessonData.blocks.length;
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
          exerciseCount += lessonData.exercises.length;
        }

        console.log(`  └─ Lesson ${lesson.position}: ${lesson.title}`);
      }
    }

    console.log(`\n✓ Import complete!`);
    console.log(`  Lessons: ${courseData.lessons?.length || 0}`);
    console.log(`  Content blocks: ${blockCount}`);
    console.log(`  Exercises: ${exerciseCount}`);
  } catch (error) {
    console.error('✗ Error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

importCourse();
