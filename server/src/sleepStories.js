import { z } from 'zod'
import { llmEnabled, structured } from './llm.js'

// Sleep and meditation stories in English, written by the platform's AI key.
// Only the owner generates them; the text is stored and read aloud in the browser.
export const sleepStoriesEnabled = llmEnabled

export const STORY_TOPICS = [
  'a night walk through a quiet pine forest with a stream',
  'a slow night train ride past sleeping villages',
  'lying in an open field watching the stars',
  'a calm evening on a sea shore with a lighthouse far away',
  'a wooden cabin by a lake in the morning mist',
  'a warm rainy afternoon in a small garden',
  'a slow night train crossing the Swiss Alps past lakes, chalets and snowy peaks, the rhythm of the wheels',
  'a Trans-Siberian night train along the shore of Lake Baikal through the taiga, the rhythm of the wheels'
]

export const KIDS_TOPICS = [
  'Sasha and Tirli and a sleepy owl in the attic: a little spooky, then friendly',
  'Sasha and Tirli and the enchanted forest: lost on a path, glowing mushrooms, a kind bear',
  'Sasha and Tirli on a moonlit lake: a big splash that turns out to be a friendly catfish'
]

const KIDS_SYSTEM =
  'You write bedtime stories for children aged 4 to 8, in Russian. The main characters are Sasha (a boy) ' +
  'and Tirli (his small, fluffy, curious friend). Every story has a playful adventure with a little bit of ' +
  'spooky tension at the start (a noise, a shadow, a lost path), which turns out to be friendly by the end. ' +
  'Use short sentences, simple words, gentle humour, and a calm ending where the children fall asleep. ' +
  'No real violence, no scary monsters that stay scary. About 350 words. Plain text, paragraphs separated by blank lines.'

const StorySchema = z.object({
  title: z.string(),
  text: z.string()
})

const SYSTEM =
  'You write sleep and meditation stories in English for adults who want to fall asleep. ' +
  'Use slow rhythm, short calm sentences, second person ("you"), soft sensory details, ' +
  'no plot twists, no tension, no questions to the listener. Every few paragraphs, invite ' +
  'the listener to breathe slowly. The last paragraphs gently slow the breathing and invite sleep. ' +
  'Write about 600 words, in paragraphs separated by blank lines. Plain text only.'

// Reading pace for a bedtime story is slow, about 120 words a minute.
const WORDS_PER_MINUTE = 120

export async function generateSleepStory(topic, kind = 'sleep') {
  const kids = kind === 'kids'
  const out = await structured({
    name: 'sleep_story',
    schema: StorySchema,
    maxTokens: 3000,
    system: kids ? KIDS_SYSTEM : SYSTEM,
    user: kids ? `Story idea: ${topic}` : `Topic: ${topic}`
  })
  if (!out?.text?.trim()) throw new Error('Empty story from the model')
  const words = out.text.trim().split(/\s+/).length
  return {
    title: out.title.trim().slice(0, 120) || 'Untitled story',
    text: out.text.trim(),
    minutes: Math.max(1, Math.round(words / WORDS_PER_MINUTE)),
    kind: kids ? 'kids' : 'sleep',
    language: kids ? 'ru' : 'en'
  }
}
