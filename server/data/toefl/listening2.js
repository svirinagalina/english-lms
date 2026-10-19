import { q } from './helpers.js'

// Listening, practice sets 4–6.

const cr = (prompt, options, answer, explain) => ({ prompt, ...q('', options, answer, explain) })

export const CHOOSE_RESPONSE_2 = [
  {
    task: 'choose-response', title: 'Choose a Response · Practice 4', timeSec: 240,
    items: [
      cr('When are you planning to start your internship?', ['Right after finals in June.', 'At a big tech company.', 'I planned it carefully.', 'It starts with an interview.'], 'Right after finals in June.', '«When…?» → время.'),
      cr('This printer only prints in black and white.', ['The one in the library prints in color.', 'I like black and white films.', 'It printed my essay.', 'White is my favorite color.'], 'The one in the library prints in color.', 'Проблема → решение (где найти цветной принтер).'),
      cr('How about joining us for dinner on Saturday?', ['I\'d love to — what time?', 'I joined last year.', 'Dinner was delicious.', 'On Saturdays I sleep.'], 'I\'d love to — what time?', '«How about…?» — приглашение → согласие и уточнение.'),
      cr('Did the professor accept your late assignment?', ['Yes, but she took off five points.', 'The assignment was on history.', 'I accept your apology.', 'It was very late at night.'], 'Yes, but she took off five points.', 'Yes/No-вопрос → «да» + деталь.'),
      cr('I can\'t decide which elective to take.', ['What are you interested in?', 'Elections are in November.', 'I decided yesterday.', 'Take it easy.'], 'What are you interested in?', 'Сомнение → встречный полезный вопрос. «Elections» — созвучная ловушка.'),
      cr('Excuse me, is anyone using this computer?', ['No, it\'s free.', 'Computers are expensive.', 'I use it for games.', 'Excuse me too.'], 'No, it\'s free.', '«Кто-то пользуется?» → «нет, свободен».'),
      cr('Who do I talk to about changing my room?', ['You should contact the housing office.', 'I changed my room last year.', 'The room is on the third floor.', 'Talk to me later.'], 'You should contact the housing office.', '«Who…?» → кто/какой отдел.'),
      cr('I hear the new dining hall is finally open.', ['Let\'s try it for lunch today.', 'I can hear you.', 'The hall is very long.', 'It opened the door.'], 'Let\'s try it for lunch today.', 'Новость → предложение.'),
    ],
  },
  {
    task: 'choose-response', title: 'Choose a Response · Practice 5', timeSec: 240,
    items: [
      cr('Would you like me to proofread your essay?', ['That would be really helpful, thanks.', 'I would like an essay.', 'Proof is important.', 'I read it twice.'], 'That would be really helpful, thanks.', 'Предложение помощи → благодарность.'),
      cr('Why is the gym closed today?', ['They\'re replacing the floor.', 'It closes at ten.', 'I go to the gym every day.', 'Because I\'m tired.'], 'They\'re replacing the floor.', '«Why…?» → причина.'),
      cr('Haven\'t you already handed in your application?', ['Not yet — I\'m still waiting for a reference letter.', 'I handed it to my friend.', 'The application is online.', 'Yes, I have a hand.'], 'Not yet — I\'m still waiting for a reference letter.', 'Отрицательный вопрос → честный ответ + причина.'),
      cr('The lecture hall is way too cold.', ['I know — I should have brought a sweater.', 'The lecture was interesting.', 'Cold drinks are nice.', 'It\'s the biggest hall.'], 'I know — I should have brought a sweater.', 'Жалоба → согласие.'),
      cr('Which bus goes to the airport?', ['The number 40, from the main gate.', 'It goes every hour.', 'The airport is big.', 'I flew there.'], 'The number 40, from the main gate.', '«Which…?» → конкретный вариант.'),
      cr('Do you mind if I record the lecture?', ['Go ahead, as long as it\'s for your own notes.', 'I don\'t remember the lecture.', 'I recorded a song.', 'Yes, I\'m minding it.'], 'Go ahead, as long as it\'s for your own notes.', '«Do you mind if…?» — просьба разрешения → разрешение с условием.'),
      cr('It looks like it\'s going to rain.', ['Then let\'s study inside today.', 'It looked nice.', 'Rain is water.', 'I\'m going there.'], 'Then let\'s study inside today.', 'Наблюдение → вывод/план.'),
      cr('How many credits are you taking this semester?', ['Fifteen, same as last time.', 'I took a lot of notes.', 'Credit cards are useful.', 'This semester is short.'], 'Fifteen, same as last time.', '«How many…?» → число.'),
    ],
  },
  {
    task: 'choose-response', title: 'Choose a Response · Practice 6', timeSec: 240,
    items: [
      cr('Are you free to meet with your group on Tuesday?', ['Only after four o\'clock.', 'The group is free.', 'Tuesday is a nice day.', 'I met them.'], 'Only after four o\'clock.', 'Вопрос о свободном времени → ограничение по времени.'),
      cr('I just got an email saying my scholarship was renewed!', ['Congratulations — that\'s great news!', 'I renewed my passport.', 'Emails are fast.', 'Scholarships are for students.'], 'Congratulations — that\'s great news!', 'Хорошая новость → поздравление.'),
      cr('Where should I put these boxes?', ['Just leave them by the door.', 'They\'re very heavy boxes.', 'I put them on yesterday.', 'Boxes are made of paper.'], 'Just leave them by the door.', '«Where…?» → место.'),
      cr('Weren\'t you supposed to present today?', ['It got moved to next week.', 'I was supposed to.', 'The present was nice.', 'Today is Monday.'], 'It got moved to next week.', 'Удивление → объяснение изменения. «present» (подарок) — ловушка.'),
      cr('Can you show me how to use the scanner?', ['Sure, it\'s pretty simple.', 'I scanned it.', 'The scanner is new.', 'You can show me.'], 'Sure, it\'s pretty simple.', 'Просьба → согласие.'),
      cr('What did you think of the guest speaker?', ['She was inspiring, but a bit long.', 'She spoke in the main hall.', 'I think so.', 'The guest arrived late.'], 'She was inspiring, but a bit long.', 'Вопрос о мнении → оценка.'),
      cr('Let\'s take a short break.', ['Good idea, I need some coffee.', 'I broke it.', 'The break is long.', 'It\'s very short.'], 'Good idea, I need some coffee.', 'Предложение → согласие.'),
      cr('Is the bookstore still selling used textbooks?', ['Only until the end of the week.', 'Books are for reading.', 'I sold my bike.', 'It\'s a big store.'], 'Only until the end of the week.', 'Yes/No-вопрос → косвенный ответ с ограничением.'),
    ],
  },
]

export const CONVERSATIONS_2 = [
  {
    task: 'conversation', title: 'Conversation · Practice 4', timeSec: 60,
    context: 'Listen to a conversation between two students.',
    script: 'Man: Priya, did you get the email about the group presentation?\nWoman: Yes. It\'s on Monday, right? I thought we had another week.\nMan: So did I. Apparently the professor moved all the presentations forward because of the holiday.\nWoman: Well, I\'ve finished my slides on the history section. What about yours?\nMan: Not even close. I still need data for the charts.\nWoman: Why don\'t we meet tomorrow morning? I can help you find the numbers, and then we can practice the whole thing together.',
    questions: [
      q('What surprised the students?', ['Their presentation date was moved earlier', 'Their professor cancelled the presentation', 'Their group was changed', 'Their topic was rejected'], 'Their presentation date was moved earlier', 'Detail: «moved all the presentations forward».'),
      q('What does the woman offer to do?', ['Help the man finish his part', 'Present the man\'s section', 'Ask the professor for more time', 'Write the history section again'], 'Help the man finish his part', 'Offer: «I can help you find the numbers».'),
    ],
  },
  {
    task: 'conversation', title: 'Conversation · Practice 5', timeSec: 60,
    context: 'Listen to a conversation between a student and a professor.',
    genders: { Student: 'male', Professor: 'female' },
    script: 'Student: Professor Grant, I wanted to ask about my grade on the midterm. I got a C, and I really thought I knew the material.\nProfessor: Let\'s take a look. Hmm, your answers to the multiple-choice questions were mostly right. The problem was the essay question. You described the theory, but you didn\'t apply it to the case study, which is what the question asked.\nStudent: Oh. I guess I didn\'t read the question carefully enough.\nProfessor: It happens. For the final, try underlining the key verbs in each question — "describe," "compare," "apply." And if you want, bring me an outline of a practice essay next week.',
    questions: [
      q('Why did the student get a low grade?', ['He did not do what the essay question asked', 'He got most multiple-choice questions wrong', 'He did not finish the exam', 'He studied the wrong theory'], 'He did not do what the essay question asked', 'Detail: «you didn\'t apply it to the case study».'),
      q('What does the professor suggest?', ['Paying attention to the key words in each question', 'Retaking the midterm', 'Reading a different textbook', 'Skipping the essay question'], 'Paying attention to the key words in each question', 'Advice: «underlining the key verbs».'),
    ],
  },
  {
    task: 'conversation', title: 'Conversation · Practice 6', timeSec: 60,
    context: 'Listen to a conversation between a student and an employee at the campus health center.',
    genders: { Student: 'female', Employee: 'male' },
    script: 'Student: Hi, I\'d like to make an appointment. I\'ve had a sore throat for almost a week.\nEmployee: Okay. The earliest appointment with a doctor is Thursday afternoon. But our nurse has a walk-in clinic today until four, if you\'d like to be seen sooner.\nStudent: Today would be better. Do I need my insurance card?\nEmployee: Just your student ID. Students are covered automatically.\nStudent: Great. I have a class until two-thirty, so I\'ll come right after that.',
    questions: [
      q('Why does the student come to the health center?', ['She has been sick for several days', 'She needs a new insurance card', 'She wants to work as a nurse', 'She lost her student ID'], 'She has been sick for several days', 'Main idea: «I\'ve had a sore throat for almost a week».'),
      q('What will the student most likely do?', ['Visit the walk-in clinic this afternoon', 'Wait for the appointment on Thursday', 'Go to class and skip the clinic', 'Buy medicine at a pharmacy'], 'Visit the walk-in clinic this afternoon', 'Next action: «I\'ll come right after that».'),
    ],
  },
]

export const ANNOUNCEMENTS_2 = [
  {
    task: 'announcement', title: 'Announcement · Practice 4', timeSec: 60,
    context: 'Listen to an announcement in a class.',
    script: 'Professor: Before you go — the course evaluation survey is now open online. It takes about ten minutes, and it\'s completely anonymous; I only see the combined results after final grades are submitted. Your comments really do shape how I teach this course next year. Last year, for example, several of you asked for more practice problems, and that\'s why we now have weekly problem sets. The survey closes next Friday.',
    questions: [
      q('What is the main purpose of the announcement?', ['To encourage students to complete a survey', 'To explain the final exam', 'To introduce weekly problem sets', 'To announce final grades'], 'To encourage students to complete a survey', 'Purpose: survey is open — please complete it.'),
      q('Why does the professor mention the weekly problem sets?', ['To show that student feedback leads to changes', 'To remind students to do their homework', 'To complain about last year\'s students', 'To explain why the survey is anonymous'], 'To show that student feedback leads to changes', 'Purpose of example: отзывы реально меняют курс.'),
    ],
  },
  {
    task: 'announcement', title: 'Announcement · Practice 5', timeSec: 60,
    context: 'Listen to an announcement at the student union.',
    script: 'Announcer: Attention, please. The international food festival, which was scheduled for this afternoon on the main lawn, has been moved indoors to the student union ballroom because of the strong winds. All the food stalls and performances will go ahead as planned, starting at three o\'clock. Volunteers are asked to come to the ballroom at two to help set up the tables. Entry is free, but bring your own reusable cup if you can — we\'re trying to reduce waste.',
    questions: [
      q('Why has the festival been moved?', ['The weather is bad', 'The lawn is being repaired', 'Too many people are expected', 'The performers asked for a stage'], 'The weather is bad', '«because of the strong winds».'),
      q('What are attendees asked to bring?', ['A reusable cup', 'An entry ticket', 'Food to share', 'A student ID'], 'A reusable cup', '«bring your own reusable cup».'),
    ],
  },
  {
    task: 'announcement', title: 'Announcement · Practice 6', timeSec: 60,
    context: 'Listen to an announcement at the beginning of a lab session.',
    script: 'Lab instructor: Good morning. Before we begin today\'s experiment, a safety reminder. Last week, two people left their gas burners on after leaving the bench. That\'s extremely dangerous. From now on, before you leave your station — even for a minute — turn the burner off and tell your partner. Also, the eyewash station has been moved; it\'s now next to the back door, not by the windows. Please take a moment to find it before we start.',
    questions: [
      q('What problem does the instructor mention?', ['Some students left equipment running', 'Some students broke the eyewash station', 'Some students arrived late', 'Some students did not wear goggles'], 'Some students left equipment running', '«left their gas burners on».'),
      q('What does the instructor ask students to do before starting?', ['Find the new location of the eyewash station', 'Open the windows', 'Change partners', 'Clean their benches'], 'Find the new location of the eyewash station', '«take a moment to find it before we start».'),
    ],
  },
]

export const ACADEMIC_TALKS_2 = [
  {
    task: 'academic-talk', title: 'Academic Talk · Practice 4', timeSec: 100,
    context: 'Listen to part of a talk in a geology class.',
    script: 'Professor: Let\'s talk about how caves form. Most large caves are found in limestone, a rock made mostly of calcium carbonate. Now, rainwater isn\'t pure water. As it falls through the air and soaks through soil, it picks up carbon dioxide and becomes slightly acidic — think of it as a very weak version of soda water.\nThis weak acid slowly dissolves limestone. It follows cracks in the rock, widening them over thousands of years until they become passages and chambers. That\'s why caves often form along existing fractures.\nThe process can also run in reverse. When water dripping from a cave ceiling loses some of its carbon dioxide to the air, calcium carbonate comes back out of the water and is deposited. Drop by drop, this builds the formations we call stalactites, hanging from the ceiling, and stalagmites, rising from the floor.',
    questions: [
      q('What is the talk mainly about?', ['How limestone caves and their formations develop', 'Why rainwater is harmful to people', 'How soda water is made', 'Where the largest caves in the world are'], 'How limestone caves and their formations develop', 'Main idea.'),
      q('Why does the professor mention soda water?', ['To help explain that rainwater is slightly acidic', 'To describe a laboratory experiment', 'To show that caves contain gas', 'To explain how stalactites taste'], 'To help explain that rainwater is slightly acidic', 'Purpose: сравнение для понятности.'),
      q('According to the professor, why do caves often form along cracks?', ['Acidic water flows through cracks and widens them', 'Cracks are where limestone is hardest', 'Animals dig along cracks', 'Earthquakes create caves directly'], 'Acidic water flows through cracks and widens them', 'Detail.'),
      q('How are stalactites formed?', ['Calcium carbonate is deposited from dripping water', 'Limestone is dissolved by acid', 'Rocks fall from the ceiling', 'Water freezes on the ceiling'], 'Calcium carbonate is deposited from dripping water', 'Detail: обратный процесс — осаждение.'),
    ],
  },
  {
    task: 'academic-talk', title: 'Academic Talk · Practice 5', timeSec: 100,
    context: 'Listen to part of a talk in a business class.',
    script: 'Professor: Today I want to introduce a concept called the "decoy effect." Imagine a coffee shop that sells a small coffee for three dollars and a large one for five. Many customers choose the small one. Now the shop adds a medium size for four dollars and seventy cents. Suddenly, a lot more people buy the large. Why? The medium is the decoy. Almost no one buys it, but it makes the large look like a great deal by comparison — only thirty cents more!\nThe key idea is that people rarely judge value in absolute terms. We compare options with each other. Companies use this in subscriptions, restaurant menus, even real estate. As consumers, the lesson is to ask yourself: would I still choose this option if the decoy weren\'t there?',
    questions: [
      q('What is the main topic of the talk?', ['How an extra option can influence people\'s choices', 'Why coffee prices are rising', 'How to open a coffee shop', 'Why people prefer small sizes'], 'How an extra option can influence people\'s choices', 'Main idea: decoy effect.'),
      q('What is the role of the medium coffee in the example?', ['It makes the large coffee seem like better value', 'It is the most popular choice', 'It replaces the small coffee', 'It brings the shop the most profit'], 'It makes the large coffee seem like better value', 'Detail/function of example.'),
      q('According to the professor, how do people usually judge value?', ['By comparing options with one another', 'By looking only at the lowest price', 'By asking other customers', 'By considering quality alone'], 'By comparing options with one another', '«We compare options with each other».'),
      q('What advice does the professor give consumers?', ['Consider whether you would choose the same thing without the decoy', 'Always buy the largest size', 'Avoid subscriptions completely', 'Buy the middle option'], 'Consider whether you would choose the same thing without the decoy', 'Совет в конце лекции.'),
    ],
  },
  {
    task: 'academic-talk', title: 'Academic Talk · Practice 6', timeSec: 100,
    context: 'Listen to part of a talk in a literature class.',
    genders: { Professor: 'male' },
    script: 'Professor: In the nineteenth century, many of the most famous novels were not first published as complete books. Charles Dickens, for instance, published most of his novels in monthly installments, each one about thirty pages long and sold cheaply. Readers waited eagerly for the next part, a bit like waiting for the next episode of a television series today.\nThis format shaped the writing itself. Dickens often ended an installment at a moment of suspense to make sure readers would buy the next one. And because he was writing while earlier parts were already being read, he could respond to his audience. When sales of one novel dropped, he famously sent a character to America to revive interest.\nSo when we read these novels today as single volumes, it\'s worth remembering that they were designed to be read slowly, over a year or more, with long pauses in between.',
    questions: [
      q('What is the talk mainly about?', ['How publishing novels in parts influenced how they were written', 'The life of Charles Dickens in America', 'Why nineteenth-century books were expensive', 'How television series are produced'], 'How publishing novels in parts influenced how they were written', 'Main idea.'),
      q('Why does the professor compare installments to a television series?', ['To help students understand how readers experienced the novels', 'To argue that novels are better than television', 'To explain how Dickens earned money', 'To show that Dickens wrote for television'], 'To help students understand how readers experienced the novels', 'Purpose of comparison.'),
      q('According to the professor, why did Dickens often end an installment with suspense?', ['To encourage readers to buy the next part', 'Because he did not know how the story would end', 'Because his editor required it', 'To make the books shorter'], 'To encourage readers to buy the next part', 'Detail.'),
      q('What does the example of a character sent to America show?', ['Dickens changed his stories in response to his readers', 'Dickens traveled to America often', 'Readers preferred stories set in England', 'Dickens planned every detail in advance'], 'Dickens changed his stories in response to his readers', 'Inference: реакция на падение продаж.'),
    ],
  },
]
