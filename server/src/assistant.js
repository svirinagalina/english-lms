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
    maxTokens: 1500,
    effort: 'low',
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
export async function judgeAnswer({ said, correct, answer, topic, prompt }) {
  return structured({
    name: 'judge',
    schema: JudgeSchema,
    maxTokens: 2000,
    effort: 'low',
    system:
      'You check a Russian-speaking learner\'s attempt to correct their own earlier mistake in English. You are given the sentence as they said it (wrong), ' +
      'the teacher\'s correct version, the grammar point behind the mistake, the task (a Russian sentence to translate, when given) and the learner\'s new attempt. Mark the attempt correct if it fixes that grammar point, ' +
      'renders the task\'s meaning (including its context, e.g. a duration requires Present Perfect Continuous) ' +
      'and is a natural, grammatically correct English sentence with the same meaning — it does not have to match the teacher\'s wording (synonyms, contractions, ' +
      'a different but correct tense form where the meaning allows, minor punctuation are fine). Mark it wrong if the original mistake is still there or a new grammar error appears; ' +
      'ignore spelling slips of one letter unless they change the word. Give one short sentence of feedback in Russian (keep grammar terms in English): what was fixed, or what is still wrong and how to say it.',
    user: `${prompt ? `Task (Russian sentence to translate): ${prompt}\n` : ''}Said (wrong): ${said}\nTeacher's correct version: ${correct}\nGrammar point: ${topic || '—'}\nLearner's attempt: ${answer}`
  })
}

// Judges a textbook exercise answer that didn't match the key word for
// word. The key lists one or two answers, never every correct one; the AI
// reads the task in its context (the chapter's grammar topic, the Russian
// sentence) and accepts any answer a teacher would.
export async function judgeExerciseAnswer({ chapter, type, prompt, accepted, answer }) {
  const task = type === 'FILL_BLANK'
    ? `Fill in the blank (__) in: ${prompt}\nThe learner's answer is only what goes in the blank.`
    : `Translate into English: ${prompt}`
  return structured({
    name: 'exercise_judge',
    schema: JudgeSchema,
    maxTokens: 2000,
    effort: 'low',
    system:
      "You check a Russian-speaking learner's answer to an exercise from an English grammar textbook. You get the chapter (the grammar it practises), " +
      "the task, the answer key and the learner's answer. The key is NOT exhaustive: mark the answer correct whenever it is a grammatically correct, natural " +
      'English answer to the task with the same meaning — other word order, synonyms, contractions or full forms, British or American usage, another article ' +
      'or tense where the Russian and the context genuinely allow it, a missing or extra full stop or comma, capital letters. ' +
      "Where the chapter's grammar is what the task is about (e.g. a chapter on Present Perfect), the answer must use it correctly. " +
      'Mark it wrong for any grammar mistake, a wrong or missing meaning, or a word that changes the sense; ignore a one-letter spelling slip that does not make ' +
      'another word, but mention it. Feedback: one short sentence in Russian (grammar terms may stay in English) — if correct and different from the key, ' +
      'say briefly that this variant is also fine; if wrong, what exactly is wrong and how to say it.',
    user: `Chapter: ${chapter || '—'}\n${task}\nAnswer key: ${accepted.join(' | ')}\nLearner's answer: ${answer}`
  })
}

const WritingSchema = z.object({ correct: z.boolean(), corrected: z.string(), feedback: z.string() })

// A course's writing task ("rewrite with the correct punctuation"): judged
// against the course's own answer where it has one ("Check yourself"),
// otherwise on the rules. Returns the learner's text corrected and one or
// two sentences in Russian on what was wrong.
export async function judgeWriting({ lesson, task, source, key, answer }) {
  return structured({
    name: 'writing_judge',
    schema: WritingSchema,
    maxTokens: 3000,
    effort: 'low',
    system:
      "You check a Russian-speaking learner's answer in an English writing course about punctuation and sentence structure. You get the lesson, the task, " +
      'the original text the learner had to rewrite (if given), the course answer (if given) and the learner\'s answer. The learner must keep the words and fix ' +
      "the punctuation (commas, full stops, capitals, semicolons…) as the lesson teaches. Mark it correct when the punctuation is right — any variant a careful " +
      'editor would accept counts, the course answer is not the only one. Mark it wrong if a needed comma is missing or a wrong one is added, or words are ' +
      'missing or changed; ignore a typo that does not concern punctuation but mention it. `corrected`: the learner\'s text with the punctuation fixed (the ' +
      'same text if already correct). `feedback`: one or two short sentences in Russian (grammar terms may stay in English) — what is right, or exactly which ' +
      'comma is missing or extra and why.',
    user: `Lesson: ${lesson}\nTask: ${task}\n${source ? `Original text: ${source}\n` : ''}${key ? `Course answer: ${key}\n` : ''}Learner's answer: ${answer}`
  })
}

const RuEnSchema = z.object({ items: z.array(z.object({
  english: z.string(),
  transcription: z.string(),
  pos: z.string(),
  note: z.string()
})) })

// The teacher's dictionary, Russian → English: the usual English
// equivalents of a word or phrase, most common first, each with IPA and a
// short note in Russian on when to use it.
export async function translateRussian(text) {
  const out = await structured({
    name: 'ru_en',
    schema: RuEnSchema,
    maxTokens: 2500,
    effort: 'low',
    system:
      'You are a Russian→English dictionary for an English teacher. For the Russian word or phrase given, return its usual English equivalents, ' +
      'most common first, 1 to 5 of them (fewer when one is clearly the answer). For each: `english` (the word or phrase as it is normally used; a verb ' +
      'without "to" unless the particle is part of the phrase), `transcription` (American IPA in slashes), `pos` (noun, verb, adjective, phrase…) and `note`: ' +
      'a few words in Russian on the meaning or context that sets it apart from the others (e.g. «о человеке», «разг.», «офиц.»). No examples, no extra text.',
    user: text
  })
  return out?.items ?? []
}

const PromptSchema = z.object({ prompt: z.string() })

// A drill task for one mistake: a Russian sentence the learner translates,
// whose natural English is exactly the teacher's correct version — with
// the minimal context the tense needs (duration, a moment in the past…).
export async function draftMistakePrompt({ said, correct, topic }) {
  const out = await structured({
    name: 'drill_prompt',
    schema: PromptSchema,
    maxTokens: 1500,
    effort: 'low',
    system:
      'You write a translation task for a Russian-speaking learner of English. Given the teacher\'s correct English sentence (and the learner\'s earlier wrong version and the grammar point), ' +
      'write ONE Russian sentence whose natural English translation is exactly the correct sentence, in exactly that tense/structure. If the English form only makes sense with context ' +
      '(Present Perfect Continuous needs a duration, Past Continuous needs a moment, Third Conditional needs the past), add that minimal context to the Russian sentence in brackets, e.g. "Она работает (уже два часа)." ' +
      'Natural Russian, no explanations, no English.',
    user: `Correct English: ${correct}\nLearner said (wrong): ${said}\nGrammar point: ${topic || '—'}`
  })
  return out?.prompt?.trim() || null
}
