// Normalises an English answer so that formatting differences do not count as
// mistakes: case, surrounding punctuation, curly apostrophes, double spaces.
const CONTRACTIONS = [
  [/\bis not\b/g, "isn't"],
  [/\bare not\b/g, "aren't"],
  [/\bdo not\b/g, "don't"],
  [/\bdoes not\b/g, "doesn't"],
  [/\bdid not\b/g, "didn't"],
  [/\bwas not\b/g, "wasn't"],
  [/\bwere not\b/g, "weren't"],
  [/\bhave not\b/g, "haven't"],
  [/\bhas not\b/g, "hasn't"],
  [/\bhad not\b/g, "hadn't"],
  [/\bwill not\b/g, "won't"],
  [/\bcannot\b/g, "can't"],
  [/\bcan not\b/g, "can't"],
  [/\bi am\b/g, "i'm"],
  [/\bit is\b/g, "it's"],
  [/\bthat is\b/g, "that's"],
  [/\bthere is\b/g, "there's"],
  [/\bthey are\b/g, "they're"],
  [/\bwe are\b/g, "we're"],
  [/\byou are\b/g, "you're"],
  [/\bhe is\b/g, "he's"],
  [/\bshe is\b/g, "she's"]
]

export function normalise(value) {
  let text = String(value ?? '')
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[.!?;,]+\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  // Compare contracted and expanded forms as equal.
  for (const [pattern, replacement] of CONTRACTIONS) {
    text = text.replace(pattern, replacement)
  }

  return text
}

export function checkAnswer(given, accepted) {
  const candidate = normalise(given)
  if (!candidate) return { correct: false, matched: null }

  for (const answer of accepted) {
    if (normalise(answer) === candidate) {
      return { correct: true, matched: answer }
    }
  }

  return { correct: false, matched: null }
}

// Word-level difference, used to show the student what to look at.
export function diffWords(given, expected) {
  const givenWords = normalise(given).split(' ').filter(Boolean)
  const expectedWords = normalise(expected).split(' ').filter(Boolean)

  const missing = expectedWords.filter((word) => !givenWords.includes(word))
  const extra = givenWords.filter((word) => !expectedWords.includes(word))

  return { missing, extra }
}
