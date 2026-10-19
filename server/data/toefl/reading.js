import { q, cw } from './helpers.js'

// Reading: Complete the Words, Read in Daily Life, Read an Academic Passage.

export const COMPLETE_WORDS = [
  cw('Complete the Words · Practice 1',
    'Honeybees communicate the location of food through a movement known as the waggle dance. When a forager returns {{to}} the hive, {{she}} {{moves}} in a figure-eight {{pattern}} on the comb. The {{angle}} of the straight run {{shows}} the direction of {{the}} flowers relative to {{the}} sun, and the {{length}} of the run {{indicates}} how far away they are.',
    { about: 'A short academic paragraph about honeybees. The first sentence is complete; ten words in the rest have lost their second half.' }),
  cw('Complete the Words · Practice 2',
    'Glaciers are slow rivers of ice that form where more snow falls in winter than melts in summer. Over {{many}} years, the snow is {{pressed}} into dense ice that {{begins}} to flow under its {{own}} weight. As a glacier {{moves}}, it scrapes the ground {{beneath}} it and carries rocks {{over}} great distances, leaving {{behind}} valleys and hills {{that}} remain long after the ice {{has}} melted.'),
  cw('Complete the Words · Practice 3',
    'The printing press changed how knowledge spread across Europe in the fifteenth century. Before {{its}} invention, books were copied {{by}} hand, which made them {{rare}} and expensive. Printed books {{could}} be produced quickly and {{in}} large numbers, so more {{people}} were able to {{read}} the same texts. This {{helped}} new ideas in science {{and}} religion travel faster {{than}} ever before.'),
]

export const DAILY_LIFE = [
  {
    task: 'daily-life', title: 'Read in Daily Life · Practice 1', timeSec: 150,
    passageTitle: 'Email',
    passage: '<b>From:</b> Campus Housing Office\n<b>To:</b> All residents of Maple Hall\n<b>Subject:</b> Water shut-off on Thursday\n\nDear residents,\n\nPlumbers will replace the main water pipe in Maple Hall this Thursday. Water will be turned off from 9 a.m. to 3 p.m. Showers and kitchens on all floors will not be available during this time.\n\nResidents who need to shower can use the facilities at the Recreation Center, which will open one hour earlier than usual on Thursday. Please show your student ID at the front desk.\n\nWe apologize for the inconvenience.\nCampus Housing Office',
    questions: [
      q('What is the main purpose of the email?', ['To announce a temporary interruption of a service', 'To invite residents to the Recreation Center', 'To ask residents to report plumbing problems', 'To explain new rules for using the kitchens'], 'To announce a temporary interruption of a service',
        'Главная мысль — в теме и первом абзаце: воду отключат на время ремонта. Recreation Center — лишь деталь (где помыться).'),
      q('What is suggested about the Recreation Center on Thursday?', ['It will be closed for repairs', 'It will open at an earlier time than normal', 'It will be available only to Maple Hall residents', 'It will offer free meals'], 'It will open at an earlier time than normal',
        '«will open one hour earlier than usual» = откроется раньше обычного. Это перефраз — типичный приём TOEFL.'),
      q('What must residents bring to the Recreation Center?', ['A towel', 'A room key', 'A student ID', 'A letter from the Housing Office'], 'A student ID',
        'Прямой ответ в тексте: «Please show your student ID at the front desk».'),
    ],
  },
  {
    task: 'daily-life', title: 'Read in Daily Life · Practice 2', timeSec: 150,
    passageTitle: 'Notice',
    passage: '<b>LIBRARY STUDY ROOMS — NEW BOOKING SYSTEM</b>\n\nStarting October 1, study rooms on the 3rd floor can only be reserved online through the library website. Paper sign-up sheets will no longer be used.\n\n• Rooms may be booked up to 7 days in advance.\n• Each student may hold a maximum of 2 hours per day.\n• If you are more than 15 minutes late, your booking will be cancelled and the room released to others.\n\nQuestions? Ask at the Information Desk (2nd floor).',
    questions: [
      q('What change does the notice describe?', ['Study rooms have moved to another floor', 'Rooms must now be reserved on a website', 'The library will close earlier in October', 'Students can now book rooms for a whole day'], 'Rooms must now be reserved on a website',
        'Суть объявления: бронирование только онлайн, бумажные листы отменены.'),
      q('According to the notice, what happens if a student arrives 20 minutes late?', ['They must pay a fine', 'They lose their reservation', 'They can use the room for only one hour', 'They must ask at the Information Desk'], 'They lose their reservation',
        '«more than 15 minutes late → your booking will be cancelled». 20 минут > 15.'),
    ],
  },
  {
    task: 'daily-life', title: 'Read in Daily Life · Practice 3', timeSec: 180,
    passageTitle: 'Text messages',
    passage: '<b>Maya (10:42):</b> Hey! Are you still coming to the bio lab review tonight?\n\n<b>Leo (10:45):</b> Planning to. Same room as last time?\n\n<b>Maya (10:46):</b> Nope — they moved us to Room 214 in the Science Annex. The old room\'s projector is broken.\n\n<b>Leo (10:47):</b> Got it. I might be 10 min late, my shift at the café ends at 7.\n\n<b>Maya (10:48):</b> No worries. Can you grab the lab manual from the front office on your way? Mine\'s at home.\n\n<b>Leo (10:49):</b> Sure thing 👍',
    questions: [
      q('Why was the review session moved?', ['The original room was too small', 'Equipment in the original room does not work', 'The Science Annex is closer to the café', 'Maya forgot to book the original room'], 'Equipment in the original room does not work',
        '«The old room\'s projector is broken» — проектор = equipment.'),
      q('What does Leo mean when he writes "Sure thing"?', ['He is not sure he can come', 'He agrees to bring the lab manual', 'He thinks the room is correct', 'He wants Maya to bring the manual'], 'He agrees to bring the lab manual',
        '«Sure thing» — разговорное «конечно, без проблем». Это вопрос на неформальный язык.'),
      q('What can be inferred about Leo?', ['He works at a café', 'He has already read the lab manual', 'He lives in the Science Annex', 'He usually arrives early'], 'He works at a café',
        '«my shift at the café ends at 7» → он там работает (вывод, а не прямая фраза).'),
    ],
  },
]

export const ACADEMIC_PASSAGES = [
  {
    task: 'academic-passage', title: 'Academic Passage · Practice 1', timeSec: 420,
    passageTitle: 'Urban Heat Islands',
    passage: 'Cities are often several degrees warmer than the countryside around them, a phenomenon known as the urban heat island. The difference is usually greatest at night. During the day, asphalt, concrete, and brick absorb large amounts of solar energy; after sunset, these materials release the stored heat slowly, keeping the air above them warm.\n\nSeveral other factors contribute to the effect. Cities have fewer trees and less open soil, so less water evaporates to cool the surface. Tall buildings trap heat between them and block winds that might carry it away. In addition, cars, air conditioners, and factories release heat directly into the air.\n\nThe consequences are not trivial. Higher temperatures increase the demand for electricity, worsen air quality, and can be dangerous for elderly residents during heat waves. As a result, many cities are now experimenting with solutions such as reflective "cool roofs," expanded parks, and street trees, which can lower local temperatures by providing shade and moisture.',
    questions: [
      q('The word "trivial" in the passage is closest in meaning to', ['unimportant', 'sudden', 'expensive', 'predictable'], 'unimportant',
        'Vocabulary question. «The consequences are not trivial» — «последствия не пустяковые». trivial = unimportant.'),
      q('According to paragraph 1, why is the urban heat island effect strongest at night?', ['Building materials slowly give off heat they absorbed during the day', 'Cars and factories are most active at night', 'Winds are weaker in cities after sunset', 'More solar energy reaches cities at night'], 'Building materials slowly give off heat they absorbed during the day',
        'Detail question: «after sunset, these materials release the stored heat slowly».'),
      q('Which of the following is NOT mentioned as a cause of the urban heat island?', ['Fewer trees and less open soil', 'Buildings that block winds', 'Heat released by vehicles and machines', 'Pollution from distant power plants'], 'Pollution from distant power plants',
        'Negative factual (NOT). Три варианта есть во 2-м абзаце; про удалённые электростанции ничего не сказано.'),
      q('Why does the author mention elderly residents?', ['To give an example of a group harmed by higher temperatures', 'To explain why cities use more electricity', 'To argue that older people should leave cities', 'To show that heat waves are becoming rare'], 'To give an example of a group harmed by higher temperatures',
        'Purpose question: автор показывает, что последствия серьёзны, — пример уязвимой группы.'),
      q('What can be inferred about "cool roofs"?', ['They reflect sunlight instead of absorbing it', 'They are more common in the countryside', 'They are made of asphalt and brick', 'They increase the demand for electricity'], 'They reflect sunlight instead of absorbing it',
        'Inference: «reflective cool roofs» в противовес материалам, которые поглощают энергию (1-й абзац).'),
    ],
  },
  {
    task: 'academic-passage', title: 'Academic Passage · Practice 2', timeSec: 420,
    passageTitle: 'The Domestication of Dogs',
    passage: 'Dogs were the first animals that humans domesticated, but exactly when and how this happened remains debated. Genetic studies suggest that dogs descended from a population of wolves that lived more than 15,000 years ago, long before humans began farming.\n\nOne popular explanation is that some wolves began scavenging near human camps, feeding on leftover bones and scraps. Wolves that were less fearful of people had an advantage, because they could reach this food without running away. Over many generations, these tamer animals became a separate population that depended on humans.\n\nHumans, in turn, benefited from the relationship. Dogs could warn of approaching danger, help track animals during hunts, and later guard livestock. Some researchers argue that this partnership may even have helped humans survive harsh periods of the last Ice Age. Whatever the exact process, the result was an animal that is unusually skilled at reading human gestures, such as pointing — an ability that even chimpanzees, our closest relatives, rarely show.',
    questions: [
      q('The word "scavenging" in the passage is closest in meaning to', ['searching for discarded food', 'hunting in groups', 'traveling long distances', 'building shelters'], 'searching for discarded food',
        'Значение из контекста: «feeding on leftover bones and scraps» — объедки. scavenge = искать отбросы/падаль.'),
      q('According to paragraph 2, why did less fearful wolves have an advantage?', ['They could get food near people without fleeing', 'They were stronger than other wolves', 'Humans fed them deliberately', 'They hunted more successfully alone'], 'They could get food near people without fleeing',
        '«they could reach this food without running away». flee = run away.'),
      q('Which of the following best expresses the meaning of the sentence "Humans, in turn, benefited from the relationship" in paragraph 3?', ['People also gained advantages from living with dogs', 'People later turned dogs into hunters of wolves', 'People benefited more than dogs did', 'People started the relationship on purpose'], 'People also gained advantages from living with dogs',
        '«in turn» = «в свою очередь», т.е. польза была и людям тоже. Варианты про «больше пользы» и «специально» добавляют то, чего в тексте нет.'),
      q('Why does the author mention chimpanzees?', ['To emphasize how unusual dogs\' ability to understand gestures is', 'To show that chimpanzees were domesticated earlier', 'To compare the intelligence of wolves and apes', 'To explain why dogs descended from wolves'], 'To emphasize how unusual dogs\' ability to understand gestures is',
        'Purpose: даже ближайшие родственники человека этого почти не умеют — значит, у собак навык редкий.'),
      q('What does the passage suggest about the timing of dog domestication?', ['It happened before the development of agriculture', 'It happened after humans began keeping livestock', 'It is known exactly from genetic studies', 'It took place during a single generation'], 'It happened before the development of agriculture',
        '«more than 15,000 years ago, long before humans began farming». Farming = agriculture. Вариант «known exactly» противоречит «remains debated».'),
    ],
  },
  {
    task: 'academic-passage', title: 'Academic Passage · Practice 3', timeSec: 420,
    passageTitle: 'Why Some Languages Disappear',
    passage: 'Linguists estimate that about 7,000 languages are spoken today, yet nearly half of them may disappear by the end of this century. A language is considered endangered when children no longer learn it as their first language at home.\n\nLanguage loss rarely happens because a community simply forgets its language. More often, speakers shift to a more widely used language for economic or social reasons. Parents may believe that their children will find better jobs if they speak the national language, and schools, television, and the internet reinforce this choice. Within two or three generations, the older language may survive only among the elderly.\n\nThe disappearance of a language is more than the loss of words. Languages encode knowledge about local plants, animals, and landscapes, as well as stories and ways of thinking. For this reason, communities and researchers are working to document endangered languages and to revive them. Some projects, such as "language nests" where young children are cared for entirely in the heritage language, have helped increase the number of young speakers.',
    questions: [
      q('According to paragraph 1, when is a language considered endangered?', ['When children stop learning it at home', 'When it has fewer than 7,000 speakers', 'When it is not taught in schools', 'When it has no written form'], 'When children stop learning it at home',
        'Определение дано прямо: «when children no longer learn it as their first language at home».'),
      q('The word "reinforce" in the passage is closest in meaning to', ['strengthen', 'question', 'replace', 'delay'], 'strengthen',
        'Школа и интернет «подкрепляют» выбор родителей. reinforce = strengthen.'),
      q('According to paragraph 2, what is the most common reason languages are lost?', ['Speakers choose another language for practical advantages', 'Communities forget their language over time', 'Governments ban minority languages', 'Older speakers refuse to teach the language'], 'Speakers choose another language for practical advantages',
        '«speakers shift to a more widely used language for economic or social reasons». Вариант «forget their language» прямо опровергнут: «rarely happens because a community simply forgets».'),
      q('Why does the author mention local plants, animals, and landscapes?', ['To show that languages contain valuable knowledge', 'To explain why languages change their vocabulary', 'To describe where endangered languages are spoken', 'To argue that new words are needed in science'], 'To show that languages contain valuable knowledge',
        'Purpose: потеря языка — это потеря знаний, которые он хранит.'),
      q('What can be inferred about "language nests"?', ['They expose children to the heritage language from an early age', 'They are designed mainly for elderly speakers', 'They teach the national language to children', 'They record stories for researchers'], 'They expose children to the heritage language from an early age',
        '«young children are cared for entirely in the heritage language» → дети с раннего возраста погружены в язык.'),
    ],
  },
]
