import { q, cw } from './helpers.js'

// Reading, practice sets 4–6.

export const COMPLETE_WORDS_2 = [
  cw('Complete the Words · Practice 4',
    'Sleep plays an essential role in how the brain stores new information. During {{deep}} sleep, the brain replays patterns {{of}} activity from the day, which {{helps}} move memories from short-term {{to}} long-term storage. Students who {{sleep}} well after studying often {{remember}} more than those who {{stay}} awake all night, even {{if}} they spent the same {{amount}} of time {{reviewing}}.'),
  cw('Complete the Words · Practice 5',
    'The Silk Road was not a single road but a network of trade routes linking China with the Mediterranean. Merchants {{carried}} silk, spices, and precious {{metals}} across deserts and mountains, {{but}} they also exchanged ideas. {{Religions}}, languages, and technologies such {{as}} papermaking spread along these {{routes}}, connecting cultures that had {{little}} direct contact before. Many {{cities}} along the way became {{wealthy}} centers {{of}} learning.'),
  cw('Complete the Words · Practice 6',
    'Wind turbines turn the energy of moving air into electricity. When the wind blows, {{it}} pushes the long blades, which {{spin}} a shaft connected to a {{generator}}. Engineers place turbines {{in}} open areas or at sea, {{where}} winds are stronger and {{more}} steady. Although turbines produce {{no}} pollution while running, some {{people}} object to the noise {{and}} to the way they {{change}} the landscape.'),
]

export const DAILY_LIFE_2 = [
  {
    task: 'daily-life', title: 'Read in Daily Life · Practice 4', timeSec: 150,
    passageTitle: 'Advertisement',
    passage: '<b>PART-TIME TUTORS WANTED — Math Learning Center</b>\n\nAre you good at calculus or statistics? The Math Learning Center is hiring student tutors for the spring semester.\n\n• 6–10 hours per week, flexible schedule\n• $16 per hour\n• Must have earned an A or B+ in the course you tutor\n\nTraining is held on January 15. To apply, send a short cover letter and your unofficial transcript to mlc@university.edu by December 20.',
    questions: [
      q('What is the purpose of the advertisement?', ['To recruit students to help others with math', 'To advertise a new statistics course', 'To announce a math competition', 'To offer free tutoring to struggling students'], 'To recruit students to help others with math',
        'Заголовок «Tutors wanted» + «is hiring student tutors».'),
      q('Who is eligible to apply?', ['A student with a B+ in calculus', 'Any student who likes math', 'A student who received a C in statistics', 'Only graduate students'], 'A student with a B+ in calculus',
        'Условие: «Must have earned an A or B+ in the course you tutor».'),
      q('What must applicants send?', ['A cover letter and a transcript', 'A letter from a professor', 'A math test', 'Their class schedule'], 'A cover letter and a transcript',
        '«send a short cover letter and your unofficial transcript».'),
    ],
  },
  {
    task: 'daily-life', title: 'Read in Daily Life · Practice 5', timeSec: 150,
    passageTitle: 'Email',
    passage: '<b>From:</b> Prof. Hannah Ortiz\n<b>To:</b> PSY 210 students\n<b>Subject:</b> Tomorrow\'s class\n\nHi all,\n\nI\'m sorry, but I have to cancel tomorrow\'s lecture — I\'ve come down with a bad cold. Please use the time to read Chapter 7 carefully, since we\'ll start Thursday\'s class with a short quiz on it.\n\nThe due date for your lab report stays the same (Friday at 5 p.m.). My office hours are moved online this week; the link is on the course page.\n\nHannah',
    questions: [
      q('Why is the professor writing?', ['To cancel a class and give instructions', 'To change the due date of a report', 'To invite students to her office', 'To announce the results of a quiz'], 'To cancel a class and give instructions',
        'Основная цель — отмена лекции + что делать вместо неё.'),
      q('What does the professor mean by "I\'ve come down with a bad cold"?', ['She has become ill', 'She has to travel', 'She is feeling tired after work', 'She has a family emergency'], 'She has become ill',
        '«come down with» = заболеть (фразовый глагол).'),
      q('What will happen on Thursday?', ['Students will take a short test', 'The lab report is due', 'Office hours will be held in person', 'The lecture will be cancelled'], 'Students will take a short test',
        '«we\'ll start Thursday\'s class with a short quiz». quiz = short test.'),
    ],
  },
  {
    task: 'daily-life', title: 'Read in Daily Life · Practice 6', timeSec: 120,
    passageTitle: 'Schedule',
    passage: '<b>CAMPUS SHUTTLE — WEEKEND SERVICE</b>\n\nSaturday: every 30 min, 8:00 a.m. – 10:00 p.m.\nSunday: every hour, 10:00 a.m. – 6:00 p.m.\n\nStops: Main Gate → Library → Stadium → Downtown Station\n\nNote: On home game days, the Stadium stop is skipped. Use the Library stop and walk 5 minutes.',
    questions: [
      q('A student wants to take the shuttle at 8:00 p.m. on Sunday. What is true?', ['No shuttle runs at that time', 'The shuttle comes every 30 minutes', 'The shuttle comes every hour', 'The shuttle stops only at the Library'], 'No shuttle runs at that time',
        'В воскресенье шаттл ходит только до 18:00.'),
      q('What should passengers do on home game days if they want to go to the stadium?', ['Get off at the Library and walk', 'Take the shuttle from Downtown Station', 'Wait for a special bus', 'Ride to the Main Gate'], 'Get off at the Library and walk',
        '«the Stadium stop is skipped. Use the Library stop and walk».'),
    ],
  },
]

export const ACADEMIC_PASSAGES_2 = [
  {
    task: 'academic-passage', title: 'Academic Passage · Practice 4', timeSec: 420,
    passageTitle: 'The Origins of Writing',
    passage: 'Writing was invented independently in at least three places: Mesopotamia, China, and Mesoamerica. The earliest known system appeared in Mesopotamia around 3200 BCE, and it did not begin as a way to record stories or laws. Instead, it grew out of accounting. Officials pressed small symbols into clay tablets to keep track of grain, livestock, and other goods.\n\nAt first, each symbol represented a specific object, such as a sheep or a jar of oil. Over time, however, scribes began to use some symbols for their sounds rather than their meanings. This allowed them to write names, verbs, and abstract ideas that could not easily be drawn.\n\nBecause learning hundreds of symbols took years, writing remained a specialized skill for centuries. It was only with the development of alphabets, which use a small number of signs for individual sounds, that reading and writing could spread more widely through society.',
    questions: [
      q('According to paragraph 1, why was writing first developed in Mesopotamia?', ['To keep records of goods', 'To record religious stories', 'To write down laws', 'To send messages to other cities'], 'To keep records of goods',
        '«it grew out of accounting… to keep track of grain, livestock». Варианты про истории и законы прямо отвергнуты.'),
      q('The word "abstract" in the passage is closest in meaning to', ['not physical', 'very old', 'difficult to pronounce', 'commonly used'], 'not physical',
        'Абстрактные идеи нельзя нарисовать — их нельзя увидеть или потрогать.'),
      q('What was the main advantage of using symbols for their sounds?', ['It made it possible to write ideas that were hard to draw', 'It reduced the number of clay tablets needed', 'It made writing faster to learn', 'It allowed officials to count more goods'], 'It made it possible to write ideas that were hard to draw',
        '«This allowed them to write names, verbs, and abstract ideas that could not easily be drawn».'),
      q('Why does the author mention that learning hundreds of symbols took years?', ['To explain why few people could write for a long time', 'To show that scribes were highly paid', 'To argue that early writing was inefficient for accounting', 'To compare Mesopotamia with China'], 'To explain why few people could write for a long time',
        'Purpose: долгое обучение → письмо оставалось навыком немногих.'),
      q('What can be inferred about alphabets?', ['They are easier to learn than systems with hundreds of symbols', 'They were invented before writing in Mesopotamia', 'They use a separate symbol for every object', 'They were used only for accounting'], 'They are easier to learn than systems with hundreds of symbols',
        'Inference: «small number of signs» → легче выучить → письмо распространилось.'),
    ],
  },
  {
    task: 'academic-passage', title: 'Academic Passage · Practice 5', timeSec: 420,
    passageTitle: 'Bird Migration and Weather',
    passage: 'Every year, billions of birds migrate between their breeding grounds and the places where they spend the winter. For many species, the timing of departure is controlled mainly by changes in day length, which trigger hormonal changes that prepare the birds for long flights. Birds eat more and store fat, which serves as fuel during the journey.\n\nHowever, the exact day a bird leaves is often influenced by weather. Many songbirds wait for favorable winds, departing on nights when the wind blows in the direction they want to travel. Flying with a tailwind can cut the energy cost of a journey significantly, while a strong headwind can force birds to land and wait.\n\nClimate change is complicating this system. In some regions, spring now arrives earlier than it did decades ago, but birds that rely on day length still leave at the same time. As a result, they may arrive after the peak in insects that their young depend on — a problem biologists call a "mismatch."',
    questions: [
      q('According to paragraph 1, what mainly determines when many birds prepare to migrate?', ['Changes in day length', 'The arrival of cold weather', 'The direction of the wind', 'The amount of food available'], 'Changes in day length',
        '«timing of departure is controlled mainly by changes in day length».'),
      q('The word "favorable" in the passage is closest in meaning to', ['helpful', 'strong', 'unusual', 'warm'], 'helpful',
        'Благоприятный ветер помогает: дует туда, куда птице нужно.'),
      q('According to paragraph 2, what can a strong headwind cause?', ['It can make birds stop their journey for a while', 'It can help birds save energy', 'It can make birds change their destination', 'It can make birds store more fat'], 'It can make birds stop their journey for a while',
        '«a strong headwind can force birds to land and wait».'),
      q('Which of the following is NOT mentioned in the passage?', ['Birds following the coastline', 'Birds storing fat before migration', 'Birds waiting for good winds', 'Spring arriving earlier in some regions'], 'Birds following the coastline',
        'Про береговую линию в тексте ничего нет.'),
      q('What is the "mismatch" described in paragraph 3?', ['Birds arriving after the time when food for their young is most plentiful', 'Birds leaving before they have stored enough fat', 'Birds flying against the wind', 'Birds spending the winter in the wrong region'], 'Birds arriving after the time when food for their young is most plentiful',
        'Mismatch — птицы прилетают после пика насекомых, которыми кормят птенцов.'),
    ],
  },
  {
    task: 'academic-passage', title: 'Academic Passage · Practice 6', timeSec: 420,
    passageTitle: 'Why We Procrastinate',
    passage: 'Nearly everyone puts off unpleasant tasks from time to time, but psychologists distinguish ordinary delay from procrastination: voluntarily delaying an intended action despite expecting to be worse off for the delay. In other words, procrastinators know the delay will hurt them, yet they delay anyway.\n\nA common belief is that procrastination results from laziness or poor time management. Research suggests a different explanation. Procrastination appears to be primarily a way of managing emotions. When a task makes us feel anxious, bored, or insecure, avoiding it brings immediate relief. Because that relief is rewarding, the habit of avoidance is reinforced.\n\nThis view has practical implications. Simply buying a new planner may do little for a chronic procrastinator. Strategies that address emotions tend to work better — for example, breaking a task into very small first steps, or treating oneself with self-compassion rather than harsh criticism after a delay, which studies show reduces future procrastination.',
    questions: [
      q('According to paragraph 1, what distinguishes procrastination from ordinary delay?', ['The person expects the delay to have negative consequences', 'The person forgets about the task', 'The task is very difficult', 'Someone else forces the delay'], 'The person expects the delay to have negative consequences',
        'Определение: «despite expecting to be worse off for the delay».'),
      q('What does the author say about the belief that procrastination results from laziness?', ['Research supports a different explanation', 'It is completely correct', 'It explains most cases', 'It has never been tested'], 'Research supports a different explanation',
        '«Research suggests a different explanation».'),
      q('The word "reinforced" in the passage is closest in meaning to', ['strengthened', 'punished', 'questioned', 'forgotten'], 'strengthened',
        'Облегчение «вознаграждает» → привычка закрепляется.'),
      q('Why does the author mention buying a new planner?', ['To give an example of a strategy that does not address the real cause', 'To recommend a useful tool', 'To show that procrastinators spend too much money', 'To describe a study about planning'], 'To give an example of a strategy that does not address the real cause',
        'Planner — про управление временем, а причина, по тексту, — эмоции.'),
      q('Which strategy would the author most likely recommend?', ['Starting with a very small step and being kind to oneself', 'Setting stricter deadlines and criticizing oneself', 'Avoiding tasks that cause anxiety', 'Working on several tasks at once'], 'Starting with a very small step and being kind to oneself',
        'Последний абзац: маленькие первые шаги и self-compassion.'),
    ],
  },
]
