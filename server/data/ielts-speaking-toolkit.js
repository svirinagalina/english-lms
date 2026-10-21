// IELTS Speaking Toolkit: extra Speaking lessons — useful phrases and topic
// vocabulary — placed right after the course's Speaking lessons by
// scripts/add-ielts-speaking-toolkit.js (Galina, 2026-10-21).
//
// The topic areas follow the themes that came up in recent exams (Part 1
// topics and Part 2 cue cards of Jan–Apr 2022, as listed in a commercial
// question collection), but every phrase, word list, model answer, question
// wording and exercise here is written for this platform. Nothing is copied
// from that book: its answers and vocabulary are its authors' and it forbids
// any reproduction.
//
// Payload shapes are the ones Course.jsx renders (see ielts-practice-lab.js):
// html {title, html} (<b>, <i>, \n only), choice, drag-words, groups, tts.

function shuffle(list, seed) {
  const out = [...list]
  let s = seed
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280
    const j = Math.floor((s / 233280) * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

const html = (title, text) => ({ type: 'html', payload: { title, html: text } })
const tts = (title, script) => ({ type: 'tts', payload: { title, script } })
const choice = (title, questions) => ({ type: 'choice', payload: { title, questions } })
const q = (question, options, answer) => {
  const i = options.indexOf(answer)
  if (i < 0) throw new Error(`Answer "${answer}" is not among the options of "${question}"`)
  return { question, options, correct: [i] }
}

function dragWords(title, text, distractors = [], seed = 7) {
  const parts = []
  const answers = []
  text.split(/(\[\[[^\]]+\]\])/).forEach((piece) => {
    const m = piece.match(/^\[\[(.+)\]\]$/)
    if (m) { parts.push({ gap: answers.length }); answers.push(m[1]) } else if (piece) parts.push(piece)
  })
  return { type: 'drag-words', payload: { title, bank: shuffle([...answers, ...distractors], seed), parts, answers } }
}

function groups(title, columns, seed = 11) {
  const bank = shuffle(Object.values(columns).flat(), seed)
  return { type: 'groups', payload: { title, bank, groups: Object.entries(columns).map(([name, words]) => ({ name, words })) } }
}

// A topic word list: [english, russian, example] rows under headings.
function wordList(title, sections) {
  const body = Object.entries(sections).map(([heading, rows]) =>
    `<b>${heading}</b>\n${rows.map(([en, ru, ex]) => `• <b>${en}</b> — ${ru}${ex ? `\n   <i>${ex}</i>` : ''}`).join('\n')}`
  ).join('\n\n')
  return html(title, body)
}

// A cue card in the exam's layout.
const cueCard = (topic, points, explain) =>
  `<b>${topic}</b>\nYou should say:\n${points.map((p) => `• ${p}`).join('\n')}\nand ${explain}`

export const SPEAKING_TOOLKIT = [
  // ------------------------------------------------------------------ 1
  {
    title: 'Speaking Toolkit 1. Useful phrases for Parts 1, 2 and 3',
    blocks: [
      html('Зачем нужны фразы', `Фразы-связки не добавляют балл сами по себе, но помогают говорить <b>без пауз</b> (Fluency and Coherence) и звучать естественно. Правило: выучите 2–3 фразы для каждой функции и используйте их по-разному, а не одну и ту же каждый раз — экзаменатор замечает заученные «шаблоны».

<b>Part 1</b> — короткие ответы на 2–4 предложения: ответ + причина + маленький пример.
<b>Part 2</b> — монолог 1–2 минуты по карточке.
<b>Part 3</b> — обсуждение: мнение, сравнение, прогноз, причины и последствия.`),
      html('Phrases by function', `<b>Giving an opinion</b>
• Personally, I'd say that…
• As far as I'm concerned, …
• If you ask me, …
• I'm fairly convinced that…

<b>Buying time (when you need a second)</b>
• That's not something I've thought about much, but…
• Let me see…
• Hmm, that's a tricky one.

<b>Giving reasons and examples</b>
• The main reason is that…
• This is partly because…
• For instance, …  /  A case in point is…
• Take my cousin, for example. She…

<b>Contrasting</b>
• Having said that, …
• On the other hand, …
• That said, I can see why some people…

<b>Speculating about the future (Part 3)</b>
• I'd imagine that…
• It's quite likely that…
• There's a good chance that…
• I doubt that… will ever…

<b>When you don't know a word</b>
• I'm not sure what it's called in English, but it's a kind of…
• It's the thing you use to…
• What I mean is…

<b>Finishing Part 2</b>
• So, all in all, that's why…
• Looking back, I'd say…
• That's pretty much why it means so much to me.`),
      groups('Sort the phrases by what they do.', {
        'Opinion': ['As far as I’m concerned,', 'If you ask me,', 'Personally, I’d say that'],
        'Contrast': ['Having said that,', 'That said,', 'On the other hand,'],
        'Speculating': ['I’d imagine that', 'There’s a good chance that', 'It’s quite likely that'],
        'Example': ['A case in point is', 'Take my cousin, for example.', 'For instance,'],
      }, 3),
      choice('Part 1. Which answer is the best length and style?', [
        q('Examiner: Do you like getting up early?', [
          'No.',
          'Not really, to be honest. I’m much more of a night owl, so I find it hard to concentrate before nine. Having said that, on holiday I sometimes get up early to see the sunrise.',
          'Getting up early is a habit that has been discussed by scientists for many years, and there are many advantages and disadvantages which I would like to explain in detail. Firstly…',
        ], 'Not really, to be honest. I’m much more of a night owl, so I find it hard to concentrate before nine. Having said that, on holiday I sometimes get up early to see the sunrise.'),
        q('Examiner: Do you often wear sports shoes?', [
          'Yes, I do. I wear sports shoes. I like sports shoes because sports shoes are comfortable.',
          'Pretty much every day, actually. I walk a lot around the city, so comfort matters more to me than style. I only switch to formal shoes for work meetings.',
          'Sports shoes.',
        ], 'Pretty much every day, actually. I walk a lot around the city, so comfort matters more to me than style. I only switch to formal shoes for work meetings.'),
      ]),
      dragWords('Complete the Part 3 answer with the phrases.',
        `Examiner: Will people still read paper books in the future?\n[[I’d imagine that]] paper books will survive, [[partly because]] many people enjoy the feel of a real book and want a break from screens. [[Having said that,]] e-books are cheaper and easier to carry, so [[there’s a good chance that]] students will mostly read on tablets. [[All in all,]] I think both formats will exist side by side.`,
        ['For instance,', 'Let me see…'], 19),
      html('Avoid these', `• <b>«I think» в каждом предложении.</b> Замените: <i>I'd say, I believe, In my view, I reckon</i> (разговорное).
• <b>Заученное начало</b> вроде «That's a very interesting question» на каждый вопрос.
• <b>Слишком короткие ответы</b> «Yes, I do.» — всегда добавляйте причину.
• <b>Слишком длинные ответы в Part 1</b> — экзаменатор прервёт вас, это нормально, но лучше 2–4 предложения.
• <b>Пересказ вопроса целиком.</b> Перефразируйте: <i>Do you like cooking?</i> → <i>I'm quite keen on making my own meals…</i>`),
    ],
  },

  // ------------------------------------------------------------------ 2
  {
    title: 'Speaking Toolkit 2. Part 1 topics: home, routine and personal things',
    blocks: [
      html('Topics in this lesson', `Темы Part 1, которые часто встречаются: <b>where you live, decorating your home, housework, names, shoes, a wallet, rest and relaxing, holidays, getting lost, weddings, primary school</b>.

Part 1 — это вопросы о вас. Ответ строится по формуле: <b>прямой ответ → причина → деталь/пример</b>. Не нужно говорить «правду» — нужно говорить свободно.`),
      wordList('Topic vocabulary', {
        'Home and decoration': [
          ['a cosy flat', 'уютная квартира', 'It’s a cosy one-bedroom flat on the fifth floor.'],
          ['to redecorate', 'сделать ремонт (косметический)', 'We redecorated the living room last spring.'],
          ['a minimalist style', 'минималистичный стиль', 'I prefer a minimalist style — white walls and very little furniture.'],
          ['to put up shelves / pictures', 'повесить полки / картины', 'I put up a few shelves for my books.'],
          ['a commute', 'дорога на работу', 'The only downside is a long commute.'],
        ],
        'Housework': [
          ['to do the chores', 'делать домашние дела', 'We share the chores in our family.'],
          ['to do the washing-up', 'мыть посуду', 'I don’t mind doing the washing-up.'],
          ['to tidy up / to declutter', 'прибраться / избавиться от лишнего', 'Every spring I declutter my wardrobe.'],
          ['a time-consuming task', 'занятие, отнимающее много времени', 'Ironing is the most time-consuming task.'],
        ],
        'Personal things': [
          ['to go cashless', 'перестать пользоваться наличными', 'I’ve almost gone cashless, so my wallet is nearly empty.'],
          ['to break in new shoes', 'разнашивать новую обувь', 'It took me a week to break in my new boots.'],
          ['practical rather than fashionable', 'практичный, а не модный', 'I choose shoes that are practical rather than fashionable.'],
          ['to be named after', 'быть названным в честь', 'I was named after my grandmother.'],
        ],
        'Rest and holidays': [
          ['to recharge my batteries', 'восстановить силы', 'A weekend in the countryside helps me recharge my batteries.'],
          ['to switch off', 'отключиться, расслабиться', 'I find it hard to switch off from work.'],
          ['a staycation', 'отпуск без поездки', 'Last year we had a staycation and explored our own city.'],
          ['to have a lie-in', 'поспать подольше', 'On Sundays I always have a lie-in.'],
        ],
      }),
      dragWords('Complete the answers.',
        `Examiner: How do you usually relax?\nI usually [[switch off]] by going for a long walk — it really helps me [[recharge my batteries]].\n\nExaminer: Do you like doing housework?\nNot much, to be honest. Ironing is such a [[time-consuming]] task. But I don’t mind doing the [[washing-up]] while listening to podcasts.\n\nExaminer: Do you carry a wallet?\nHardly ever now. I’ve almost [[gone cashless]], so everything is on my phone.`,
        ['a lie-in', 'redecorated'], 13),
      html('Practise: Part 1 questions', `Ответьте вслух на каждый вопрос за 15–25 секунд. Запишите себя.

<b>Your home</b>
• Do you live in a house or a flat?
• What would you change about your home if you could?
• Have you ever redecorated a room? What did you do?

<b>Housework</b>
• Which household chore do you dislike the most?
• Did you help with housework when you were a child?

<b>Names</b>
• Does your name have a special meaning?
• Would you like to change your name?

<b>Shoes and wallets</b>
• What kind of shoes do you usually wear?
• Do you still use cash, or do you pay with your phone?

<b>Rest and holidays</b>
• How much rest do you get on a typical weekday?
• Do you prefer active holidays or relaxing ones?

<b>Getting lost</b>
• Have you ever got lost in a new place? What happened?
• Do you use maps on your phone or ask people for directions?`),
      tts('Listen: a model Part 1 answer', `Do you prefer active holidays or relaxing ones? Honestly, it depends on how tired I am. After a busy term I just want to lie on a beach and switch off completely. But usually I get bored after two days, so most of the time I go for something more active, like hiking in the mountains. It helps me recharge my batteries much better than doing nothing.`),
    ],
  },

  // ------------------------------------------------------------------ 3
  {
    title: 'Speaking Toolkit 3. Describing people: character, admiration and relationships',
    blocks: [
      html('Cue cards on people', `В Part 2 часто просят описать человека: <b>a family member you are proud of, a businessperson you admire, a creative person, a very open person, an intelligent person, an old friend you got back in touch with, two friends who had an argument, a person who solved a problem in a smart way, a family you like that is not your own</b>.

Схема для любой «человеческой» карточки:
1. Кто это и как вы познакомились (1–2 фразы).
2. Внешность — максимум одна фраза, если не спрашивают.
3. <b>Характер</b> — 2–3 черты, каждая с примером.
4. Конкретная история (Past Simple).
5. Почему этот человек важен/восхищает вас.`),
      wordList('Topic vocabulary: character', {
        'Positive traits': [
          ['open-minded', 'непредвзятый, открытый новому', 'She’s very open-minded and never judges people.'],
          ['down-to-earth', 'простой, приземлённый', 'Despite his success, he’s really down-to-earth.'],
          ['quick-witted', 'сообразительный, находчивый', 'He’s quick-witted and always finds a solution.'],
          ['resourceful', 'изобретательный', 'She’s resourceful — she can fix anything with what she has.'],
          ['determined', 'целеустремлённый', 'He was determined to start his own business.'],
          ['approachable', 'доступный, к нему легко обратиться', 'Our manager is approachable and easy to talk to.'],
          ['to have a great sense of humour', 'иметь отличное чувство юмора', ''],
        ],
        'Admiration': [
          ['to look up to someone', 'восхищаться, брать пример', 'I’ve always looked up to my older sister.'],
          ['a role model', 'пример для подражания', 'My grandfather is a real role model for me.'],
          ['to be proud of someone', 'гордиться кем-то', 'I felt really proud of my brother when he graduated.'],
          ['to make a name for oneself', 'сделать себе имя', 'She made a name for herself as a designer.'],
          ['to think outside the box', 'мыслить нестандартно', 'He solved it by thinking outside the box.'],
        ],
        'Relationships': [
          ['to get on well with', 'ладить с', 'I get on really well with my cousin.'],
          ['to lose touch with', 'потерять связь', 'We lost touch after school.'],
          ['to get back in touch', 'снова связаться', 'We got back in touch through social media.'],
          ['to fall out (with)', 'поссориться', 'Two of my friends fell out over money.'],
          ['to make up', 'помириться', 'Luckily, they made up a week later.'],
          ['close-knit (family)', 'дружная (семья)', 'They’re a close-knit family who eat together every night.'],
        ],
      }),
      groups('Positive or negative?', {
        'Positive': ['down-to-earth', 'approachable', 'resourceful', 'open-minded', 'quick-witted'],
        'Negative': ['stubborn', 'self-centred', 'narrow-minded', 'bossy', 'moody'],
      }, 17),
      dragWords('Complete the story.',
        `Two of my close friends once [[fell out]] over a trip they were planning. One wanted to save money, and the other refused to compromise because she can be quite [[stubborn]]. They didn’t speak for a month, but eventually they [[made up]], and now they [[get on well]] again. I think it taught them both to be more [[open-minded]].`,
        ['looked up to', 'lost touch'], 29),
      html('Cue cards', `${cueCard('Describe a person you know who is very open.', ['who this person is', 'how you know them', 'what they are open about'], 'explain how you feel about this person.')}

${cueCard('Describe an old friend you got back in touch with.', ['who this friend is', 'how you lost touch', 'how you got in contact again'], 'explain how you felt about it.')}

${cueCard('Describe a person who solved a problem in a clever way.', ['who this person is', 'what the problem was', 'how they solved it'], 'explain why you think the solution was clever.')}`),
      tts('Listen: a model Part 2 answer', `I'd like to talk about my aunt Marina, who I've always looked up to. She's one of the most open people I know. She'll happily talk about her mistakes and what she learned from them, which makes her very approachable. A few years ago she lost her job at fifty, and instead of hiding it, she told everyone and asked for advice. Within six months she had retrained as a web designer and made a name for herself in our town. What I admire most is that she's so down-to-earth: she never pretends to be perfect. Looking back, I'd say she taught me that being honest about difficulties is a strength, not a weakness.`),
      html('Part 3: discussion questions', `• What qualities make someone a good leader?
• Do you think people today are more or less open about their feelings than in the past?
• Why do some friendships last for many years while others don't?
• Is it better to have a few close friends or many acquaintances?
• Should successful businesspeople give part of their wealth to society?
• How has social media changed the way people stay in touch?`),
    ],
  },

  // ------------------------------------------------------------------ 4
  {
    title: 'Speaking Toolkit 4. Telling a story: experiences, feelings and events',
    blocks: [
      html('Cue cards about experiences', `Многие карточки — это рассказ о случае: <b>a difficult thing you did, a time you were ill, a promise you made, good news you received, a time you felt bored, a puzzle you solved, a time you were not allowed to use your phone, your first day at school, a time you felt proud, children behaving badly in public</b>.

Для рассказа нужны:
• <b>Время:</b> Past Simple (что произошло), Past Continuous (фон: <i>it was raining, I was waiting</i>), Past Perfect (что было раньше: <i>I had never done it before</i>).
• <b>Связки времени:</b> <i>at first, then, after a while, eventually, in the end</i>.
• <b>Чувства:</b> не только happy/sad — см. словарь ниже.`),
      wordList('Topic vocabulary: feelings and events', {
        'Feelings': [
          ['thrilled / over the moon', 'в восторге', 'I was over the moon when I got the results.'],
          ['relieved', 'с облегчением', 'I was so relieved when the exam was over.'],
          ['nervous / on edge', 'нервный, на взводе', 'I was on edge the whole morning.'],
          ['frustrated', 'раздосадованный', 'I got frustrated because nothing worked.'],
          ['bored stiff', 'смертельно скучающий', 'I was bored stiff during the four-hour flight delay.'],
          ['embarrassed', 'смущённый, неловко', 'I felt embarrassed when the children started shouting.'],
          ['a sense of achievement', 'чувство достижения', 'Finishing the marathon gave me a real sense of achievement.'],
        ],
        'Difficulties and illness': [
          ['to come down with (a cold)', 'заболеть (простудой)', 'I came down with flu the day before my holiday.'],
          ['to be under the weather', 'неважно себя чувствовать', 'I was a bit under the weather all week.'],
          ['to recover / to get over', 'поправиться', 'It took me ten days to get over it.'],
          ['to step out of my comfort zone', 'выйти из зоны комфорта', 'Giving a speech meant stepping out of my comfort zone.'],
          ['to give it a go', 'попробовать', 'I was scared, but I decided to give it a go.'],
        ],
        'Promises and news': [
          ['to keep / break a promise', 'сдержать / нарушить обещание', 'I promised to call every week, and I kept my promise.'],
          ['to let someone down', 'подвести кого-то', 'I didn’t want to let my friend down.'],
          ['to break the news', 'сообщить новость', 'My sister broke the news over dinner.'],
          ['it came as a surprise', 'это было неожиданностью', 'The job offer came as a complete surprise.'],
        ],
      }),
      choice('Choose the correct tense.', [
        q('When I arrived at the airport, the flight ____ already ____.', ['has / left', 'had / left', 'was / leaving'], 'had / left'),
        q('I ____ for the bus when my phone rang with the good news.', ['waited', 'was waiting', 'have waited'], 'was waiting'),
        q('It was the first time I ____ a speech in public.', ['had ever given', 'ever gave', 'have ever given'], 'had ever given'),
        q('I ____ this promise since I was sixteen.', ['kept', 'have kept', 'was keeping'], 'have kept'),
        q('In the end, I ____ the puzzle in about two hours.', ['solved', 'had solved', 'was solving'], 'solved'),
      ]),
      dragWords('Complete the story with time linkers and feelings.',
        `Last winter I [[came down with]] a bad flu just before an important exam. [[At first]] I thought it was a cold, but [[after a while]] I could barely get out of bed. I was really [[frustrated]] because I had prepared for months. [[Eventually]] my teacher let me take the exam a week later, and I was so [[relieved]].`,
        ['over the moon', 'in the end'], 37),
      html('Cue cards', `${cueCard('Describe a difficult thing you did.', ['what it was', 'when you did it', 'why it was difficult'], 'explain how you felt after doing it.')}

${cueCard('Describe a time when you received good news.', ['what the news was', 'when and how you received it', 'who you shared it with'], 'explain why it was good news for you.')}

${cueCard('Describe an occasion when you were not allowed to use your mobile phone.', ['when and where it was', 'why you couldn’t use it', 'what you did instead'], 'explain how you felt about it.')}`),
      tts('Listen: a model Part 2 answer', `I'm going to talk about the time I gave my first presentation in English at work. It was about two years ago, and I was really on edge because I had never spoken in front of more than five people. At first my hands were shaking, and I forgot one of my main points. But after a while I relaxed, especially when a colleague nodded and smiled at me. In the end the presentation went better than I expected, and my manager even asked me to give it again to another team. It was difficult because it meant stepping out of my comfort zone, but it gave me a real sense of achievement, and now I actually volunteer to present.`),
      html('Part 3: discussion questions', `• Why do some people find it hard to keep promises?
• Is it good for children to experience difficulties? Why?
• Should schools ban mobile phones completely?
• Why do people today seem to get bored more easily?
• How should parents react when their children behave badly in public?`),
    ],
  },

  // ------------------------------------------------------------------ 5
  {
    title: 'Speaking Toolkit 5. Media, technology and culture',
    blocks: [
      html('Topics in this lesson', `Part 1: <b>TV programmes, advertisements, celebrities, the sky and stars</b>.
Part 2: <b>a favourite film, a film that made you laugh, an exciting book, something interesting you saw on social media, a useful app, a piece of international news, a photo you remember, a line from a song or poem, an art exhibition, an event where you didn't like the music</b>.

Совет: для фильмов и книг не пересказывайте весь сюжет — 2–3 фразы о сюжете, остальное — <b>почему</b> он вам понравился.`),
      wordList('Topic vocabulary', {
        'Films and books': [
          ['a page-turner', 'книга, от которой не оторваться', 'It was a real page-turner — I finished it in two days.'],
          ['the plot / the storyline', 'сюжет', 'The plot is quite simple, but the characters are brilliant.'],
          ['to be set in', 'действие происходит в', 'The film is set in 1960s London.'],
          ['a plot twist', 'неожиданный поворот', 'There’s a huge plot twist at the end.'],
          ['hilarious / laugh-out-loud', 'уморительный', 'Some scenes are absolutely hilarious.'],
          ['to be based on a true story', 'основан на реальных событиях', ''],
        ],
        'Social media and apps': [
          ['to go viral', 'стать вирусным', 'The video went viral overnight.'],
          ['to scroll through', 'листать ленту', 'I was scrolling through my feed when I saw it.'],
          ['user-friendly', 'удобный', 'The app is really user-friendly.'],
          ['to keep track of', 'отслеживать', 'I use it to keep track of my spending.'],
          ['screen time', 'время перед экраном', 'I’m trying to cut down on my screen time.'],
        ],
        'News, art and music': [
          ['to make the headlines', 'попасть в заголовки', 'The story made the headlines all over the world.'],
          ['to keep up with the news', 'следить за новостями', 'I keep up with the news through a podcast.'],
          ['an exhibition / a gallery', 'выставка / галерея', 'The exhibition featured local artists.'],
          ['thought-provoking', 'заставляющий задуматься', 'Some of the paintings were really thought-provoking.'],
          ['catchy', 'привязчивый (о мелодии)', 'The chorus is so catchy.'],
          ['too loud / not my cup of tea', 'слишком громко / не в моём вкусе', 'The music at the party wasn’t really my cup of tea.'],
        ],
      }),
      groups('Which topic does each phrase belong to?', {
        'Books and films': ['a page-turner', 'a plot twist', 'to be set in'],
        'Social media and apps': ['to go viral', 'user-friendly', 'screen time'],
        'News': ['to make the headlines', 'to keep up with the news'],
        'Art and music': ['thought-provoking', 'catchy', 'an exhibition'],
      }, 23),
      dragWords('Complete the Part 2 answer.',
        `I’d like to describe a video I saw while I was [[scrolling through]] my feed last month. It showed an elderly man teaching himself to play the piano, and it [[went viral]] within a couple of days. What I liked is that it was really [[thought-provoking]] — it made me realise it’s never too late to learn. I’ve actually downloaded a [[user-friendly]] app to learn the guitar since then.`,
        ['made the headlines', 'catchy'], 43),
      html('Practise: Part 1 questions', `<b>TV and advertisements</b>
• What kind of TV programmes did you watch as a child?
• Do you ever buy something because of an advert?
• Are there too many adverts on the internet?

<b>Celebrities</b>
• Is there a celebrity you particularly like?
• Would you like to be famous? Why or why not?

<b>The sky and stars</b>
• Can you see the stars clearly where you live?
• Have you ever watched the sunrise or the sunset somewhere special?`),
      html('Cue cards', `${cueCard('Describe a programme or app that you think is useful.', ['what it is', 'how you found out about it', 'how often you use it'], 'explain why you find it useful.')}

${cueCard('Describe an exciting book you read recently.', ['what the book is', 'what it is about', 'why you decided to read it'], 'explain why you found it exciting.')}

${cueCard('Describe a photo you remember well.', ['when and where it was taken', 'who is in it', 'what it shows'], 'explain why you remember it.')}`),
      html('Part 3: discussion questions', `• Do people trust news on social media more than traditional news?
• Should the government control what children watch online?
• Why do some films become popular all over the world?
• Will people go to art galleries less in the future because of the internet?
• Why do some songs stay in our memory for years?`),
    ],
  },

  // ------------------------------------------------------------------ 6
  {
    title: 'Speaking Toolkit 6. Places, nature and society',
    blocks: [
      html('Topics in this lesson', `Part 1: <b>activities near water, farming, wild animals, environmental protection, car trips, volunteering</b>.
Part 2: <b>a tall building in your city, a street market, a law on protecting the environment, a tradition in your country, a volunteering experience, a large company you are interested in, an area of science, an experience in a team</b>.

Это темы, где в Part 3 особенно важно говорить об обществе в целом: <i>the government, local authorities, society, the younger generation</i>.`),
      wordList('Topic vocabulary', {
        'City and buildings': [
          ['a skyscraper / a high-rise', 'небоскрёб / высотка', 'Our city has only one real skyscraper.'],
          ['a landmark', 'достопримечательность, символ города', 'The tower has become a local landmark.'],
          ['an eyesore', 'уродство, режет глаз', 'Some people think the building is an eyesore.'],
          ['a bustling market', 'шумный, оживлённый рынок', 'On Saturdays the market is bustling with people.'],
          ['to haggle', 'торговаться', 'You can haggle with the sellers.'],
          ['fresh local produce', 'свежие местные продукты', 'I go there for fresh local produce.'],
        ],
        'Nature and environment': [
          ['endangered species', 'вымирающие виды', 'Tigers are an endangered species.'],
          ['natural habitat', 'естественная среда обитания', 'Animals should live in their natural habitat.'],
          ['to cut down on plastic', 'сократить использование пластика', 'The new law helped people cut down on plastic.'],
          ['to impose a fine', 'наложить штраф', 'The city imposes a fine for littering.'],
          ['sustainable', 'экологичный, устойчивый', 'Farming should be more sustainable.'],
          ['light pollution', 'световое загрязнение', 'Because of light pollution, we can’t see the stars.'],
        ],
        'Society, work and traditions': [
          ['to do voluntary work', 'заниматься волонтёрством', 'I did voluntary work at an animal shelter.'],
          ['to give something back to the community', 'отдавать долг обществу', 'Volunteering is a way to give something back.'],
          ['a time-honoured tradition', 'давняя традиция', 'It’s a time-honoured tradition to visit relatives.'],
          ['to be passed down', 'передаваться (из поколения в поколение)', 'The recipe has been passed down for generations.'],
          ['a multinational company', 'международная компания', 'I’d love to work for a multinational company.'],
          ['team spirit', 'командный дух', 'Our team had a great team spirit.'],
        ],
      }),
      groups('City or nature?', {
        'City': ['a landmark', 'a high-rise', 'a bustling market', 'an eyesore', 'to haggle'],
        'Nature': ['endangered species', 'natural habitat', 'light pollution', 'sustainable'],
      }, 47),
      choice('Choose the best word for a high band.', [
        q('The new tower is impressive, but many locals think it’s an ____.', ['eyesore', 'ugly', 'bad building'], 'eyesore'),
        q('The government should ____ heavier fines on companies that pollute rivers.', ['do', 'impose', 'make'], 'impose'),
        q('Many local dishes have been ____ down from our grandparents.', ['given', 'passed', 'sent'], 'passed'),
        q('Zoos can help protect ____ species.', ['endangered', 'dangerous', 'in danger'], 'endangered'),
        q('I volunteer because I want to give something ____ to my community.', ['back', 'away', 'up'], 'back'),
      ]),
      html('Cue cards', `${cueCard('Describe a tall building in your city that you like or dislike.', ['where it is', 'what it looks like', 'what it is used for'], 'explain why you like or dislike it.')}

${cueCard('Describe a law on environmental protection.', ['what the law is', 'how you learned about it', 'who it affects'], 'explain whether you think it works.')}

${cueCard('Describe a tradition in your country.', ['what it is', 'when it happens', 'what people do'], 'explain why it is important to people.')}`),
      tts('Listen: a model Part 2 answer', `I'd like to talk about a tradition in Russia that I really love, which is celebrating Maslenitsa at the end of winter. It's a time-honoured tradition that lasts a whole week. People make pancakes every day, and in many towns there are outdoor festivals with games, music and a bustling market selling local produce. On the last day people burn a straw figure that symbolises winter. Many of the customs have been passed down for centuries, and my grandmother's pancake recipe is one of them. I think it's important to people because, after a long dark winter, it brings families together and gives everyone a sense of hope that spring is coming.`),
      html('Part 3: discussion questions', `• Who should be responsible for protecting the environment — individuals or governments?
• Are traditional markets disappearing in your country? Why?
• Should children learn about farming at school?
• Do tall buildings make a city more attractive or less?
• Why do people do voluntary work?
• What makes a company a good place to work?`),
    ],
  },

  // ------------------------------------------------------------------ 7
  {
    title: 'Speaking Toolkit 7. Food, shopping, clothes and things we own',
    blocks: [
      html('Topics in this lesson', `Part 1: <b>foreign food, barbecues, special costumes</b>.
Part 2: <b>a food you tried for the first time, inviting someone to dinner, shopping at a street market, a bag you would like to own, a piece of equipment that is important in your home, a person who wears unusual clothes, something you shared with others, a plan or goal you have</b>.

Для предметов используйте прилагательные в правильном порядке: <b>opinion → size → age → shape → colour → origin → material → purpose</b>: <i>a lovely small old round brown Italian leather travel bag</i>.`),
      wordList('Topic vocabulary', {
        'Food and eating out': [
          ['to be an acquired taste', 'вкус, к которому нужно привыкнуть', 'Blue cheese is definitely an acquired taste.'],
          ['spicy / mild / savoury', 'острый / мягкий / несладкий', 'I prefer mild dishes to spicy ones.'],
          ['mouth-watering', 'аппетитный', 'The smell was mouth-watering.'],
          ['to treat someone to dinner', 'угостить ужином', 'I treated my parents to dinner for their anniversary.'],
          ['a home-cooked meal', 'домашняя еда', 'Nothing beats a home-cooked meal.'],
          ['to fire up the grill', 'разжечь гриль', 'In summer we fire up the grill every weekend.'],
        ],
        'Shopping and things': [
          ['to splash out on', 'потратиться на', 'I’d love to splash out on a leather bag.'],
          ['good value for money', 'хорошее соотношение цены и качества', 'It wasn’t cheap, but it’s good value for money.'],
          ['durable / hard-wearing', 'прочный, износостойкий', 'I need a durable bag for travelling.'],
          ['a must-have', 'вещь, которая обязательно нужна', 'A dishwasher is a must-have for a big family.'],
          ['to save time and effort', 'экономить время и силы', 'It saves me a lot of time and effort.'],
          ['an impulse buy', 'спонтанная покупка', 'Those shoes were an impulse buy.'],
        ],
        'Clothes and appearance': [
          ['to stand out from the crowd', 'выделяться', 'He loves to stand out from the crowd.'],
          ['eccentric / quirky', 'эксцентричный / необычный', 'She has a quirky sense of style.'],
          ['to dress up', 'наряжаться', 'We dress up for New Year’s Eve.'],
          ['a costume / fancy dress', 'костюм / маскарадный костюм', 'The party was fancy dress.'],
          ['to be in fashion / out of fashion', 'в моде / не в моде', ''],
        ],
      }),
      dragWords('Complete the answers.',
        `Examiner: Do you like foreign food?\nVery much. I’m quite adventurous, although some dishes, like fermented fish, are definitely [[an acquired taste]].\n\nExaminer: Describe a bag you would like to own.\nI’d love to [[splash out on]] a proper leather backpack. It should be [[durable]], because I travel a lot, and although it’s expensive, I think it would be [[good value for money]].\n\nExaminer: Do you know anyone who wears unusual clothes?\nYes, my friend Pasha really likes to [[stand out from the crowd]] — he wears bright vintage suits.`,
        ['an impulse buy', 'mouth-watering'], 53),
      choice('Adjective order. Which is correct?', [
        q('Choose the natural order.', ['a leather small black bag', 'a small black leather bag', 'a black small leather bag'], 'a small black leather bag'),
        q('Choose the natural order.', ['an old beautiful wooden table', 'a wooden beautiful old table', 'a beautiful old wooden table'], 'a beautiful old wooden table'),
        q('Choose the natural order.', ['a new Japanese rice cooker', 'a Japanese new rice cooker', 'a rice new Japanese cooker'], 'a new Japanese rice cooker'),
      ]),
      html('Cue cards', `${cueCard('Describe a food you tried for the first time.', ['what it was', 'where and when you tried it', 'who you were with'], 'explain whether you liked it.')}

${cueCard('Describe a piece of equipment that is important in your home.', ['what it is', 'when you got it', 'how often you use it'], 'explain why it is important to you.')}

${cueCard('Describe a time when you invited someone to dinner.', ['who you invited', 'where you had dinner', 'what you ate'], 'explain why you invited this person.')}`),
      tts('Listen: a model Part 2 answer', `The piece of equipment I couldn't live without is our dishwasher. We bought it about three years ago, after my daughter was born, because suddenly there were bottles and plates everywhere. At first I thought it was a bit of an extravagance, but it turned out to be a real must-have. We run it every evening, and it saves us so much time and effort that we can actually spend the evening together instead of standing at the sink. It's also surprisingly economical, because it uses less water than washing by hand. So all in all, it was the best value for money of anything we've bought for the flat.`),
      html('Part 3: discussion questions', `• Why do people enjoy trying food from other countries?
• Is it better to eat at home or in restaurants?
• Do people buy too many things they don't need?
• How do advertisements influence what young people buy?
• Do clothes say a lot about a person's personality?
• Has technology made housework easier or just different?`),
    ],
  },
]
