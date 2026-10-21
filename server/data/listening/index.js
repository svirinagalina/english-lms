import crypto from 'crypto'
import { B1 } from './b1.js'
import { B2 } from './b2.js'
import { C1 } from './c1.js'

// The three Listening courses, easiest first.
export const LISTENING_COURSES = [B1, B2, C1]

// Where a paragraph's MP3 lives under UPLOAD_DIR, and its URL: the name is a
// hash of voice, speed and text, so editing a paragraph makes a new file and
// an unchanged one is never voiced twice.
export const AUDIO_SUBDIR = 'listening-tts'
export const audioFile = (voice, rate, text) => `${crypto.createHash('sha1').update(`${voice}|${rate}|${text}`).digest('hex')}.mp3`
export const audioUrl = (file) => `/uploads/${AUDIO_SUBDIR}/${file}`
