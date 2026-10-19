#!/usr/bin/env node

/**
 * Voices the TOEFL course: every script line, Choose-a-Response prompt,
 * Listen-and-Repeat sentence and interview question without an MP3 yet is
 * generated with Microsoft neural voices (scripts/tts_edge.py, edge-tts) into
 * uploads/toefl-tts/, then the course is re-imported so the tasks point at
 * the files. Existing files are never generated again.
 *
 * Usage: TTS_PYTHON=/path/to/python-with-edge-tts node scripts/generate-toefl-audio.js <schoolId>
 * On the server the files are copied into the uploads volume (see CLAUDE.md).
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'
import { LESSONS } from '../data/toefl/index.js'
import { missingLines, TTS_SUBDIR } from '../data/toefl/audio.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const UPLOAD_ROOT = process.env.UPLOAD_DIR ?? path.resolve(here, '../uploads')

const [, , schoolId] = process.argv
if (!schoolId) { console.error('Usage: node scripts/generate-toefl-audio.js <schoolId>'); process.exit(1) }

const todo = new Map()
for (const lesson of LESSONS) {
  for (const b of lesson.blocks) if (b.type.startsWith('toefl')) for (const l of missingLines(b.payload, UPLOAD_ROOT)) todo.set(l.file, l)
}
console.log(`${todo.size} lines to voice`)
if (todo.size) {
  const list = path.join(os.tmpdir(), `toefl-tts-${process.pid}.json`)
  fs.writeFileSync(list, JSON.stringify([...todo.values()]))
  execFileSync(process.env.TTS_PYTHON ?? 'python3', [path.join(here, 'tts_edge.py'), list, path.join(UPLOAD_ROOT, TTS_SUBDIR)], { stdio: 'inherit' })
  fs.unlinkSync(list)
}
console.log('Re-importing the course with the audio…')
execFileSync(process.execPath, [path.join(here, 'add-toefl-course.js'), schoolId], { stdio: 'inherit' })
