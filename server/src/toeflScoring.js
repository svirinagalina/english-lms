import { z } from 'zod'
import { structured } from './llm.js'
import { aiConfig } from './settings.js'

// AI scoring for the TOEFL course's productive tasks. The rubric wording is
// our own summary of what the 2026 TOEFL scores (task completion, development,
// organisation, language range and accuracy); the 0–5 raw score is turned into
// the 1–6 band the same way for every task.

const ScoreSchema = z.object({
  score: z.number(),
  summary: z.string(),
  strengths: z.array(z.string()),
  improve: z.array(z.string()),
  corrected: z.string(),
})

const RUBRIC = {
  email:
    'Task: Write an Email (about 7 minutes, typically 100–150 words). 5 = fully does all three things the task asks, clear purpose, ' +
    'appropriate tone and register for the reader, well organised, wide and precise vocabulary, almost no errors. 4 = does all parts, ' +
    'mostly appropriate tone, minor errors that never confuse. 3 = parts are missing or underdeveloped, or the tone is off, or noticeable ' +
    'errors sometimes obscure meaning. 2 = limited response, several parts missing, frequent errors. 1 = barely addresses the task. 0 = blank, ' +
    'off-topic or copied.',
  discussion:
    'Task: Academic Discussion (10 minutes, a strong answer is usually 100+ words). The student must answer the professor\'s question with ' +
    'their own opinion and contribute something new to the discussion (not repeat the classmates). 5 = relevant, well-elaborated contribution ' +
    'with clear reasons and examples, varied and precise language, almost no errors. 4 = relevant and adequately elaborated, mostly clear, ' +
    'a few errors. 3 = relevant but partly elaborated, or noticeable language problems. 2 = mostly undeveloped or hard to follow. ' +
    '1 = little relevant content. 0 = blank, off-topic or copied.',
  interview:
    'Task: Take an Interview — a spoken answer (45 seconds) to an interviewer\'s question. You only get a speech-to-text transcript, so judge ' +
    'content, development, vocabulary and grammar; do not punish missing punctuation or transcription glitches, and say that pronunciation ' +
    'and fluency are judged by the teacher from the recording. 5 = fully answers, well developed with reasons/examples, varied and accurate ' +
    'language. 4 = answers clearly with some development, minor errors. 3 = answers but thinly developed or with errors that sometimes ' +
    'confuse. 2 = very limited. 1 = hardly answers. 0 = no answer.',
}

const SYSTEM =
  'You are an experienced TOEFL iBT rater scoring a practice answer of a Russian-speaking learner on the 2026 TOEFL format. ' +
  'Give `score` from 0 to 5 in steps of 0.5 using the rubric. `summary`: 1–2 sentences in Russian with the overall verdict. ' +
  '`strengths`: 1–3 short points in Russian. `improve`: 2–4 concrete, actionable points in Russian (quote the exact phrase that needs ' +
  'fixing and give the better English version). `corrected`: the learner\'s text with grammar and word choice corrected, keeping their ' +
  'ideas (English). Be fair and calibrated: a native-like, complete answer gets 5; do not inflate.'

// 0–5 raw → band 1–6.
export const rawToBand = (raw) => Math.max(1, Math.min(6, Math.round((1 + raw) * 2) / 2))

export async function scoreToefl({ task, prompt, answer }) {
  const rubric = RUBRIC[task]
  if (!rubric) throw new Error(`No rubric for ${task}`)
  const out = await structured({
    name: 'toefl_score',
    schema: ScoreSchema,
    maxTokens: 4000,
    system: `${SYSTEM}\n\n${rubric}`,
    user: `${prompt}\n\nThe learner's answer:\n${answer}`,
  })
  if (!out) return null
  const score = Math.max(0, Math.min(5, Math.round(out.score * 2) / 2))
  return { score, band: rawToBand(score), summary: out.summary, strengths: out.strengths, improve: out.improve, corrected: out.corrected }
}

// Listen & Repeat is scored without AI: how many words of the sentence the
// transcript reproduced, in order (longest common subsequence). 0–5 like ETS.
const words = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9'\s]/g, ' ').split(/\s+/).filter(Boolean)
export function scoreRepeat(target, said) {
  const a = words(target)
  const b = words(said)
  if (!a.length) return { score: 0, ratio: 0 }
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }
  const ratio = dp[a.length][b.length] / a.length
  const score = ratio >= 0.98 ? 5 : ratio >= 0.85 ? 4 : ratio >= 0.65 ? 3 : ratio >= 0.4 ? 2 : ratio > 0 ? 1 : 0
  return { score, ratio }
}

// Speech to text on the server when an OpenAI key is configured; otherwise
// the transcript the browser's own recogniser produced is used.
export const canTranscribe = () => Boolean(process.env.OPENAI_API_KEY || aiConfig()?.provider === 'openai')
let openai = null
export async function transcribe(buffer, mime) {
  const key = process.env.OPENAI_API_KEY || (aiConfig()?.provider === 'openai' ? aiConfig().key : null)
  if (!key) return null
  if (!openai) {
    const { default: OpenAI, toFile } = await import('openai')
    openai = { client: new OpenAI({ apiKey: key, timeout: 60000, maxRetries: 1 }), toFile }
  }
  const ext = mime.includes('mp4') ? 'mp4' : mime.includes('ogg') ? 'ogg' : 'webm'
  const file = await openai.toFile(buffer, `answer.${ext}`, { type: mime })
  const out = await openai.client.audio.transcriptions.create({ file, model: 'gpt-4o-mini-transcribe', language: 'en' })
  return out.text?.trim() || null
}
