import { html, set } from './helpers.js'
import { OVERVIEW, THEORY } from './theory.js'
import { COMPLETE_WORDS, DAILY_LIFE, ACADEMIC_PASSAGES } from './reading.js'
import { CHOOSE_RESPONSE, CONVERSATIONS, ANNOUNCEMENTS, ACADEMIC_TALKS } from './listening.js'
import { BUILD_SENTENCE, EMAILS, DISCUSSIONS } from './writing.js'
import { LISTEN_REPEAT, INTERVIEWS } from './speaking.js'
import { TEST_1 } from './test1.js'
import { TEST_2 } from './test2.js'
import { TEST_3 } from './test3.js'
import { TEST_4 } from './test4.js'
import { COMPLETE_WORDS_2, DAILY_LIFE_2, ACADEMIC_PASSAGES_2 } from './reading2.js'
import { CHOOSE_RESPONSE_2, CONVERSATIONS_2, ANNOUNCEMENTS_2, ACADEMIC_TALKS_2 } from './listening2.js'
import { BUILD_SENTENCE_2, EMAILS_2, DISCUSSIONS_2 } from './writing2.js'
import { LISTEN_REPEAT_2, INTERVIEWS_2 } from './speaking2.js'

// The TOEFL iBT 2026 course: an overview, one lesson per task type (theory +
// six practice sets) and four full simulation tests.
// Loaded by scripts/add-toefl-course.js.

export const COURSE = {
  skillset: 'TOEFL',
  title: 'TOEFL iBT 2026',
  description: 'Подготовка к TOEFL iBT в новом формате 2026 года: все 12 типов заданий, тренировки с таймером и объяснениями, ИИ-проверка письма и речи, адаптивные пробные тесты со шкалой 1–6.',
}

const typeLesson = (title, task, sets) => ({
  title,
  type: 'practice',
  blocks: [html('Теория и стратегии', THEORY[task]), ...sets.map(set)],
})

export const LESSONS = [
  { title: 'TOEFL iBT 2026: формат, баллы и как учиться', type: 'theory', blocks: [html('Обзор экзамена', OVERVIEW)] },
  typeLesson('Reading: Complete the Words', 'complete-words', [...COMPLETE_WORDS, ...COMPLETE_WORDS_2]),
  typeLesson('Reading: Read in Daily Life', 'daily-life', [...DAILY_LIFE, ...DAILY_LIFE_2]),
  typeLesson('Reading: Read an Academic Passage', 'academic-passage', [...ACADEMIC_PASSAGES, ...ACADEMIC_PASSAGES_2]),
  typeLesson('Listening: Listen and Choose a Response', 'choose-response', [...CHOOSE_RESPONSE, ...CHOOSE_RESPONSE_2]),
  typeLesson('Listening: Listen to a Conversation', 'conversation', [...CONVERSATIONS, ...CONVERSATIONS_2]),
  typeLesson('Listening: Listen to an Announcement', 'announcement', [...ANNOUNCEMENTS, ...ANNOUNCEMENTS_2]),
  typeLesson('Listening: Listen to an Academic Talk', 'academic-talk', [...ACADEMIC_TALKS, ...ACADEMIC_TALKS_2]),
  typeLesson('Writing: Build a Sentence', 'build-sentence', [...BUILD_SENTENCE, ...BUILD_SENTENCE_2]),
  typeLesson('Writing: Write an Email', 'email', [...EMAILS, ...EMAILS_2]),
  typeLesson('Writing: Academic Discussion', 'discussion', [...DISCUSSIONS, ...DISCUSSIONS_2]),
  typeLesson('Speaking: Listen and Repeat', 'listen-repeat', [...LISTEN_REPEAT, ...LISTEN_REPEAT_2]),
  typeLesson('Speaking: Take an Interview', 'interview', [...INTERVIEWS, ...INTERVIEWS_2]),
  { title: 'Simulation Test 1', type: 'practice', blocks: [{ type: 'toefl-test', payload: TEST_1 }] },
  { title: 'Simulation Test 2', type: 'practice', blocks: [{ type: 'toefl-test', payload: TEST_2 }] },
  { title: 'Simulation Test 3', type: 'practice', blocks: [{ type: 'toefl-test', payload: TEST_3 }] },
  { title: 'Simulation Test 4', type: 'practice', blocks: [{ type: 'toefl-test', payload: TEST_4 }] },
]
