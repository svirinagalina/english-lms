#!/usr/bin/env node

/**
 * Voices every paragraph of the Listening courses (data/listening/) with
 * free Microsoft neural voices via edge-tts, one MP3 per paragraph under
 * uploads/listening-tts/ (named by a hash of voice, speed and text, so only
 * new or edited paragraphs are voiced). Then imports the courses so the
 * lessons pick the files up.
 *
 * Usage: TTS_PYTHON=/path/to/python-with-edge-tts node scripts/generate-listening-audio.js <schoolId>
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'
import { LISTENING_COURSES, AUDIO_SUBDIR, audioFile } from '../data/listening/index.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const UPLOAD_ROOT = process.env.UPLOAD_DIR ?? path.resolve(here, '../uploads')
const dir = path.join(UPLOAD_ROOT, AUDIO_SUBDIR)

const [, , schoolId] = process.argv
if (!schoolId) { console.error('Usage: node scripts/generate-listening-audio.js <schoolId>'); process.exit(1) }

const todo = new Map()
for (const course of LISTENING_COURSES) {
  for (const lesson of course.lessons) {
    for (const text of lesson.paragraphs) {
      const file = audioFile(lesson.voice, course.rate, text)
      if (!fs.existsSync(path.join(dir, file))) todo.set(file, { voice: lesson.voice, rate: course.rate, text, file })
    }
  }
}
console.log(`${todo.size} paragraphs to voice`)
if (todo.size) {
  const list = path.join(os.tmpdir(), `listening-tts-${process.pid}.json`)
  fs.writeFileSync(list, JSON.stringify([...todo.values()]))
  execFileSync(process.env.TTS_PYTHON ?? 'python3', [path.join(here, 'tts_edge.py'), list, dir], { stdio: 'inherit' })
  fs.unlinkSync(list)
}
console.log('Importing the courses with the audio…')
execFileSync(process.execPath, [path.join(here, 'add-listening-courses.js'), schoolId], { stdio: 'inherit' })
