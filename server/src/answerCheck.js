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
  [/\bshe is\b/g, "she's"],
  [/\bwould not\b/g, "wouldn't"],
  [/\bshould not\b/g, "shouldn't"],
  [/\bcould not\b/g, "couldn't"],
  [/\bmust not\b/g, "mustn't"],
  [/\bneed not\b/g, "needn't"],
  [/\bshall not\b/g, "shan't"],
  [/\blet us\b/g, "let's"],
  [/\b(what|where|who|how|here) is\b/g, "$1's"],
  // will → 'll and have → 've after a pronoun ("I will have" = "I'll have").
  // 'd and 's-for-has are left out: they stand for two different words.
  [/\b(i|you|he|she|it|we|they|there|that) will\b/g, "$1'll"],
  [/\b(i|you|we|they) have\b/g, "$1've"]
]

// Spellings and short forms that mean the same word. Each entry maps a
// variant to the form used for comparison; the reference and the student's
// answer both go through it, so either spelling passes.
const VARIANTS = new Map(Object.entries({
  tv: 'television', telly: 'television', phone: 'telephone', photo: 'photograph',
  fridge: 'refrigerator', bike: 'bicycle', maths: 'mathematics', math: 'mathematics',
  ok: 'okay', plane: 'airplane', aeroplane: 'airplane', mum: 'mother', mom: 'mother',
  dad: 'father', 'e-mail': 'email', 'ice-cream': 'ice cream', "o'clock": 'oclock',
  // British / American spelling
  colour: 'color', colours: 'colors', favourite: 'favorite', centre: 'center', theatre: 'theater',
  travelling: 'traveling', travelled: 'traveled', realise: 'realize', realised: 'realized',
  neighbour: 'neighbor', neighbours: 'neighbors', programme: 'program', grey: 'gray',
  practise: 'practice', practised: 'practiced', honour: 'honor', labour: 'labor',
  organise: 'organize', organised: 'organized', apologise: 'apologize', apologised: 'apologized',
  recognise: 'recognize', recognised: 'recognized', metre: 'meter', litre: 'liter',
  behaviour: 'behavior', humour: 'humor', jewellery: 'jewelry', cheque: 'check',
  pyjamas: 'pajamas', tyre: 'tire', storey: 'story', kilometre: 'kilometer',
  cancelled: 'canceled', modelling: 'modeling', catalogue: 'catalog', dialogue: 'dialog',
  learnt: 'learned', dreamt: 'dreamed', spelt: 'spelled', burnt: 'burned', smelt: 'smelled',
  // Everyday synonyms the book uses one of, students the other
  cabinet: 'cupboard', bookshelf: 'bookcase', couch: 'sofa', apartment: 'flat', movie: 'film',
  movies: 'films', store: 'shop', vacation: 'holiday', fall: 'autumn', elevator: 'lift',
  subway: 'underground', metro: 'underground', tube: 'underground', cab: 'taxi', yard: 'garden',
  trousers: 'pants', sneakers: 'trainers', sweets: 'candy', biscuits: 'cookies', biscuit: 'cookie',
  chips: 'fries', motorway: 'highway', lorry: 'truck', petrol: 'gas', rubbish: 'garbage',
  trash: 'garbage', queue: 'line', timetable: 'schedule', toilet: 'bathroom', restroom: 'bathroom',
  cinema: 'movies', kids: 'children', kid: 'child', big: 'large', little: 'small',
  begin: 'start', begins: 'starts', began: 'started', begun: 'started', beginning: 'starting',
  maybe: 'perhaps', 'ice-box': 'fridge', 'air-conditioner': 'conditioner', 'air-conditioning': 'conditioner'
}))

// "this bookcase" for the key's "the bookcase" when the Russian says «этом»:
// both render the demonstrative, so they compare as equal.
// (\b is ASCII-only in JS, hence the explicit Cyrillic boundaries.)
const DEMONSTRATIVE_RU = /(^|[^а-яё])эт(от|а|о|и|ом|ой|их|ого|ому|у|им|ими)(?=[^а-яё]|$)/i
const DEMONSTRATIVES = new Set(['this', 'that', 'these', 'those'])

export function normalise(value) {
  let text = String(value ?? '')
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    // Punctuation does not make a translation wrong: a dash before a reply,
    // a comma, a missing full stop or question mark.
    .replace(/[“”"„«».!?;:,()—–]/g, ' ')
    // A dash or underscore standing alone is how a student fills a blank
    // that wants no word at all (an article exercise's "— no article needed").
    // It is only this stand-in when the whole "word" is dashes/underscores —
    // "well-known" and a real blank marker keep their punctuation.
    .replace(/(^|\s)[-_]+(\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // Compare contracted and expanded forms as equal.
  for (const [pattern, replacement] of CONTRACTIONS) {
    text = text.replace(pattern, replacement)
  }

  return text
    .split(' ')
    .map((word) => VARIANTS.get(word) ?? word)
    .join(' ')
}

const foldDemonstratives = (text) =>
  text.split(' ').map((word) => (DEMONSTRATIVES.has(word) ? 'the' : word)).join(' ')

// An alternative in the key is often a phrase, not a full sentence:
// "there isn't anyone" next to "There is no one in the kitchen". The
// student's answer passes when it is the main answer with that phrase
// swapped in — a prefix of the main answer, the phrase, a suffix of it.
function matchesWithPhrase(candidate, main, phrase) {
  const at = candidate.indexOf(phrase)
  if (at === -1) return false
  const head = candidate.slice(0, at).trim()
  const tail = candidate.slice(at + phrase.length).trim()
  const mainWords = main.split(' ')
  const headWords = head ? head.split(' ') : []
  const tailWords = tail ? tail.split(' ') : []
  if (headWords.length + tailWords.length >= mainWords.length) return false
  const startsWith = headWords.every((word, i) => mainWords[i] === word)
  const endsWith = tailWords.every((word, i) => mainWords[mainWords.length - tailWords.length + i] === word)
  return startsWith && endsWith
}

export function checkAnswer(given, accepted, { prompt = '' } = {}) {
  const raw = normalise(given)
  // An empty normalised answer is not automatically wrong: it is exactly
  // what a student submits for "no article/word needed" (dash, underscore),
  // which itself normalises to nothing — the comparison below settles it
  // against what the exercise actually accepts.

  const flexible = DEMONSTRATIVE_RU.test(prompt)
  const fold = (text) => (flexible ? foldDemonstratives(text) : text)
  const candidate = fold(raw)
  const answers = accepted.map((answer) => ({ answer, norm: fold(normalise(answer)) }))

  for (const { answer, norm } of answers) {
    if (norm === candidate) return { correct: true, matched: answer }
  }

  // Phrase alternatives, swapped into the full first answer.
  const main = answers[0]?.norm ?? ''
  for (const { answer, norm } of answers.slice(1)) {
    if (norm.split(' ').length < main.split(' ').length && matchesWithPhrase(candidate, main, norm)) {
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
