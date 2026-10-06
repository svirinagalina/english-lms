// The placement test used on a trial lesson: 35 sentences to translate,
// each tied to a grammar point, a CEFR level and the textbook chapters
// that teach it. The teacher marks each one after the lesson.

export const LEVELS = ['A1', 'A2', 'B1', 'B2']

// Grammar topics the teacher can tick in the trial report form, by level.
export const GRAMMAR_TOPICS = {
  A1: ['to be', 'Present Simple', 'Вопросы и отрицания в Present Simple', 'there is / there are', 'Артикли a / an / the', 'Притяжательные местоимения', 'can / can\'t', 'Present Continuous', 'Множественное число'],
  A2: ['Past Simple', 'Неправильные глаголы', 'going to', 'will', 'Present Perfect', 'Сравнение прилагательных', 'some / any / much / many', 'have to / must / should', 'Present Continuous для будущего', 'Предлоги времени и места'],
  B1: ['Past Continuous', 'Present Perfect vs Past Simple', 'Present Perfect Continuous', 'Past Perfect', 'First Conditional', 'Second Conditional', 'used to / be used to', 'Пассивный залог', 'Герундий и инфинитив', 'Relative clauses', 'Фразовые глаголы', 'Косвенная речь'],
  B2: ['Third и смешанные Conditionals', 'Future Continuous / Future Perfect', 'Модальные глаголы в прошедшем (must / could / should have)', 'wish / if only', 'Инверсия', 'have something done', 'Сложные формы пассива']
}

export const TEST_ITEMS = [
  { n: 1, ru: 'Во сколько открывается банк?', en: 'What time does the bank open?', topic: 'Present Simple: вопросы', level: 'A1', units: [3, 11] },
  { n: 2, ru: 'Она работает с пяти до шести.', en: 'She works from five to six.', topic: 'Present Simple: 3-е лицо', level: 'A1', units: [3] },
  { n: 3, ru: 'Я только что пообедал.', en: "I've just had lunch.", topic: 'Present Perfect: just', level: 'A2', units: [9, 13] },
  { n: 4, ru: 'Подожди меня, я не взял деньги.', en: "Wait for me, I haven't taken any money.", topic: 'Present Perfect: результат', level: 'A2', units: [9] },
  { n: 5, ru: 'Я сейчас работаю над важным проектом.', en: "I'm working on an important project now.", topic: 'Present Continuous', level: 'A1', units: [5, 11] },
  { n: 6, ru: 'Я был в Лондоне два раза.', en: "I've been to London twice.", topic: 'Present Perfect: опыт', level: 'A2', units: [9, 13] },
  { n: 7, ru: 'Я ездил в Париж в прошлом году.', en: 'I went to Paris last year.', topic: 'Past Simple', level: 'A1', units: [6, 13] },
  { n: 8, ru: 'Вчера я весь вечер работал.', en: 'I was working all evening yesterday.', topic: 'Past Continuous', level: 'A2', units: [7, 12] },
  { n: 9, ru: 'Когда он позвонил, я готовила ужин.', en: 'When he called, I was cooking dinner.', topic: 'Past Continuous vs Past Simple', level: 'A2', units: [12] },
  { n: 10, ru: 'В детстве я всегда играл в этом дворе.', en: 'I used to play in this yard when I was a child.', topic: 'used to', level: 'B1', units: [29] },
  { n: 11, ru: 'Когда я приехал в Англию, мне было непривычно ездить с правосторонним движением, но потом я привык.', en: "When I came to England, I wasn't used to driving on the left, but then I got used to it.", topic: 'be used to / get used to', level: 'B1', units: [29] },
  { n: 12, ru: 'Я жду тебя уже 20 минут.', en: "I've been waiting for you for 20 minutes.", topic: 'Present Perfect Continuous', level: 'B1', units: [15] },
  { n: 13, ru: 'Завтра в два я встречаюсь с партнёрами.', en: "I'm meeting my partners at two tomorrow.", topic: 'Present Continuous для будущего', level: 'A2', units: [19] },
  { n: 14, ru: 'Ты будешь завтра в офисе?', en: 'Will you be in the office tomorrow?', topic: 'Future Simple', level: 'A1', units: [8, 19] },
  { n: 15, ru: 'Я собираюсь продать машину.', en: "I'm going to sell my car.", topic: 'going to', level: 'A2', units: [19] },
  { n: 16, ru: 'Я закончу эту работу завтра к шести.', en: "I'll have finished this work by six tomorrow.", topic: 'Future Perfect', level: 'B2', units: [19] },
  { n: 17, ru: 'Когда мы приехали в кинотеатр, фильм уже начался.', en: 'When we arrived at the cinema, the film had already started.', topic: 'Past Perfect', level: 'B1', units: [16] },
  { n: 18, ru: 'Если погода будет хорошая, мы пойдём на прогулку.', en: "If the weather is good, we'll go for a walk.", topic: 'First Conditional', level: 'A2', units: [22] },
  { n: 19, ru: 'Я должен приходить на работу к 10.', en: 'I have to be at work by 10.', topic: 'have to', level: 'A2', units: [10, 25] },
  { n: 20, ru: 'Ты должен посмотреть этот фильм, он тебе обязательно понравится.', en: "You must see this film, you'll definitely like it.", topic: 'must / should: совет', level: 'A2', units: [10, 26] },
  { n: 21, ru: 'Должно быть, я оставил перчатки в такси.', en: 'I must have left my gloves in the taxi.', topic: 'must have + V3', level: 'B2', units: [28] },
  { n: 22, ru: 'Почему ты вчера остался дома? Ты мог бы пойти с нами.', en: 'Why did you stay at home yesterday? You could have come with us.', topic: 'could have + V3', level: 'B2', units: [23, 28] },
  { n: 23, ru: 'Я бросил курить в прошлом году.', en: 'I gave up smoking last year.', topic: 'герундий после глаголов', level: 'B1', units: [20, 21] },
  { n: 24, ru: 'Он отрицал, что украл деньги.', en: 'He denied stealing the money.', topic: 'deny + герундий', level: 'B2', units: [21] },
  { n: 25, ru: 'Как имя того человека, с которым я тебя видел вчера?', en: "What's the name of the man I saw you with yesterday?", topic: 'Relative clauses', level: 'B1', units: [34] },
  { n: 26, ru: 'Если бы я выиграл деньги в лотерею, я бы потратил их на благотворительность.', en: 'If I won the lottery, I would spend the money on charity.', topic: 'Second Conditional', level: 'B1', units: [22] },
  { n: 27, ru: 'Если бы я знал, что ты был в больнице, я бы тебя навестил.', en: "If I had known you were in hospital, I would have visited you.", topic: 'Third Conditional', level: 'B2', units: [22] },
  { n: 28, ru: 'Каждому следует знать хотя бы один иностранный язык.', en: 'Everyone should know at least one foreign language.', topic: 'should', level: 'A2', units: [26] },
  { n: 29, ru: 'У нас закончился бензин.', en: "We've run out of petrol.", topic: 'фразовые глаголы: run out of', level: 'B1', units: [9] },
  { n: 30, ru: 'Зачем ты надел пальто? Здесь жарко.', en: "Why have you put on your coat? It's hot here.", topic: 'Present Perfect + put on', level: 'A2', units: [9] },
  { n: 31, ru: 'Я не собираюсь терпеть такое поведение.', en: "I'm not going to put up with such behaviour.", topic: 'фразовые глаголы: put up with', level: 'B2', units: [19] },
  { n: 32, ru: 'Самолёт только что взлетел.', en: 'The plane has just taken off.', topic: 'Present Perfect + take off', level: 'A2', units: [9] },
  { n: 33, ru: 'Они хорошо ладят между собой.', en: 'They get on well with each other.', topic: 'фразовые глаголы: get on with', level: 'B1', units: [3] },
  { n: 34, ru: 'Я не знаю этого слова, я посмотрю в словаре.', en: "I don't know this word, I'll look it up in the dictionary.", topic: 'will: спонтанное решение + look up', level: 'A2', units: [8, 19] },
  { n: 35, ru: 'Почему он такой грустный? Он поссорился с лучшим другом.', en: "Why is he so sad? He's fallen out with his best friend.", topic: 'Present Perfect + fall out with', level: 'B1', units: [9] }
]

// answers: { [n]: 'ok' | 'partly' | 'no' }. Score per level; the level is
// the highest one passed (≥ 70%), with a "+" when the next one is half there.
export function estimateLevel(answers) {
  const perLevel = {}
  for (const level of LEVELS) perLevel[level] = { total: 0, score: 0, answered: 0 }
  for (const item of TEST_ITEMS) {
    const a = answers?.[item.n]
    const bucket = perLevel[item.level]
    bucket.total++
    if (!a) continue
    bucket.answered++
    bucket.score += a === 'ok' ? 1 : a === 'partly' ? 0.5 : 0
  }
  const rates = {}
  for (const level of LEVELS) {
    const b = perLevel[level]
    rates[level] = b.answered ? Math.round((b.score / b.answered) * 100) : null
  }
  let estimated = 'A1'
  let plus = false
  for (let i = 0; i < LEVELS.length; i++) {
    const rate = rates[LEVELS[i]]
    if (rate == null) break
    if (rate >= 70) { estimated = LEVELS[i]; plus = false; continue }
    if (rate >= 40) plus = true
    break
  }
  const answered = Object.values(perLevel).reduce((n, b) => n + b.answered, 0)
  return { estimated, plus, rates, answered, total: TEST_ITEMS.length }
}
