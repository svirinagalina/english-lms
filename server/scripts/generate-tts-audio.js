#!/usr/bin/env node

/**
 * Replaces every course "tts" block (browser-read listening scripts) with
 * real generated audio: each dialogue line becomes its own MP3 via OpenAI's
 * TTS, one voice per speaker (so a two-person conversation actually sounds
 * like two people), saved under uploads/course-tts/ and referenced from the
 * block's payload as a playable line list — the client plays them back to
 * back like a playlist.
 *
 * Usage: node scripts/generate-tts-audio.js <schoolId>
 * Requires OPENAI_API_KEY in the environment.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import OpenAI from 'openai'
import { prisma } from '../src/db.js'

const UPLOAD_ROOT = process.env.UPLOAD_DIR ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../uploads')
const TTS_DIR = path.join(UPLOAD_ROOT, 'course-tts')
const MODEL = 'tts-1'
// A clearly female-sounding voice for the first speaker in a scene, a
// clearly male-sounding one for the second — assigned in order of first
// appearance, same as the browser-voice version being replaced.
const VOICES = ['nova', 'onyx']

const parseDialogue = (script) =>
  script.split('\n').filter((line) => line.trim()).map((line) => {
    const match = line.match(/^([A-Za-z][A-Za-z\s]{0,24}):\s*(.*)$/)
    return match ? { speaker: match[1], text: match[2] } : { speaker: '_narrator', text: line }
  })

async function run() {
  const [, , schoolId] = process.argv
  if (!schoolId) {
    console.error('Usage: node scripts/generate-tts-audio.js <schoolId>')
    process.exit(1)
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is not set')
    process.exit(1)
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const skillset = await prisma.skillset.findFirst({ where: { schoolId, name: 'IELTS' } })
  if (!skillset) throw new Error('No IELTS skillset found for this school')
  const course = await prisma.course.findFirst({ where: { skillsetId: skillset.id } })
  if (!course) throw new Error('No course found in the IELTS skillset')

  const blocks = await prisma.courseLessonBlock.findMany({
    where: { type: 'tts', lesson: { courseId: course.id } },
    include: { lesson: { select: { position: true, title: true } } },
  })
  console.log(`Found ${blocks.length} listening script(s) to convert`)

  await fs.promises.mkdir(TTS_DIR, { recursive: true })

  for (const block of blocks) {
    const { script, title } = block.payload
    if (!script) { console.warn(`  Block ${block.id} has no script, skipping`); continue }
    console.log(`\nLesson ${block.lesson.position} — ${title ?? '(untitled)'}`)

    const lines = parseDialogue(script)
    const speakerVoice = new Map()
    let nextVoice = 0
    const voiceFor = (speaker) => {
      if (!speakerVoice.has(speaker)) { speakerVoice.set(speaker, VOICES[nextVoice % VOICES.length]); nextVoice++ }
      return speakerVoice.get(speaker)
    }

    const outLines = []
    for (const [i, line] of lines.entries()) {
      const voice = voiceFor(line.speaker)
      const response = await openai.audio.speech.create({ model: MODEL, voice, input: line.text })
      const buffer = Buffer.from(await response.arrayBuffer())
      const fileName = `${block.id}-${String(i).padStart(2, '0')}.mp3`
      await fs.promises.writeFile(path.join(TTS_DIR, fileName), buffer)
      outLines.push({ speaker: line.speaker, text: line.text, url: `/uploads/course-tts/${fileName}` })
      process.stdout.write('.')
    }
    console.log(` ${lines.length} lines`)

    await prisma.courseLessonBlock.update({
      where: { id: block.id },
      data: { payload: { title, lines: outLines } },
    })
  }

  console.log('\nDone.')
}

run().catch((err) => { console.error(err); process.exit(1) }).finally(() => prisma.$disconnect())
