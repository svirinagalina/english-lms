import { normalise } from './answerCheck.js'

// Grammar topics. Each has a label for the teacher and the words or patterns
// that betray it, both in a reference answer (for tagging exercises) and in
// the difference between a student's answer and the reference (for
// classifying mistakes).
export const TOPICS = {
  'there-is-are': { label: 'There is / there are', words: ['there'] },
  articles: { label: 'Articles (a / an / the)', words: ['a', 'an', 'the'] },
  'verb-to-be': { label: 'Verb to be', words: ['am', 'is', 'are', 'was', 'were', 'be', 'been', 'being'] },
  'auxiliary-do': {
    label: 'Questions and negatives with do / does / did',
    words: ['do', 'does', 'did', "don't", "doesn't", "didn't"]
  },
  'present-perfect': { label: 'Present Perfect', words: ['have', 'has', "haven't", "hasn't"] },
  'past-perfect': { label: 'Past Perfect', words: ['had', "hadn't"] },
  'future-will': { label: 'Future with will', words: ['will', "won't", 'shall'] },
  modals: {
    label: 'Modal verbs',
    words: ['can', "can't", 'cannot', 'could', "couldn't", 'must', "mustn't", 'should', "shouldn't", 'may', 'might', 'ought']
  },
  prepositions: {
    label: 'Prepositions',
    words: ['in', 'on', 'at', 'to', 'for', 'with', 'from', 'by', 'about', 'of', 'into', 'under', 'over', 'behind', 'near', 'between', 'through', 'during', 'since', 'until', 'till']
  },
  pronouns: {
    label: 'Pronouns',
    words: ['i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their', 'mine', 'yours', 'hers', 'ours', 'theirs', 'myself', 'yourself', 'himself', 'herself', 'itself', 'ourselves', 'themselves']
  },
  'some-any': { label: 'Some / any / no', words: ['some', 'any', 'no', 'something', 'anything', 'nothing', 'somebody', 'anybody', 'nobody', 'someone', 'anyone'] },
  'much-many': { label: 'Much / many / a lot of', words: ['much', 'many', 'lot', 'few', 'little'] },
  'question-words': { label: 'Question words', words: ['what', 'where', 'when', 'why', 'who', 'how', 'which', 'whose'] },
  conditionals: { label: 'Conditionals', words: ['if', 'unless', 'would', "wouldn't"] },
  passive: { label: 'Passive voice', words: [] },
  'used-to': { label: 'Used to', words: ['used'] },
  'continuous-ing': { label: 'Continuous forms (-ing)', words: [] },
  'past-simple': { label: 'Past Simple', words: [] },
  'third-person-s': { label: 'Present Simple: -s ending', words: [] },
  plural: { label: 'Singular and plural', words: [] },
  'word-order': { label: 'Word order', words: [] },
  vocabulary: { label: 'Vocabulary', words: [] },
  spelling: { label: 'Spelling', words: [] }
}

const WORD_TO_TOPIC = new Map()
for (const [topic, { words }] of Object.entries(TOPICS)) {
  for (const word of words) WORD_TO_TOPIC.set(word, topic)
}

const IRREGULAR_PAST = new Set([
  'went', 'saw', 'came', 'took', 'gave', 'made', 'got', 'knew', 'thought', 'told',
  'said', 'found', 'left', 'felt', 'brought', 'bought', 'began', 'ran', 'wrote', 'read',
  'spoke', 'ate', 'drank', 'slept', 'sat', 'stood', 'met', 'lost', 'put', 'sent',
  'built', 'broke', 'chose', 'drove', 'flew', 'forgot', 'grew', 'heard', 'held', 'kept',
  'led', 'lent', 'lay', 'paid', 'rode', 'rose', 'sang', 'shook', 'shut', 'sold', 'spent',
  'swam', 'taught', 'threw', 'understood', 'woke', 'wore', 'won', 'became', 'fell', 'cut', 'hit'
])

const PARTICIPLES = new Set([
  'gone', 'seen', 'come', 'taken', 'given', 'made', 'got', 'gotten', 'known', 'thought',
  'told', 'said', 'found', 'left', 'felt', 'brought', 'bought', 'begun', 'run', 'written',
  'read', 'spoken', 'eaten', 'drunk', 'slept', 'sat', 'stood', 'met', 'lost', 'put', 'sent',
  'built', 'broken', 'chosen', 'driven', 'flown', 'forgotten', 'grown', 'heard', 'held',
  'kept', 'led', 'lent', 'lain', 'paid', 'ridden', 'risen', 'sung', 'shaken', 'shut', 'sold',
  'spent', 'swum', 'taught', 'thrown', 'understood', 'woken', 'worn', 'won', 'become',
  'fallen', 'cut', 'hit', 'been', 'done'
])

// The answer checker folds "is not" into "isn't" so both spellings pass. For
// analysis we want the opposite: expanded forms, so "am" and "not" are visible.
const EXPANSIONS = [
  [/\bi'm\b/g, 'i am'], [/\bit's\b/g, 'it is'], [/\bthat's\b/g, 'that is'],
  [/\bthere's\b/g, 'there is'], [/\bthey're\b/g, 'they are'], [/\bwe're\b/g, 'we are'],
  [/\byou're\b/g, 'you are'], [/\bhe's\b/g, 'he is'], [/\bshe's\b/g, 'she is'],
  [/\bwon't\b/g, 'will not'], [/\bcan't\b/g, 'can not'], [/\bcannot\b/g, 'can not'],
  [/\b(\w+)n't\b/g, '$1 not'], [/\b(\w+)'ll\b/g, '$1 will'], [/\b(\w+)'ve\b/g, '$1 have'],
  [/\b(\w+)'d\b/g, '$1 would'], [/\b(\w+)'re\b/g, '$1 are']
]

const tokens = (text) => {
  let lowered = String(text ?? '').toLowerCase().replace(/[\u2018\u2019\u02bc]/g, "'")
  for (const [pattern, replacement] of EXPANSIONS) lowered = lowered.replace(pattern, replacement)
  return lowered.replace(/[^a-z0-9'\s-]/g, ' ').split(/\s+/).filter(Boolean)
}

// Base form → past and participle, so "go"/"went" reads as a tense slip, not
// as two unrelated words.
const IRREGULAR_FORMS = {
  go: ['went', 'gone'], see: ['saw', 'seen'], come: ['came', 'come'], take: ['took', 'taken'],
  give: ['gave', 'given'], make: ['made', 'made'], get: ['got', 'got'], know: ['knew', 'known'],
  think: ['thought', 'thought'], tell: ['told', 'told'], say: ['said', 'said'], find: ['found', 'found'],
  leave: ['left', 'left'], feel: ['felt', 'felt'], bring: ['brought', 'brought'], buy: ['bought', 'bought'],
  begin: ['began', 'begun'], run: ['ran', 'run'], write: ['wrote', 'written'], read: ['read', 'read'],
  speak: ['spoke', 'spoken'], eat: ['ate', 'eaten'], drink: ['drank', 'drunk'], sleep: ['slept', 'slept'],
  sit: ['sat', 'sat'], stand: ['stood', 'stood'], meet: ['met', 'met'], lose: ['lost', 'lost'],
  put: ['put', 'put'], send: ['sent', 'sent'], build: ['built', 'built'], break: ['broke', 'broken'],
  choose: ['chose', 'chosen'], drive: ['drove', 'driven'], fly: ['flew', 'flown'], forget: ['forgot', 'forgotten'],
  grow: ['grew', 'grown'], hear: ['heard', 'heard'], hold: ['held', 'held'], keep: ['kept', 'kept'],
  pay: ['paid', 'paid'], ride: ['rode', 'ridden'], sing: ['sang', 'sung'], sell: ['sold', 'sold'],
  spend: ['spent', 'spent'], swim: ['swam', 'swum'], teach: ['taught', 'taught'], throw: ['threw', 'thrown'],
  understand: ['understood', 'understood'], wake: ['woke', 'woken'], wear: ['wore', 'worn'], win: ['won', 'won'],
  become: ['became', 'become'], fall: ['fell', 'fallen'], do: ['did', 'done'], have: ['had', 'had'],
  be: ['was', 'been'], am: ['was', 'been'], is: ['was', 'been'], are: ['were', 'been']
}

const BASE_OF = new Map()
for (const [base, forms] of Object.entries(IRREGULAR_FORMS)) {
  BASE_OF.set(base, base)
  for (const form of forms) BASE_OF.set(form, base)
}

const looksLikePast = (word) => IRREGULAR_PAST.has(word) || (word.endsWith('ed') && word.length > 4)
const isPastOf = (form, base) => (IRREGULAR_FORMS[base] ?? [])[0] === form
const looksLikeParticiple = (word) => PARTICIPLES.has(word) || (word.endsWith('ed') && word.length > 4)
const NOT_ING_FORMS = new Set(['thing', 'bring', 'ring', 'king', 'wing', 'spring', 'string', 'nothing',
  'something', 'anything', 'everything', 'morning', 'evening', 'during', 'ceiling', 'building', 'meeting'])
const looksLikeIng = (word) => word.endsWith('ing') && word.length >= 5 && !NOT_ING_FORMS.has(word)

const stem = (word) => BASE_OF.get(word) ?? word.replace(/(ies|es|s|ed|ing|d)$/, '')

const editDistance = (a, b) => {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const current = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1))
      previous = current
    }
  }
  return row[b.length]
}

// "happend" for "happened" is a slip of the pen, not a tense problem — but
// "work" for "works" is a real form difference and stays out of this.
const isFormPair = (a, b) => {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  return long.startsWith(short) && /^(s|es|ed|d|ing)$/.test(long.slice(short.length))
}
const isMisspelling = (a, b) => {
  if (a === b || isFormPair(a, b) || WORD_TO_TOPIC.has(a) || WORD_TO_TOPIC.has(b)) return false
  const shortest = Math.min(a.length, b.length)
  const allowed = shortest >= 7 ? 2 : shortest >= 4 ? 1 : 0
  return allowed > 0 && editDistance(a, b) <= allowed
}

// --- Tagging an exercise by its reference answer -----------------------------

export function tagAnswer(answer) {
  const words = tokens(answer)
  const found = new Set()

  for (let index = 0; index < words.length; index++) {
    const word = words[index]
    const next = words[index + 1] ?? ''
    const prev = words[index - 1] ?? ''
    const topic = WORD_TO_TOPIC.get(word)

    if (topic === 'question-words') { if (index === 0) found.add(topic) }
    else if (topic && topic !== 'prepositions' && topic !== 'pronouns') found.add(topic)

    if (word === 'there' && ['is', 'are', 'was', 'were', "isn't", "aren't"].includes(next)) {
      found.add('there-is-are')
    }
    if (['have', 'has', "haven't", "hasn't"].includes(word) && (looksLikeParticiple(next) || next === 'been')) {
      found.add('present-perfect')
    }
    if (['had', "hadn't"].includes(word) && looksLikeParticiple(next)) found.add('past-perfect')
    if (['am', 'is', 'are', 'was', 'were', 'been'].includes(word) && looksLikeIng(next)) {
      found.add('continuous-ing')
    }
    if (['am', 'is', 'are', 'was', 'were', 'been', 'be'].includes(word) && looksLikeParticiple(next) && !looksLikeIng(next)) {
      found.add('passive')
    }
    if (word === 'used' && next === 'to') found.add('used-to')
    if (['he', 'she', 'it'].includes(prev) && word.endsWith('s') && !['is', 'was', 'has', 'does'].includes(word) && word.length > 3) {
      found.add('third-person-s')
    }
    if (looksLikePast(word) && !['have', 'has', 'had', 'am', 'is', 'are', 'was', 'were', 'be', 'been'].includes(prev)) {
      found.add('past-simple')
    }
  }

  // Prepositions and pronouns are in nearly every sentence; tag only when the
  // sentence is short enough for them to be the point.
  if (words.length <= 7) {
    for (const word of words) {
      const topic = WORD_TO_TOPIC.get(word)
      if (topic === 'prepositions') found.add('prepositions')
    }
  }

  // Everything in the book drills the verb to be at some point; only count it
  // when it is not already explained by a tense tag.
  if (found.has('there-is-are') || found.has('continuous-ing') || found.has('passive')) {
    found.delete('verb-to-be')
  }

  return [...found]
}

// --- Classifying a mistake ----------------------------------------------------

export function classifyMistake(given, expected) {
  const givenWords = tokens(given)
  const expectedWords = tokens(expected)

  if (!givenWords.length) return { topics: ['vocabulary'], missing: expectedWords, extra: [] }

  const givenSet = new Set(givenWords)
  const expectedSet = new Set(expectedWords)
  const missing = expectedWords.filter((word) => !givenSet.has(word))
  const extra = givenWords.filter((word) => !expectedSet.has(word))

  const topics = new Set()

  // Same words, different order: purely a word-order problem.
  if (!missing.length && !extra.length && givenWords.join(' ') !== expectedWords.join(' ')) {
    return { topics: ['word-order'], missing, extra }
  }

  // Pull misspelled pairs out before grammar analysis so a typo in a verb
  // does not read as a tense mistake.
  const misspelled = new Set()
  for (const lost of missing) {
    const got = extra.find((word) => !misspelled.has(word) && isMisspelling(lost, word))
    if (got) { misspelled.add(lost); misspelled.add(got) }
  }
  if (misspelled.size) {
    topics.add('spelling')
    const rest = (list) => list.filter((word) => !misspelled.has(word))
    const remaining = classifyRest(rest(missing), rest(extra), expectedWords)
    for (const topic of remaining) topics.add(topic)
    if (topics.size > 1) topics.delete('spelling')
    return { topics: [...topics], missing, extra }
  }

  for (const topic of classifyRest(missing, extra, expectedWords)) topics.add(topic)
  return { topics: [...topics], missing, extra }
}

// Grammar classification of the words that differ.
function classifyRest(missing, extra, expectedWords) {
  const topics = new Set()
  if (!missing.length && !extra.length) return []
  const differing = [...missing, ...extra]

  for (const word of differing) {
    const topic = WORD_TO_TOPIC.get(word)
    if (topic) topics.add(topic)
  }

  // Pairs like "book"/"books" or "work"/"works"/"worked"/"working" point at a
  // form problem rather than a vocabulary gap.
  for (const lost of missing) {
    for (const got of extra) {
      if (lost === got || stem(lost) !== stem(got) || stem(lost).length < 2) continue

      if (looksLikeIng(lost) || looksLikeIng(got)) topics.add('continuous-ing')
      else if (looksLikePast(lost) || looksLikePast(got) || isPastOf(lost, got) || isPastOf(got, lost)) topics.add('past-simple')
      else if (lost.endsWith('s') !== got.endsWith('s')) {
        // "he works" vs "he work" is a verb ending; "books" vs "book" a plural.
        const index = expectedWords.indexOf(lost)
        const before = expectedWords[index - 1] ?? ''
        const isVerbEnding = ['he', 'she', 'it'].includes(before) || WORD_TO_TOPIC.get(before) === 'pronouns'
        topics.add(isVerbEnding ? 'third-person-s' : 'plural')
      }
    }
  }

  // A wrong form right after have/has/had is a perfect-tense slip, whatever
  // the form itself looks like ("have saw", "has went").
  for (const lost of missing) {
    const at = expectedWords.indexOf(lost)
    const before = expectedWords[at - 1] ?? ''
    if (['have', 'has'].includes(before) && extra.some((got) => stem(got) === stem(lost))) {
      topics.add('present-perfect')
      topics.delete('past-simple')
    }
    if (before === 'had' && extra.some((got) => stem(got) === stem(lost))) {
      topics.add('past-perfect')
      topics.delete('past-simple')
    }
  }

  // "Have + participle" expected but the student used a plain past form.
  if (missing.some((w) => ['have', 'has'].includes(w)) && expectedWords.some(looksLikeParticiple)) {
    topics.add('present-perfect')
  }
  if (missing.some((w) => w === 'had') && expectedWords.some(looksLikeParticiple)) topics.add('past-perfect')

  // Expected passive ("was built") but the student wrote active.
  const expectsPassive = expectedWords.some(
    (w, i) => ['am', 'is', 'are', 'was', 'were', 'be', 'been'].includes(w) && looksLikeParticiple(expectedWords[i + 1] ?? '')
  )
  if (expectsPassive && missing.some((w) => looksLikeParticiple(w))) topics.add('passive')

  // "There is two books": the verb form is the there-is/are rule at work.
  if (topics.has('verb-to-be') && expectedWords[0] === 'there') {
    topics.delete('verb-to-be')
    topics.add('there-is-are')
  }

  if (!topics.size) topics.add('vocabulary')

  // Prepositions and pronouns are a weak signal: drop them if something more
  // specific was found, otherwise a missing "the" would always read as both.
  if (topics.size > 1) {
    topics.delete('pronouns')
    if (topics.size > 1) topics.delete('vocabulary')
  }

  return [...topics]
}

export const topicLabel = (topic) => TOPICS[topic]?.label ?? topic
