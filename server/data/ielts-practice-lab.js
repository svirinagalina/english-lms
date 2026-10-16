// IELTS Practice Lab: original practice lessons appended to the IELTS course
// by scripts/add-ielts-practice-lab.js. Written for this platform — the task
// types follow the exam (headings, T/F/NG, summary with a word bank, form
// completion, Task 1 process/trends, Task 2 structure, Speaking Part 2/3),
// but every passage, script, essay and question here is our own; nothing is
// copied from Cambridge or any other published book.
//
// Helpers keep the payloads in the shapes Course.jsx / CourseActivities.jsx
// render: html {title, html} (only <b>, <i>, \n), choice {title, questions:
// [{question, options, correct:[i]}]}, drag-words {title, bank, parts,
// answers}, groups {title, bank, groups:[{name, words}]}, word-order {title,
// items:[{words, shown}]}, tts {title, script}.

// Deterministic shuffle so a re-run produces the same lesson.
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
const TFNG = ['TRUE', 'FALSE', 'NOT GIVEN']
const YNNG = ['YES', 'NO', 'NOT GIVEN']
const tfng = (statement, answer) => q(statement, TFNG, answer)
const ynng = (statement, answer) => q(statement, YNNG, answer)

// "The rate [[rose]] sharply" → parts/answers; the bank is the answers plus
// distractors, shuffled.
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

function wordOrder(title, sentences) {
  return {
    type: 'word-order',
    payload: {
      title,
      items: sentences.map((sentence, i) => {
        const words = sentence.split(' ')
        let shown = shuffle(words, 31 + i * 17)
        if (shown.join(' ') === words.join(' ')) shown = [...words.slice(1), words[0]]
        return { words, shown }
      }),
    },
  }
}

const fill = (question, answer, alternatives = []) => ({ type: 'FILL_BLANK', question, payload: { answer, alternatives } })

export const PRACTICE_LAB = [
  // ---------------------------------------------------------------- 1
  {
    title: 'Practice Lab 1. Reading: Matching headings',
    blocks: [
      html('How to do it', `<b>Matching headings</b> — одно из самых «дорогих» заданий: заголовков всегда больше, чем абзацев.

<b>Алгоритм</b>
1. Сначала прочитайте <b>заголовки</b> и подчеркните в каждом главную идею (не отдельные слова!).
2. Читайте абзац целиком и спросите себя: <i>о чём он в целом?</i> Ответ обычно в первом-втором предложении, но иногда — в последнем.
3. Ловушка: в абзаце встречается слово из заголовка, но заголовок описывает лишь деталь, а не главную мысль.
4. Сначала решайте абзацы, в которых уверены, — это сокращает список вариантов.`),
      html('Reading passage — The Return of the Night Train', `<b>A</b>
For much of the twentieth century, sleeper trains were the normal way to cross Europe. Business travellers boarded in Paris after dinner and woke up in Milan or Vienna in time for a morning meeting. By the early 2000s, however, the picture had changed completely. Low-cost airlines could carry passengers between the same cities in under two hours for a fraction of the price, and one national operator after another quietly withdrew its overnight services. By 2015 most of the famous routes had disappeared from timetables.

<b>B</b>
Few people predicted what happened next. In 2016 the Austrian railway company decided to take over several routes that its German neighbour had abandoned. Critics called the move a gamble, but within three years many trains were fully booked weeks in advance. Surveys suggested that a growing number of passengers, particularly younger ones, were choosing rail because they were worried about the carbon emissions of short flights.

<b>C</b>
Popularity, though, does not guarantee profit. A sleeper carriage makes only one journey every twenty-four hours, whereas a daytime carriage on the same line might complete four. Staff must be paid to work through the night, and beds need to be cleaned and remade after every trip. On top of this, each country charges its own fee for using the track, so a single journey from Amsterdam to Prague can involve paying three separate infrastructure managers.

<b>D</b>
Operators have therefore focused on making the journey itself attractive enough to justify higher fares. New carriages offer private compartments with their own showers, while cheaper "mini-cabins" give solo travellers a lockable space instead of a seat in a shared couchette. Free wireless internet and breakfast delivered to the compartment are now standard on several routes.

<b>E</b>
Whether the revival will last remains a matter of debate. Several governments have promised subsidies, and the European Union has published a plan to double long-distance rail traffic by 2030. Sceptics point out, however, that a twelve-hour journey will never compete with a two-hour flight for travellers who value speed above everything else, and they warn that subsidies can be withdrawn as quickly as they are introduced.`),
      choice('Questions 1–5. Choose the correct heading for each paragraph.', (() => {
        const headings = [
          'i. Disagreement about the future of the service',
          'ii. Why the trains are expensive to operate',
          'iii. A comparison of ticket prices in different countries',
          'iv. How competition from the air led to closures',
          'v. Attempts to make the journey more appealing',
          'vi. A surprising recovery driven by new attitudes',
          'vii. The environmental damage caused by railway construction',
        ]
        return [
          q('Paragraph A', headings, headings[3]),
          q('Paragraph B', headings, headings[5]),
          q('Paragraph C', headings, headings[1]),
          q('Paragraph D', headings, headings[4]),
          q('Paragraph E', headings, headings[0]),
        ]
      })()),
      choice('Questions 6–8. Choose the correct answer.', [
        q('According to paragraph B, the decision of the Austrian company was', [
          'A. supported by most experts.',
          'B. seen by some as risky.',
          'C. made with the help of the German operator.',
          'D. criticised by environmental groups.',
        ], 'B. seen by some as risky.'),
        q('What is the main disadvantage of a sleeper carriage mentioned in paragraph C?', [
          'A. It cannot be used as often as a day carriage.',
          'B. It is heavier than a day carriage.',
          'C. It needs more frequent repairs.',
          'D. It can only run on certain lines.',
        ], 'A. It cannot be used as often as a day carriage.'),
        q('The writer mentions "mini-cabins" as an example of', [
          'A. a way of reducing the number of staff.',
          'B. an option for people travelling alone.',
          'C. the cheapest type of train ticket in Europe.',
          'D. a feature that passengers have complained about.',
        ], 'B. an option for people travelling alone.'),
      ]),
      html('Answers explained', `1 — <b>iv</b>: «Low-cost airlines… one national operator after another quietly withdrew» = competition from the air → closures.
2 — <b>vi</b>: «Few people predicted» = surprising; «worried about carbon emissions» = new attitudes.
3 — <b>ii</b>: весь абзац — о затратах (staff, cleaning, track fees). Ловушка — <b>iii</b>: страны упоминаются, но цены билетов не сравниваются.
4 — <b>v</b>: «making the journey itself attractive» = more appealing.
5 — <b>i</b>: «remains a matter of debate», «Sceptics point out» = disagreement.
<b>vii</b> — лишний: о строительстве путей в тексте нет ни слова.`),
    ],
  },

  // ---------------------------------------------------------------- 2
  {
    title: 'Practice Lab 2. Reading: True / False / Not Given and Yes / No / Not Given',
    blocks: [
      html('TRUE, FALSE или NOT GIVEN?', `<b>TRUE</b> — текст говорит то же самое, но другими словами (парафраз).
<b>FALSE</b> — текст говорит <b>противоположное</b>: в нём есть информация, которая опровергает утверждение.
<b>NOT GIVEN</b> — в тексте нет информации, чтобы проверить утверждение. Тема может упоминаться, но нужного факта нет.

<b>Главная ловушка:</b> не используйте собственные знания. Если «это и так понятно», но в тексте этого нет — NOT GIVEN.
Обращайте внимание на слова-ограничители: <i>all, only, always, never, most, some, the first</i>. Одно такое слово превращает TRUE во FALSE.

<b>YES / NO / NOT GIVEN</b> — то же самое, но про <b>мнение автора</b>, а не про факты.`),
      html('Reading passage — Cooling Cities with Trees', `On a hot summer afternoon, the temperature in the centre of a large city can be several degrees higher than in the surrounding countryside. This "urban heat island" effect occurs because roads, roofs and pavements absorb sunlight during the day and release it slowly at night. As heatwaves become more frequent, city authorities are looking for affordable ways to reduce it, and trees have emerged as one of the most promising options.

Trees cool the air in two ways. Their leaves block sunlight before it reaches the ground, and they release water vapour through tiny openings, a process that uses up heat energy. A study carried out in the Australian city of Melbourne in 2019 found that streets with a dense tree canopy were, on average, 4°C cooler at midday than nearby streets with no trees at all. The researchers noted that the difference was smaller at night, because the leaves also trap some of the warm air underneath them.

Not every species is equally useful. Trees with broad leaves provide more shade than those with narrow needles, but they may also need more water, which can be a problem in dry regions. Planners in Seville, for example, have chosen orange trees, which tolerate drought and have dense leaves. Some cities have also discovered that trees planted too close to buildings can damage foundations as their roots grow.

Cost is another consideration. Planting a young tree in a city street is relatively cheap, but caring for it during its first five years — watering, protecting it from vehicles and replacing those that die — is far more expensive. In Paris, officials estimate that roughly one in ten newly planted street trees does not survive.`),
      choice('Questions 1–8. Do the statements agree with the information in the passage? Choose TRUE, FALSE or NOT GIVEN.', [
        tfng('Cities are usually cooler than the countryside around them on summer afternoons.', 'FALSE'),
        tfng('Heat stored by roads and buildings is released gradually after dark.', 'TRUE'),
        tfng('Trees reduce heat partly by giving off water vapour.', 'TRUE'),
        tfng('The Melbourne study found that tree-lined streets were cooler both during the day and at night by the same amount.', 'FALSE'),
        tfng('The Melbourne study was paid for by the city government.', 'NOT GIVEN'),
        tfng('Seville chose orange trees partly because they grow quickly.', 'NOT GIVEN'),
        tfng('Maintaining a new street tree costs more than planting it.', 'TRUE'),
        tfng('Around ten per cent of new street trees in Paris die.', 'TRUE'),
      ]),
      html('Answers explained', `1 <b>FALSE</b> — «several degrees higher than in the surrounding countryside».
2 <b>TRUE</b> — «release it slowly at night» = gradually after dark.
3 <b>TRUE</b> — «release water vapour… uses up heat energy».
4 <b>FALSE</b> — «the difference was smaller at night».
5 <b>NOT GIVEN</b> — кто финансировал исследование, не сказано.
6 <b>NOT GIVEN</b> — причины выбора названы (tolerate drought, dense leaves), а о скорости роста ничего нет. Типичная ловушка: звучит логично, но в тексте этого нет.
7 <b>TRUE</b> — «far more expensive».
8 <b>TRUE</b> — «roughly one in ten» = around ten per cent.`),
      html('Opinion passage — Is the Four-Day Week Worth It?', `Supporters of the four-day working week often present it as a cost-free improvement: staff are happier and, they claim, just as productive. I find the first part of this argument convincing. In almost every trial I have read about, employees reported less stress and more time for their families. The second part, however, is far less certain. Most trials have been short, typically six months, and were carried out in office-based companies whose managers had volunteered to take part. It would be unwise to assume that a hospital or a factory could reduce working hours without hiring more people. That said, I do not believe the idea should be dismissed. Governments could usefully fund longer trials in a wider range of industries before deciding anything.`),
      choice('Questions 9–13. Do the statements agree with the views of the writer? Choose YES, NO or NOT GIVEN.', [
        ynng('The four-day week is likely to improve employees’ well-being.', 'YES'),
        ynng('There is strong evidence that productivity stays the same with a four-day week.', 'NO'),
        ynng('The companies in most trials were not chosen at random.', 'YES'),
        ynng('Hospitals would find a four-day week easier to introduce than offices.', 'NO'),
        ynng('Employees in the trials earned less money than before.', 'NOT GIVEN'),
      ]),
    ],
  },

  // ---------------------------------------------------------------- 3
  {
    title: 'Practice Lab 3. Reading: Summary and note completion',
    blocks: [
      html('How to do it', `<b>Summary completion</b> бывает двух видов:
• <b>с банком слов</b> (A–H) — слов больше, чем пропусков; часто это синонимы слов из текста;
• <b>словами из текста</b> — строго соблюдайте лимит: <i>NO MORE THAN TWO WORDS</i> означает одно или два слова; число (например, <i>1850</i>) считается одним словом.

<b>Алгоритм</b>
1. Прочитайте summary и предскажите <b>часть речи</b> для каждого пропуска (существительное? прилагательное? число?).
2. Найдите в тексте участок, который пересказывает summary — ответы идут <b>по порядку</b>.
3. Проверьте грамматику: подходит ли слово по форме (единственное/множественное число, артикль перед пропуском).`),
      html('Reading passage — The Story of the Pencil', `The modern pencil owes its existence to a lucky discovery. In the 1560s, shepherds in Borrowdale, in the north of England, found a large deposit of an unusually pure black mineral. It left a dark mark on paper but could be rubbed away easily, and local people began using it to mark their sheep. At first it was believed to be a form of lead, which is why we still talk about pencil "lead" today, although the material — graphite — contains no lead at all.

Pure graphite is soft and breaks easily, so early users wrapped sticks of it in string or sheepskin. Later, carpenters in Italy had the idea of placing the graphite inside a hollow piece of wood, creating something close to the pencil we know. Because the Borrowdale mine was the only known source of high-quality graphite, the English government guarded it closely, and the mineral was so valuable that it was transported to London under armed protection.

Other countries had to find a different solution. In 1795, during a war that prevented France from importing English graphite, the engineer Nicolas-Jacques Conté developed a method of mixing powdered graphite of lower quality with clay and then baking the mixture. The process had an unexpected advantage: by changing the proportion of clay, manufacturers could make pencils harder or softer. This is the origin of the grading system printed on pencils today, in which "H" indicates a hard pencil and "B" a soft, black one.`),
      dragWords('Questions 1–6. Complete the summary. Drag a word into each gap (there are more words than gaps).',
        `Graphite was first found by [[shepherds]] in the 1560s. People wrongly thought it was [[lead]], and the old name has survived. Because pure graphite was [[fragile]], it was at first covered with string or animal skin. The idea of putting it inside [[wood]] came from Italy. The English mine was so important that graphite was moved to London with [[guards]]. In France, Conté combined graphite powder with [[clay]], which made it possible to control how hard a pencil was.`,
        ['miners', 'expensive', 'metal', 'delay', 'glue'], 5),
      html('Questions 7–11', 'Complete the notes. Write <b>NO MORE THAN TWO WORDS AND/OR A NUMBER</b> from the passage for each answer — answer in the exercises below.'),
    ],
    exercises: [
      fill('Graphite leaves a mark on paper that can be ____ easily.', 'rubbed away', ['rubbed']),
      fill('Carpenters in Italy put the graphite inside a hollow piece of ____', 'wood'),
      fill('Year Conté developed his method: ____', '1795'),
      fill('France could not import English graphite because of a ____', 'war'),
      fill('On a pencil, the letter "B" means it is soft and ____', 'black'),
    ],
  },

  // ---------------------------------------------------------------- 4
  {
    title: 'Practice Lab 4. Reading: Matching information and matching features',
    blocks: [
      html('How to do it', `<b>Matching information</b> («Which paragraph contains…?») — самое трудное: вопросы идут <b>не по порядку</b>, а один абзац может подходить к нескольким вопросам (или ни к одному). Ищите <b>тип</b> информации: <i>an example, a reason, a comparison, a prediction, a description of a method</i>.

<b>Matching features</b> (утверждения ↔ люди/исследователи): сначала найдите в тексте все имена и подчеркните их. Мнение может быть передано через <i>argues, claims, suggests, found that, warns</i>.`),
      html('Reading passage — Learning a Language as an Adult', `<b>A</b>
It is widely believed that children learn languages more easily than adults. Linguist Maria Kovač accepts that this is true for pronunciation: people who start learning after the age of twelve rarely sound exactly like native speakers. However, she argues that in the first year of study adults usually make faster progress than children, because they can use their knowledge of grammar and their study skills.

<b>B</b>
Why, then, do so many adult learners give up? Psychologist Daniel Reyes interviewed 300 people who had abandoned a language course. The most common reason was not difficulty but embarrassment: many said they felt "childish" when they made mistakes in front of others. Reyes suggests that teachers should create more opportunities for learners to practise in pairs rather than in front of the whole class.

<b>C</b>
Technology has changed the way many adults study. Mobile apps allow learners to practise for a few minutes a day, and some researchers think this is more effective than a single long lesson each week. Education researcher Aiko Tanaka is less optimistic. Her study of 1,200 app users found that fewer than five per cent were still using the app after six months, and she warns that short daily practice is useless unless learners also have real conversations.

<b>D</b>
Kovač believes that the most successful adult learners share one habit: they connect the language to something they already care about, such as a hobby or their job. A nurse who learns medical vocabulary in Spanish, for instance, is likely to remember it far longer than words from a general textbook. Tanaka agrees, adding that people who choose their own learning materials tend to continue studying for longer.`),
      choice('Questions 1–5. Which paragraph (A–D) contains the following information?', [
        q('an example of a learner using a language for work', ['A', 'B', 'C', 'D'], 'D'),
        q('figures showing how many learners stop using a learning tool', ['A', 'B', 'C', 'D'], 'C'),
        q('a reason why adults may leave a course', ['A', 'B', 'C', 'D'], 'B'),
        q('a skill that adults are unlikely to master completely', ['A', 'B', 'C', 'D'], 'A'),
        q('a recommendation for classroom teachers', ['A', 'B', 'C', 'D'], 'B'),
      ]),
      choice('Questions 6–10. Match each statement with the correct person. A — Maria Kovač, B — Daniel Reyes, C — Aiko Tanaka. You may use a letter more than once.', (() => {
        const people = ['A. Maria Kovač', 'B. Daniel Reyes', 'C. Aiko Tanaka']
        return [
          q('Adults can progress quickly at the beginning thanks to skills they already have.', people, people[0]),
          q('Fear of looking foolish stops many people from continuing.', people, people[1]),
          q('Brief daily practice alone will not lead to success.', people, people[2]),
          q('Learners who select their own materials study for longer.', people, people[2]),
          q('Linking a language to personal interests helps memory.', people, people[0]),
        ]
      })()),
    ],
  },

  // ---------------------------------------------------------------- 5
  {
    title: 'Practice Lab 5. Listening: Form completion and multiple choice',
    blocks: [
      html('Before you listen', `<b>Part 1 (форма/заметки):</b> до прослушивания прочитайте все пропуски и предскажите, что там: имя, число, дата, адрес, цена. Имена и улицы обычно <b>диктуют по буквам</b> — заранее повторите, как звучат <i>A, E, I, G, J, H, W, Y</i>.
Ловушка Part 1: говорящий называет одно, а потом <b>исправляется</b> («Sorry, I mean…», «Actually, it's changed to…»). Верный ответ — последний.

<b>Part 3 (обсуждение студентов):</b> варианты ответов почти всегда упоминаются все, но верен только один. Слушайте, с чем говорящие <b>соглашаются в итоге</b>.

Нажмите ▶, чтобы прослушать (озвучивает браузер). Скрипт можно открыть после ответа.`),
      tts('Part 1 — Joining a community sports centre', `Receptionist: Good morning, Riverside Sports Centre. How can I help?
Caller: Hello, I'd like to join the centre. Can I do that over the phone?
Receptionist: Yes, of course. Can I take your full name, please?
Caller: It's Anna Whitfield. That's W, H, I, T, F, I, E, L, D.
Receptionist: Thank you. And your date of birth?
Caller: The twenty-third of March, nineteen ninety-four.
Receptionist: Lovely. What's your address?
Caller: Forty-two Mill Lane, in Hartley.
Receptionist: Is that Mill as in a water mill?
Caller: That's right. M, I, double L.
Receptionist: Great. Now, we have two types of membership. The standard one is thirty-two pounds a month, and that includes the gym and the pool. The premium one is forty-five, and you also get unlimited classes.
Caller: I mostly want to swim, so the standard one, please.
Receptionist: OK. And how would you like to pay? Most people choose a direct debit.
Caller: Yes, direct debit is fine.
Receptionist: And do you have any health conditions we should know about?
Caller: Not really. Well, I hurt my knee last year, but it's fine now.
Receptionist: I'll make a note of that, just in case. Your first visit will include a short induction with one of our trainers. We usually do those on Tuesdays at six thirty in the evening… oh, sorry, I've just checked, they've moved to Thursdays at the same time.
Caller: Thursday is fine.
Receptionist: Perfect. And please remember to bring a photo for your membership card.`),
      tts('Part 3 — Planning a presentation on food waste', `Tom: So, Lucy, we need to decide how to start our presentation on food waste.
Lucy: I thought we could begin with some statistics. You know, how much food households throw away each year.
Tom: Hmm, I think the audience will have heard those numbers before. What about starting with a photo of one family's rubbish from a single week?
Lucy: That's a good idea. It's more personal. OK, let's do that, and we can bring in the statistics afterwards.
Tom: Fine. Now, for the main part, should we focus on supermarkets or on homes?
Lucy: Supermarkets get a lot of the blame, but the research we read said that most waste actually happens at home.
Tom: True. So homes, then. And we can mention supermarkets briefly.
Lucy: Agreed. What about the questionnaire we gave to the other students? Were the results useful?
Tom: Not very. Only twenty people answered, so I don't think we can draw any real conclusions from it.
Lucy: I suppose we could still mention it as a small example, but you're right, we shouldn't base our argument on it.
Tom: Last thing — the handout. Should it have the full references?
Lucy: I'd rather keep it short. Let's just give a list of practical tips, and put the references on our final slide.
Tom: Good, that saves paper too.`),
      choice('Part 3, Questions 6–9. Choose the correct answer.', [
        q('How will the students begin their presentation?', ['A. with statistics about households', 'B. with a picture of a family’s rubbish', 'C. with a question for the audience'], 'B. with a picture of a family’s rubbish'),
        q('The main part of the presentation will focus on', ['A. supermarkets.', 'B. restaurants.', 'C. homes.'], 'C. homes.'),
        q('What do they say about their questionnaire?', ['A. Too few people took part.', 'B. The questions were badly written.', 'C. It supports their main argument.'], 'A. Too few people took part.'),
        q('The handout will contain', ['A. a full list of references.', 'B. practical advice.', 'C. a copy of the slides.'], 'B. practical advice.'),
      ]),
      html('Part 1, Questions 1–5', 'Complete the form. Write <b>ONE WORD AND/OR A NUMBER</b> for each answer — in the exercises below.'),
    ],
    exercises: [
      fill('Surname: Anna ____', 'Whitfield'),
      fill('Address: 42 ____ Lane, Hartley', 'Mill'),
      fill('Standard membership: £____ per month', '32', ['£32', 'thirty-two']),
      fill('Previous injury: ____', 'knee', ['her knee', 'a knee']),
      fill('Induction day: ____ at 6.30 p.m.', 'Thursday', ['Thursdays']),
    ],
  },

  // ---------------------------------------------------------------- 6
  {
    title: 'Practice Lab 6. Writing Task 1: Describing a process',
    blocks: [
      html('The task', `<b>WRITING TASK 1</b>
<i>The diagram below shows how olive oil is produced. Summarise the information by selecting and reporting the main features. Write at least 150 words.</i>

<b>Stages shown in the diagram:</b>
1. Olives are picked by hand or with machines (October–December)
2. Leaves and twigs are removed; olives are washed
3. Olives are crushed into a paste
4. The paste is mixed slowly for 30–40 minutes
5. Oil is separated from water and solids in a centrifuge
6. Oil is stored in steel tanks for 1–2 months
7. Oil is filtered and bottled`),
      html('Language for processes', `• <b>Passive voice</b> — главное в процессе: <i>Olives are picked… The paste is mixed…</i>
• <b>Sequencers</b>: <i>First / To begin with → Next / Then / After that / Subsequently → Once…, / After being…, → Finally / In the final stage</i>
• <b>Overview</b> (обязателен!): сколько этапов, с чего начинается и чем заканчивается процесс. Без overview балл за Task Achievement обычно не выше 5.
• Не добавляйте мнений и того, чего нет на схеме.`),
      dragWords('Complete the model answer.',
        `The diagram illustrates the [[stages]] involved in producing olive oil, from harvesting the fruit to bottling the final product.

Overall, there are seven steps in the process, which [[begins]] with picking the olives and ends with the oil being filtered and bottled.

[[First]], the olives are picked, either by hand or by machine, between October and December. [[Next]], any leaves and twigs are removed, and the fruit is [[washed]]. After that, the olives are crushed until they form a paste, which is then mixed slowly [[for]] 30 to 40 minutes.

In the following stage, a centrifuge is used to [[separate]] the oil from the water and solid material. The oil is then [[stored]] in steel tanks, where it remains for one or two months. [[Finally]], it is filtered and put into bottles, ready to be sold.`,
        ['during', 'cleaning', 'Before', 'separating'], 13),
      wordOrder('Build the passive sentences.', [
        'The olives are crushed into a paste',
        'The oil is separated from the water',
        'Once the oil has been stored it is filtered',
      ]),
      groups('Overview or detail? Sort the sentences (short versions).', {
        'Overview': [
          'There are seven main stages.',
          'The process begins with harvesting.',
          'It ends with bottling.',
        ],
        'Detail': [
          'Olives are washed after picking.',
          'Mixing takes 30–40 minutes.',
          'Oil stays in tanks for 1–2 months.',
        ],
        'Not appropriate': [
          'I think olive oil is very healthy.',
          'Spain produces the most olive oil.',
        ],
      }),
    ],
  },

  // ---------------------------------------------------------------- 7
  {
    title: 'Practice Lab 7. Writing Task 1: Trends and comparisons',
    blocks: [
      html('The task', `<b>WRITING TASK 1</b>
<i>The table below shows the average number of visits to the cinema per person per year in three countries between 2000 and 2020. Summarise the information by selecting and reporting the main features, and make comparisons where relevant.</i>

<b>Visits per person per year</b>
Country — 2000 / 2005 / 2010 / 2015 / 2020
Australia — 4.5 / 4.2 / 3.8 / 3.6 / 1.1
Ireland — 3.9 / 4.1 / 3.6 / 3.4 / 0.9
Spain — 3.4 / 3.0 / 2.2 / 2.0 / 0.6`),
      groups('Verbs or nouns? Sort the words describing change.', {
        'Verb': ['rose', 'declined', 'fluctuated', 'plummeted', 'levelled off'],
        'Noun': ['a rise', 'a decline', 'a fluctuation', 'a plunge', 'a peak'],
      }, 3),
      choice('Choose the best word.', [
        q('Between 2015 and 2020, cinema attendance in all three countries fell ____.', ['slightly', 'dramatically', 'steadily'], 'dramatically'),
        q('Attendance in Ireland ____ in 2005 before falling again.', ['peaked', 'bottomed out', 'remained stable'], 'peaked'),
        q('Spain had the ____ figures throughout the period.', ['highest', 'lowest', 'most stable'], 'lowest'),
        q('Which sentence is the best overview?', [
          'In 2000 Australia had 4.5 visits per person.',
          'Overall, cinema-going declined in all three countries, with a sharp drop in the final five years, and Australia generally had the highest figures.',
          'People stopped going to the cinema because of streaming services.',
        ], 'Overall, cinema-going declined in all three countries, with a sharp drop in the final five years, and Australia generally had the highest figures.'),
      ]),
      dragWords('Complete the body paragraph.',
        `In 2000, Australians went to the cinema 4.5 times a year on average, [[compared with]] 3.9 visits in Ireland and 3.4 in Spain. Over the next fifteen years, the figure for Australia fell [[gradually]] to 3.6, [[whereas]] Ireland saw a small increase to 4.1 in 2005 before declining to 3.4. Spain experienced the [[largest]] fall in this period, with attendance dropping to just 2.0. Between 2015 and 2020, all three countries saw a [[dramatic]] decline: the Australian figure fell to 1.1, [[while]] Ireland and Spain recorded 0.9 and 0.6 [[respectively]].`,
        ['steady', 'despite', 'highest'], 21),
      html('Совет', `• Не перечисляйте все 15 чисел — выбирайте <b>ключевые</b>: начало, конец, пики, самое резкое изменение.
• Сравнивайте: <i>compared with, whereas, while, the highest/lowest, twice as many as</i>.
• <i>respectively</i> — «соответственно», ставится в конце предложения.`),
    ],
  },

  // ---------------------------------------------------------------- 8
  {
    title: 'Practice Lab 8. Writing Task 2: Planning and structuring an essay',
    blocks: [
      html('The task', `<b>WRITING TASK 2</b>
<i>Some people believe that museums and art galleries should be free for everyone. Others think visitors should pay for entry. Discuss both views and give your own opinion.</i>
Write at least 250 words.

<b>План на 5 минут</b> (не пропускайте!):
1. Определите тип вопроса: здесь <b>discuss both views + opinion</b> — нужны обе стороны И ваше мнение.
2. Введение: перефраз темы + thesis (ваша позиция).
3. Body 1: аргументы за бесплатный вход + пример.
4. Body 2: аргументы за платный вход + пример (и почему вы с ними (не) согласны).
5. Заключение: позиция ещё раз, без новых идей.`),
      choice('Which thesis statement answers the question best?', [
        q('Choose one.', [
          'Museums are very important places in every city.',
          'This essay will talk about museums.',
          'While charging fees can help museums survive, I believe free entry is better because it makes culture accessible to everyone.',
          'In my opinion, art galleries are more interesting than museums.',
        ], 'While charging fees can help museums survive, I believe free entry is better because it makes culture accessible to everyone.'),
      ]),
      groups('Where does each sentence belong?', {
        'Introduction': [
          'Whether museums should charge admission is a widely debated issue.',
          'In my view, the benefits of free entry outweigh the costs.',
        ],
        'Body paragraph': [
          'Supporters of free entry argue that it attracts families with low incomes.',
          'For instance, visitor numbers rose sharply when one national museum removed its fees.',
          'On the other hand, ticket sales provide money for maintenance.',
        ],
        'Conclusion': [
          'In conclusion, although fees bring in income, free access benefits society more.',
        ],
      }, 9),
      dragWords('Complete the paragraph with linking words.',
        `Those who support entrance fees have a strong argument. Running a museum is expensive, [[and]] ticket income can pay for repairs and new exhibitions. [[Furthermore]], people may value a visit more if they have paid for it. [[However]], fees can discourage students and low-income families. [[For example]], a family of four may not be able to afford a day out if each ticket costs fifteen pounds. [[Therefore]], I believe that a compromise, [[such as]] free entry one day a week, would be fairer.`,
        ['Despite', 'Because'], 17),
      html('Model essay (band 7–8)', `Whether museums and art galleries should charge for admission is a widely debated question. While entrance fees can help these institutions survive financially, I believe that free entry is preferable because it gives everyone equal access to culture.

On the one hand, there are good reasons to charge visitors. Maintaining old buildings and valuable collections is extremely costly, and ticket income allows museums to fund repairs, hire specialists and organise new exhibitions without relying entirely on the government. In addition, some argue that people appreciate an experience more when they have paid for it, and are therefore more likely to treat exhibits with respect.

On the other hand, fees create a barrier for those who might benefit most. Students, retired people and families on low incomes often cannot afford regular visits, which means that knowledge of art and history becomes a privilege of the wealthy. When several national museums in Britain stopped charging in 2001, visitor numbers rose dramatically, showing how many people had previously been excluded. Free museums also support schools, as teachers can bring classes without asking parents for money.

In conclusion, although entrance fees provide useful income, I am convinced that the social benefits of free access are greater. Governments should fund museums adequately so that culture remains open to all.

<i>(262 words)</i>`),
    ],
  },

  // ---------------------------------------------------------------- 9
  {
    title: 'Practice Lab 9. Academic vocabulary: collocations and word building',
    blocks: [
      html('Why it matters', `<b>Lexical Resource</b> — четверть оценки в Writing и Speaking. Экзаменатор ищет не «сложные» слова, а <b>точные сочетания</b> (collocations) и правильные <b>формы слов</b>. Ошибка в форме (<i>economic</i> vs <i>economical</i>, <i>affect</i> vs <i>effect</i>) снижает балл за Reading и Listening тоже: ответ с неправильной формой не засчитывается.`),
      dragWords('Complete the collocations.',
        `Scientists [[conducted]] a study of 2,000 adults. The results [[pose]] a serious threat to the theory. The campaign aims to [[raise]] awareness of climate change. The government has [[taken]] steps to reduce pollution. New technology has [[played]] a key role in medicine. Online learning can [[meet]] the needs of working adults.`,
        ['made', 'did', 'give'], 23),
      groups('Make, do or take?', {
        'make': ['a decision', 'progress', 'an effort', 'a mistake'],
        'do': ['research', 'damage', 'harm'],
        'take': ['responsibility', 'action', 'advantage of'],
      }, 5),
      choice('Choose the correct form of the word.', [
        q('Tourism is very important for the local ____.', ['economic', 'economy', 'economical'], 'economy'),
        q('Small cars are more ____ to run.', ['economic', 'economy', 'economical'], 'economical'),
        q('Air pollution can ____ people’s health.', ['affect', 'effect', 'effective'], 'affect'),
        q('There has been a significant ____ in unemployment.', ['reduce', 'reduction', 'reductive'], 'reduction'),
        q('The new policy was ____ in reducing traffic.', ['success', 'succeed', 'successful'], 'successful'),
        q('Many people are ____ about the future of work.', ['anxiety', 'anxious', 'anxiously'], 'anxious'),
      ]),
      groups('Cause or result?', {
        'Cause': ['due to', 'as a result of', 'owing to', 'stem from'],
        'Result': ['consequently', 'lead to', 'result in', 'therefore'],
      }, 41),
    ],
  },

  // ---------------------------------------------------------------- 10
  {
    title: 'Practice Lab 10. Speaking Parts 2 and 3: Cue cards and discussion',
    blocks: [
      html('How Part 2 works', `<b>Part 2:</b> вы получаете карточку, 1 минуту на подготовку и говорите <b>1–2 минуты</b>. Экзаменатор остановит вас через 2 минуты — это нормально.

<b>Подготовка за 1 минуту:</b> не пишите предложения — только 5–6 ключевых слов, по одному на каждый пункт карточки + одно «почему».
<b>Структура:</b> вступление (1 фраза) → пункты карточки по порядку → последний пункт («explain why…») — самый длинный, здесь показывайте лексику и мнение.
<b>Время:</b> используйте Past Simple для истории, Present Perfect — для опыта, условные — для «что было бы, если».

Запишите себя на телефон и послушайте: паузы больше 3 секунд, повторы одних и тех же слов, «эээ» — то, над чем работать.`),
      html('Cue card 1', `<b>Describe a skill you learned as an adult.</b>
You should say:
• what the skill is
• when and how you learned it
• what difficulties you had
and explain how this skill has changed your life.`),
      html('Cue card 2', `<b>Describe a place in your city where people go to relax.</b>
You should say:
• where it is
• what it looks like
• what people do there
and explain why you like or dislike this place.`),
      html('Cue card 3', `<b>Describe a time when you changed your mind about something.</b>
You should say:
• what it was
• what your original opinion was
• what made you change your mind
and explain how you felt afterwards.`),
      groups('Useful phrases. Sort them by function.', {
        'Buying time': ["That's an interesting question.", 'Let me think about that for a moment.'],
        'Giving an example': ['A good example of this is…', 'Take my brother, for instance.'],
        'Speculating': ["I'd imagine that…", 'It may well be that…'],
        'Contrasting': ['Having said that,…', 'On the flip side,…'],
      }, 2),
      choice('Part 3. Which answer is better for a high band?', [
        q('Examiner: Do you think older people find it harder to learn new skills?', [
          'Yes, they do. Old people are slow.',
          'To some extent, yes. Older people may need more time, partly because they have less free time and more responsibilities. Having said that, they are often more motivated — my grandmother learned to use a tablet at seventy because she wanted to see photos of her grandchildren.',
          'I don’t know. Maybe. It depends.',
        ], 'To some extent, yes. Older people may need more time, partly because they have less free time and more responsibilities. Having said that, they are often more motivated — my grandmother learned to use a tablet at seventy because she wanted to see photos of her grandchildren.'),
        q('Examiner: Will cities have more green spaces in the future?', [
          'It may well be that they will, since governments are increasingly aware of the effect of heat on health. However, land in city centres is very expensive, so I’d imagine most new parks will be built on rooftops or in former industrial areas.',
          'Yes. Green is good. People like parks.',
          'In my city there is a big park. I go there on Sundays.',
        ], 'It may well be that they will, since governments are increasingly aware of the effect of heat on health. However, land in city centres is very expensive, so I’d imagine most new parks will be built on rooftops or in former industrial areas.'),
      ]),
      html('Part 3 questions for practice', `<b>Learning and skills</b>
• Which skills are most important for young people today? Why?
• Should schools teach practical skills such as cooking or managing money?
• How has technology changed the way adults learn?

<b>Cities and leisure</b>
• Why do some people prefer to relax at home rather than go out?
• What can city governments do to make public spaces more attractive?
• Do you think people have less free time than in the past?

<b>Opinions and change</b>
• Why do people find it difficult to change their opinions?
• How much do the media influence what people think?
• Is it a sign of weakness or strength to change your mind?

<b>Формула ответа в Part 3:</b> мнение → причина → пример → (контраст/вывод). 3–5 предложений.`),
    ],
  },
]
