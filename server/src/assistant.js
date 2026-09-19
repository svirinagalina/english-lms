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

const JudgeSchema = z.object({ correct: z.boolean(), feedback: z.string() })

// Judges a drill answer the way a teacher would: the grammar point behind
// the mistake must be fixed; other correct wordings count. Feedback is one
// short sentence in Russian.
export async function judgeAnswer({ said, correct, answer, topic }) {
  return structured({
    name: 'judge',
    schema: JudgeSchema,
    maxTokens: 300,
    system:
      'You check a Russian-speaking learner\'s attempt to correct their own earlier mistake in English. You are given the sentence as they said it (wrong), ' +
      'the teacher\'s correct version, the grammar point behind the mistake, and the learner\'s new attempt. Mark the attempt correct if it fixes that grammar point ' +
      'and is a natural, grammatically correct English sentence with the same meaning — it does not have to match the teacher\'s wording (synonyms, contractions, ' +
      'a different but correct tense form where the meaning allows, minor punctuation are fine). Mark it wrong if the original mistake is still there or a new grammar error appears; ' +
      'ignore spelling slips of one letter unless they change the word. Give one short sentence of feedback in Russian (keep grammar terms in English): what was fixed, or what is still wrong and how to say it.',
    user: `Said (wrong): ${said}\nTeacher's correct version: ${correct}\nGrammar point: ${topic || '—'}\nLearner's attempt: ${answer}`
  })
}
