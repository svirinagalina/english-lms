import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'

// Without a key the feature stays off and the interface says so; nothing else
// in the app depends on it.
export const assistantEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY)

const MODEL = 'claude-opus-5'
const MAX_WORDS = 40

let client = null
const getClient = () => (client ??= new Anthropic())

const TranslationSchema = z.object({
  items: z.array(
    z.object({
      word: z.string(),
      transcription: z.string(),
      translation: z.string()
    })
  )
})

const QuestionsSchema = z.object({
  items: z.array(
    z.object({
      word: z.string(),
      question: z.string()
    })
  )
})

const cleanWords = (words) =>
  [...new Set(words.map((w) => String(w).trim()).filter(Boolean))].slice(0, MAX_WORDS)

export async function translateWords(words) {
  const list = cleanWords(words)
  if (!list.length) return []

  const response = await getClient().messages.parse({
    model: MODEL,
    max_tokens: 4000,
    system:
      'You help a teacher of English prepare materials for Russian-speaking students. ' +
      'For every English word or phrase given, return its IPA transcription in slashes ' +
      '(British English) and a concise Russian translation — the most common meaning, ' +
      'two at most separated by a comma. Keep the original word exactly as given.',
    messages: [{ role: 'user', content: list.join('\n') }],
    output_config: { format: zodOutputFormat(TranslationSchema) }
  })

  return response.parsed_output?.items ?? []
}

export async function makeQuestions(words) {
  const list = cleanWords(words)
  if (!list.length) return []

  const response = await getClient().messages.parse({
    model: MODEL,
    max_tokens: 4000,
    system:
      'You help a teacher of English drill vocabulary with adult learners. ' +
      'For every word or phrase given, write one short question in English that uses ' +
      'that exact word, so the student practises it by answering. Requirements: ' +
      'the question must be simple to answer in a sentence or two; it must not be personal ' +
      '(nothing about the student\'s family, health, money, relationships, beliefs or private life) — ' +
      'ask about general facts, opinions on neutral topics, everyday situations or hypotheticals instead; ' +
      'plain question text only, no numbering, no headings, no explanations.',
    messages: [{ role: 'user', content: list.join('\n') }],
    output_config: { format: zodOutputFormat(QuestionsSchema) }
  })

  return response.parsed_output?.items ?? []
}
