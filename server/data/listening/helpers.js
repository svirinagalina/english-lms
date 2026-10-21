// Shapes for the Listening courses (scripts/add-listening-courses.js).
// Every story and podcast here is written for this platform.
//
// A lesson is an "audiobook" block — the text by paragraph, each voiced with
// one Microsoft neural voice (scripts/generate-listening-audio.js; a
// paragraph without its file plays in the browser's voice) — followed by
// comprehension questions in a "choice" block.

export const q = (question, options, answer) => {
  const i = options.indexOf(answer)
  if (i < 0) throw new Error(`Answer "${answer}" is not among the options of "${question}"`)
  return { question, options, correct: [i] }
}

const lesson = (type, label) => ({ title, voice, paragraphs, questions }) => ({ title, type, voice, paragraphs, questions, label })

// Lesson types double as the two sections of each course.
export const story = lesson('detective', 'Detective story')
export const podcast = lesson('podcast', 'Interesting facts')
