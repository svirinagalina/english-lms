import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

// Every spoken line of the TOEFL course is one MP3 named by a hash of its
// voice and text (uploads/toefl-tts/<hash>.mp3). The course import attaches
// the files that already exist; scripts/generate-toefl-audio.js makes the
// missing ones. Without files, the page reads the text with the browser's voice.

export const TTS_SUBDIR = 'toefl-tts'

// Microsoft neural voices (generated with edge-tts, scripts/tts_edge.py):
// American, British, Australian and Canadian, as in the real test. Each task
// starts at a different place in the list, so the course doesn't sound like
// the same two people all the time.
const FEMALE = ['en-US-AvaMultilingualNeural', 'en-GB-SoniaNeural', 'en-US-EmmaMultilingualNeural', 'en-AU-NatashaNeural', 'en-US-JennyNeural', 'en-CA-ClaraNeural', 'en-US-AriaNeural']
const MALE = ['en-US-AndrewMultilingualNeural', 'en-GB-RyanNeural', 'en-US-BrianMultilingualNeural', 'en-AU-WilliamMultilingualNeural', 'en-US-GuyNeural', 'en-CA-LiamNeural', 'en-US-ChristopherNeural']
const MALE_NAMES = /^(man|tom|leo|ben|omar|david|marco|lucas|ryan|andrew|tomás|daniel|professor ahmed)$/i
const FEMALE_NAMES = /^(woman|maya|nina|lena|kelly|priya|jenna|hana|aisha|sarah)$/i

const seed = (text) => [...String(text)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 100003, 7)
export const fileFor = (voice, text) => `${crypto.createHash('sha1').update(`${voice}|${text}`).digest('hex').slice(0, 20)}.mp3`

const parse = (script) => String(script).split('\n').filter((l) => l.trim()).map((line) => {
  const m = line.match(/^([A-Za-z][A-Za-z.\s]{0,24}):\s*(.*)$/)
  return m ? { speaker: m[1].trim(), text: m[2] } : { speaker: '_narrator', text: line }
})

// Speakers get a gender from their name, from the task's `genders` hint
// ({ Professor: 'female' }), or by contrast with the previous speaker; then
// the next voice of that gender in the task's own order.
function voicesFor(lines, p, key) {
  const map = new Map()
  const start = seed(key)
  const used = { female: 0, male: 0 }
  let last = null
  for (const { speaker } of lines) {
    if (map.has(speaker)) continue
    const gender = p.genders?.[speaker] ?? (MALE_NAMES.test(speaker) ? 'male' : FEMALE_NAMES.test(speaker) ? 'female'
      : last ? (last === 'male' ? 'female' : 'male') : (p.gender ?? (start % 2 ? 'male' : 'female')))
    const pool = gender === 'male' ? MALE : FEMALE
    map.set(speaker, pool[(start + used[gender]++) % pool.length])
    last = gender
  }
  return map
}

// Lines to voice for one task: each part sets its [{speaker, text, url}] list.
export function speechOf(p) {
  const out = []
  const key = p.title + (p.script ?? p.scenario ?? '')
  const start = seed(key)
  if (p.script) {
    const lines = parse(p.script)
    const v = voicesFor(lines, p, key)
    out.push({ set: (a) => { p.audio = a }, lines: lines.map((l) => ({ ...l, voice: v.get(l.speaker) })) })
  }
  if (p.task === 'choose-response') {
    p.items.forEach((it, i) => {
      const pool = i % 2 ? MALE : FEMALE
      out.push({ set: (a) => { it.audio = a }, lines: [{ speaker: '_narrator', text: it.prompt, voice: pool[(start + i) % pool.length] }] })
    })
  }
  if (p.task === 'listen-repeat') {
    const pool = p.gender === 'male' ? MALE : FEMALE
    p.sentenceAudio = p.sentenceAudio ?? []
    p.sentences.forEach((s, i) => out.push({ set: (a) => { p.sentenceAudio[i] = a }, lines: [{ speaker: '_narrator', text: s, voice: pool[start % pool.length] }] }))
  }
  if (p.task === 'interview') {
    const pool = start % 2 ? MALE : FEMALE
    p.questionAudio = p.questionAudio ?? []
    p.questions.forEach((s, i) => out.push({ set: (a) => { p.questionAudio[i] = a }, lines: [{ speaker: '_narrator', text: s, voice: pool[start % pool.length] }] }))
  }
  return out
}

// All tasks inside a block payload (a set, or a simulation test).
export function tasksOf(payload) {
  if (payload.task) return [payload]
  const all = []
  for (const sec of Object.values(payload.sections ?? {})) {
    for (const key of ['routing', 'upper', 'lower', 'tasks']) all.push(...(sec[key] ?? []))
  }
  return all
}

// Attaches the audio files that exist. Returns how many lines are missing.
export function attachAudio(payload, uploadRoot) {
  let missing = 0
  for (const task of tasksOf(payload)) {
    for (const part of speechOf(task)) {
      const files = part.lines.map((l) => ({ ...l, file: fileFor(l.voice, l.text) }))
      const have = files.every((f) => fs.existsSync(path.join(uploadRoot, TTS_SUBDIR, f.file)))
      if (have) part.set(files.map((f) => ({ speaker: f.speaker, text: f.text, url: `/uploads/${TTS_SUBDIR}/${f.file}` })))
      else missing += files.length
    }
    // Clean empty placeholders so the client falls back to the browser voice.
    if (Array.isArray(task.sentenceAudio) && !task.sentenceAudio.some(Boolean)) delete task.sentenceAudio
    if (Array.isArray(task.questionAudio) && !task.questionAudio.some(Boolean)) delete task.questionAudio
  }
  return missing
}

// Every line still to generate: [{ voice, text, file }].
export function missingLines(payload, uploadRoot) {
  const out = new Map()
  for (const task of tasksOf(structuredClone(payload))) {
    for (const part of speechOf(task)) {
      for (const l of part.lines) {
        const file = fileFor(l.voice, l.text)
        if (!fs.existsSync(path.join(uploadRoot, TTS_SUBDIR, file))) out.set(file, { voice: l.voice, text: l.text, file })
      }
    }
  }
  return [...out.values()]
}
