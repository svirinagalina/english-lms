import { z } from 'zod'
import { llmEnabled, structured } from './llm.js'

// Without a key the feature stays off and the interface says so; nothing else
// in the app depends on it.
export const assistantEnabled = llmEnabled

const MAX_WORDS = 40

const TranslationSchema = z.object({
  items: z.array(z.object({ word: z.string(), transcription: z.string(), translation: z.string() }))
})

const QuestionsSchema = z.object({
  items: z.array(z.object({ word: z.string(), question: z.string() }))
})

const cleanWords = (words) =>
  [...new Set(words.map((w) => String(w).trim()).filter(Boolean))].slice(0, MAX_WORDS)

export async function translateWords(words) {
  const list = cleanWords(words)
  if (!list.length) return []
  const out = await structured({
    name: 'translations',
    schema: TranslationSchema,
    maxTokens: 4000,
    system:
      'You help a teacher of English prepare materials for Russian-speaking students. ' +
      'For every English word or phrase given, return its IPA transcription in slashes ' +
      '(American English) and a concise Russian translation — the most common meaning, ' +
      'two at most separated by a comma. Keep the original word exactly as given.',
    user: list.join('\n')
  })
  return out?.items ?? []
}

export async function makeQuestions(words) {
  const list = cleanWords(words)
  if (!list.length) return []
  const out = await structured({
    name: 'questions',
    schema: QuestionsSchema,
    maxTokens: 4000,
    system:
      'You help a teacher of English drill vocabulary with adult learners. ' +
      'For every word or phrase given, write one short question in English that uses ' +
      'that exact word, so the student practises it by answering. Requirements: ' +
      'the question must be simple to answer in a sentence or two; it must not be personal ' +
      "(nothing about the student's family, health, money, relationships, beliefs or private life) — " +
      'ask about general facts, opinions on neutral topics, everyday situations or hypotheticals instead; ' +
      'plain question text only, no numbering, no headings, no explanations.',
    user: list.join('\n')
  })
  return out?.items ?? []
}

const MistakeTopicSchema = z.object({ topic: z.string(), note: z.string() })

// Names the grammar point behind one mistake ("Adjectives: -ed vs -ing",
// "Comparatives: no 'more' with -er"). Short, for a tag and a notebook.
export async function classifyMistakeWithAi(said, correct) {
  return structured({
    name: 'mistake_topic',
    schema: MistakeTopicSchema,
    maxTokens: 300,
    system:
      'You are an English teacher. Given what a Russian-speaking learner said and the corrected version, name the ' +
      'single grammar or vocabulary point behind the mistake as a short English label of 2–6 words (e.g. "Present Simple: 3rd person -s", ' +
      '"Adjectives: -ed vs -ing", "Comparatives: -er, not more", "Articles: a/an with jobs", "Word choice: say vs tell"). ' +
      'Then one sentence (in English, simple) explaining the rule. If the sentences are the same or the difference is only spelling, use "Spelling".',
    user: `Said: ${said}\nCorrect: ${correct}`
  })
}
