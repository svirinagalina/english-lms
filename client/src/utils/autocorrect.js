// Word-style autocorrect: runs on the word just finished when a space,
// punctuation mark or Enter is typed. Returns the fixed word, or null.

const TYPOS = {
  teh: 'the', hte: 'the', taht: 'that', thta: 'that', adn: 'and', nad: 'and', waht: 'what', wich: 'which',
  whcih: 'which', becuase: 'because', becasue: 'because', beacuse: 'because', recieve: 'receive',
  recieved: 'received', beleive: 'believe', belive: 'believe', freind: 'friend', freinds: 'friends',
  wierd: 'weird', thier: 'their', theyre: "they're", seperate: 'separate', definately: 'definitely',
  definatly: 'definitely', occured: 'occurred', occurence: 'occurrence', untill: 'until', tommorow: 'tomorrow',
  tomorow: 'tomorrow', goverment: 'government', enviroment: 'environment', neccessary: 'necessary',
  necesary: 'necessary', accomodation: 'accommodation', acommodation: 'accommodation', adress: 'address',
  begining: 'beginning', beggining: 'beginning', buisness: 'business', calender: 'calendar',
  collegue: 'colleague', comming: 'coming', commitee: 'committee', completly: 'completely',
  concious: 'conscious', embarass: 'embarrass', existance: 'existence', finaly: 'finally',
  foriegn: 'foreign', grammer: 'grammar', happend: 'happened', immediatly: 'immediately',
  independant: 'independent', knowlege: 'knowledge', lenght: 'length', libary: 'library',
  noticable: 'noticeable', occassion: 'occasion', persue: 'pursue', posession: 'possession',
  prefered: 'preferred', probaly: 'probably', publically: 'publicly', realy: 'really', reccomend: 'recommend',
  recomend: 'recommend', refered: 'referred', relevent: 'relevant', responsability: 'responsibility',
  succesful: 'successful', successfull: 'successful', suprise: 'surprise', truely: 'truly',
  wether: 'whether', writting: 'writing', alot: 'a lot', infomation: 'information',
  percentge: 'percentage', porportion: 'proportion', signficant: 'significant', significently: 'significantly',
  dont: "don't", doesnt: "doesn't", didnt: "didn't", cant: "can't", wont: "won't", isnt: "isn't",
  arent: "aren't", wasnt: "wasn't", werent: "weren't", havent: "haven't", hasnt: "hasn't", hadnt: "hadn't",
  couldnt: "couldn't", shouldnt: "shouldn't", wouldnt: "wouldn't", im: "I'm", ive: "I've", youre: "you're",
  thats: "that's", theres: "there's", whats: "what's"
}

const PRONOUN_I = { i: 'I', "i'm": "I'm", "i've": "I've", "i'll": "I'll", "i'd": "I'd" }
const ABBREVIATIONS = /(?:^|\s)(?:e\.g|i\.e|etc|vs|approx|Mr|Mrs|Ms|Dr|p|pp|no|fig)\.$/i

const capitalise = (word) => word.charAt(0).toUpperCase() + word.slice(1)

// `before` is the text in front of the word (same line or earlier).
export function autocorrectWord(word, before) {
  const lower = word.toLowerCase()
  let fixed = word

  if (PRONOUN_I[lower] && word === lower) fixed = PRONOUN_I[lower]
  else if (TYPOS[lower]) {
    const typo = TYPOS[lower]
    fixed = word[0] === word[0].toUpperCase() && typo[0] !== 'I' ? capitalise(typo) : typo
  } else if (/^[A-Z]{2}[a-z]{2,}$/.test(word)) {
    fixed = word[0] + word.slice(1).toLowerCase() // THis → This
  }

  // A sentence starts after . ! ? or at the start of a line.
  const trimmed = before.replace(/[ \t ]+$/, '')
  const sentenceStart = trimmed === '' || trimmed.endsWith('\n') ||
    (trimmed.length < before.length && /[.!?]["')\]]?$/.test(trimmed) && !ABBREVIATIONS.test(trimmed))
  if (sentenceStart && /^[a-z]/.test(fixed)) fixed = capitalise(fixed)

  return fixed === word ? null : fixed
}
