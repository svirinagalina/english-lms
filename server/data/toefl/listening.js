import { q } from './helpers.js'

// Listening: Choose a Response, Conversation, Announcement, Academic Talk.
// Scripts are "Speaker: line"; scripts/generate-toefl-audio.js voices them.

const cr = (prompt, options, answer, explain) => ({ prompt, ...q('', options, answer, explain) })

export const CHOOSE_RESPONSE = [
  {
    task: 'choose-response', title: 'Choose a Response · Practice 1', timeSec: 240,
    items: [
      cr('Have you finished the reading for Professor Lee\'s class?', ['Almost — I have one chapter left.', 'She teaches on Tuesdays.', 'The library is on the left.', 'I\'ll read it to you.'], 'Almost — I have one chapter left.', 'Вопрос о том, закончил ли — ответ «почти, осталась глава». Остальные — ловушки по словам (Professor, read).'),
      cr('Do you know where I can print my essay?', ['There are printers in the computer lab.', 'I already wrote mine.', 'It\'s due on Friday.', 'Yes, it was very interesting.'], 'There are printers in the computer lab.', 'Вопрос «где?» → место.'),
      cr('Why don\'t we meet after lunch instead?', ['Sure, that works better for me.', 'Because I was hungry.', 'I had pasta.', 'We met last week.'], 'Sure, that works better for me.', '«Why don\'t we…?» — это предложение, а не вопрос о причине. Ответ — согласие. Вариант с because — ловушка.'),
      cr('The bus to the stadium has been cancelled.', ['Oh no — then we should take a taxi.', 'The stadium is very large.', 'I\'ll cancel my subscription.', 'It leaves every hour.'], 'Oh no — then we should take a taxi.', 'Утверждение о проблеме → реакция и решение.'),
      cr('Would you mind closing the window?', ['Not at all.', 'Yes, it\'s a nice window.', 'I don\'t mind the rain.', 'It closes at five.'], 'Not at all.', '«Would you mind…?» — вежливая просьба. «Not at all» = «конечно, не против».'),
      cr('I can\'t find my lab partner anywhere.', ['Have you tried texting her?', 'The lab is very modern.', 'I found it yesterday.', 'Partners are assigned in pairs.'], 'Have you tried texting her?', 'На жалобу — полезный совет.'),
      cr('Is the career fair this week or next?', ['It\'s next Thursday.', 'It was fair to everyone.', 'I want to be an engineer.', 'Every week.'], 'It\'s next Thursday.', 'Альтернативный вопрос → выбор одного варианта. «fair» в ответе «It was fair to everyone» — омоним-ловушка.'),
      cr('How did your presentation go?', ['Better than I expected!', 'By bus.', 'It goes on Monday.', 'I presented it to them.'], 'Better than I expected!', '«How did it go?» = «как прошло?» → оценка.'),
    ],
  },
  {
    task: 'choose-response', title: 'Choose a Response · Practice 2', timeSec: 240,
    items: [
      cr('Could you remind me when the assignment is due?', ['It\'s due next Monday at noon.', 'I\'ll remind myself.', 'It was a hard assignment.', 'Yes, I could.'], 'It\'s due next Monday at noon.', 'Просьба напомнить срок → назвать срок.'),
      cr('I\'m thinking about dropping my statistics course.', ['Have you talked to your advisor first?', 'Statistics are numbers.', 'I dropped my phone.', 'The course starts at nine.'], 'Have you talked to your advisor first?', 'Сообщение о планах → совет. «I dropped my phone» — ловушка по слову.'),
      cr('Didn\'t the professor say the quiz was optional?', ['I think so, but I\'m taking it anyway.', 'She said it loudly.', 'The quiz has ten questions.', 'No, he is a teacher.'], 'I think so, but I\'m taking it anyway.', 'Отрицательный вопрос-уточнение → подтверждение + своё решение.'),
      cr('The cafeteria has run out of vegetarian options again.', ['That\'s the third time this week!', 'I ran there quickly.', 'Options are good to have.', 'It opens at eight.'], 'That\'s the third time this week!', 'Жалоба → эмоциональная реакция согласия.'),
      cr('Who\'s in charge of booking the room for the club meeting?', ['I think Daniel volunteered.', 'It\'s in Room 12.', 'Meetings are on Fridays.', 'I booked a flight.'], 'I think Daniel volunteered.', 'Вопрос «кто?» → человек.'),
      cr('Want to grab a coffee before class?', ['I\'d love to, but I\'m running late.', 'Coffee is grown in Brazil.', 'Class is in the main hall.', 'I grabbed it yesterday.'], 'I\'d love to, but I\'m running late.', 'Приглашение → вежливый отказ с причиной.'),
      cr('You look exhausted. Did you stay up late?', ['Yes, I was finishing my lab report.', 'I look at it every day.', 'It\'s late in the year.', 'I stayed at home.'], 'Yes, I was finishing my lab report.', 'Вопрос «поздно лёг?» → да + причина.'),
      cr('Shouldn\'t we start rehearsing for the debate?', ['You\'re right — let\'s begin tomorrow.', 'The debate was on TV.', 'We should start the car.', 'I rehearsed it.'], 'You\'re right — let\'s begin tomorrow.', '«Shouldn\'t we…?» — предложение → согласие и план.'),
    ],
  },
  {
    task: 'choose-response', title: 'Choose a Response · Practice 3', timeSec: 240,
    items: [
      cr('Is this seat taken?', ['No, go ahead.', 'I took it home.', 'It\'s a comfortable seat.', 'Yes, I\'m seated.'], 'No, go ahead.', '«Это место занято?» → «нет, садитесь».'),
      cr('I heard the history exam has been moved to Wednesday.', ['Really? I\'d better check my email.', 'History is my favorite subject.', 'Wednesday comes after Tuesday.', 'They moved into a new house.'], 'Really? I\'d better check my email.', 'Новость → реакция удивления и действие.'),
      cr('How long does it take to walk to the art building?', ['About ten minutes from here.', 'It\'s a long building.', 'I walked there yesterday.', 'Art is very old.'], 'About ten minutes from here.', '«How long» о времени → продолжительность.'),
      cr('Can I borrow your notes from Monday\'s lecture?', ['Sure, I\'ll send you a copy tonight.', 'The lecture was on Monday.', 'I borrowed a book.', 'Notes are important.'], 'Sure, I\'ll send you a copy tonight.', 'Просьба → согласие и как именно.'),
      cr('Why wasn\'t Sarah at the study group?', ['She had a doctor\'s appointment.', 'Study groups are useful.', 'She is a good student.', 'Because we studied.'], 'She had a doctor\'s appointment.', 'Вопрос о причине → причина.'),
      cr('Let\'s split the cost of the textbook.', ['Good idea — it\'s really expensive.', 'The book split in half.', 'It costs a lot of money to print.', 'Textbooks are heavy.'], 'Good idea — it\'s really expensive.', 'Предложение → согласие.'),
      cr('Aren\'t you supposed to be at work right now?', ['My manager gave me the afternoon off.', 'Work is important.', 'I\'m supposed to study.', 'Right now it\'s three.'], 'My manager gave me the afternoon off.', 'Удивлённый вопрос → объяснение ситуации.'),
      cr('Which dorm did you end up choosing?', ['I went with Oak Hall, near the gym.', 'I chose it in the end.', 'The dorm is open.', 'I ended up late.'], 'I went with Oak Hall, near the gym.', '«Which…?» → конкретный выбор. «end up» = «в итоге».'),
    ],
  },
]

export const CONVERSATIONS = [
  {
    task: 'conversation', title: 'Conversation · Practice 1', timeSec: 60,
    context: 'Listen to a conversation between two students.',
    script: 'Woman: Hey, Tom. Are you going to the career fair on Friday?\nMan: I was planning to, but I just found out I have a chemistry lab at the same time.\nWoman: Oh, that\'s too bad. A lot of engineering companies are coming this year.\nMan: I know. Do you think I could ask my lab instructor to switch me to the Thursday session?\nWoman: Probably. My roommate did that last semester for a job interview. You just need to email the instructor a few days before.\nMan: Then I\'ll write to her tonight.',
    questions: [
      q('What is the man\'s problem?', ['He has a class at the same time as the career fair', 'He does not know where the career fair is', 'He missed a job interview', 'He failed his chemistry lab'], 'He has a class at the same time as the career fair', 'Main idea: «I have a chemistry lab at the same time».'),
      q('What will the man probably do next?', ['Email his lab instructor', 'Skip the career fair', 'Talk to the woman\'s roommate', 'Apply to an engineering company'], 'Email his lab instructor', 'Next action: «I\'ll write to her tonight».'),
    ],
  },
  {
    task: 'conversation', title: 'Conversation · Practice 2', timeSec: 60,
    context: 'Listen to a conversation between a student and a librarian.',
    script: 'Student: Hi, I\'m looking for a book that\'s on reserve for my sociology class, but it\'s not on the shelf.\nLibrarian: Reserve books are kept behind this desk. Which book is it?\nStudent: "Cities and Communities" by Martin Hale.\nLibrarian: Let me check. Hmm, someone has it right now, but it\'s due back in about an hour. Reserve books can only be borrowed for two hours.\nStudent: Only two hours? I was hoping to take it home.\nLibrarian: I\'m afraid not. But you can scan up to one chapter on the machines over there for free.\nStudent: That might be enough. I only need chapter four.',
    questions: [
      q('Why can\'t the student find the book on the shelf?', ['Reserve books are kept at the desk', 'The book has been lost', 'The library does not own the book', 'The book is in another building'], 'Reserve books are kept at the desk', 'Detail: «Reserve books are kept behind this desk».'),
      q('What does the student imply when she says, "That might be enough"?', ['Scanning one chapter will meet her needs', 'She will wait for two hours', 'She does not need the book anymore', 'She will buy her own copy'], 'Scanning one chapter will meet her needs', 'Implied meaning: ей нужна только четвёртая глава, значит скана хватит.'),
    ],
  },
  {
    task: 'conversation', title: 'Conversation · Practice 3', timeSec: 60, genders: { Advisor: 'male', Student: 'female' },
    context: 'Listen to a conversation between a student and an advisor.',
    script: 'Advisor: So, Lena, what can I help you with today?\nStudent: I\'m thinking about adding a minor in environmental science. But I\'m worried it\'ll delay my graduation.\nAdvisor: Let\'s look. You\'ve already taken Introduction to Ecology, and that counts toward the minor.\nStudent: Really? I took it as an elective.\nAdvisor: It still counts. So you\'d need four more courses. If you take one each semester, you can finish on time.\nStudent: That\'s a relief. Can I sign up today?\nAdvisor: You\'ll need a form signed by the department chair first. I\'ll print it for you.',
    questions: [
      q('What is the student mainly concerned about?', ['That a minor will make her graduate later', 'That she failed an ecology course', 'That she cannot choose an elective', 'That the department chair is unavailable'], 'That a minor will make her graduate later', 'Main concern: «I\'m worried it\'ll delay my graduation».'),
      q('What does the advisor say about Introduction to Ecology?', ['It counts toward the minor even though it was an elective', 'The student must take it again', 'It is no longer offered', 'It does not count toward any program'], 'It counts toward the minor even though it was an elective', 'Detail: «It still counts».'),
    ],
  },
]

export const ANNOUNCEMENTS = [
  {
    task: 'announcement', title: 'Announcement · Practice 1', timeSec: 60,
    context: 'Listen to an announcement in a class.',
    script: 'Professor: Before we start, a quick announcement about your research projects. The deadline for the first draft has been moved from October twelfth to October nineteenth, because the library\'s online database will be down for maintenance next week. However, I still want everyone to email me your topic by this Friday, so I can make sure no two students are writing about the same thing. If you\'re having trouble choosing a topic, come to my office hours on Wednesday afternoon.',
    questions: [
      q('What is the main purpose of the announcement?', ['To announce a change to a deadline', 'To introduce a new research database', 'To cancel office hours', 'To assign research topics to students'], 'To announce a change to a deadline', 'Purpose: перенос дедлайна черновика.'),
      q('What must students do by Friday?', ['Email their research topic', 'Submit the first draft', 'Visit the library', 'Attend office hours'], 'Email their research topic', 'Detail: «email me your topic by this Friday».'),
    ],
  },
  {
    task: 'announcement', title: 'Announcement · Practice 2', timeSec: 60,
    context: 'Listen to an announcement on campus radio.',
    script: 'Announcer: Good morning, everyone. This Saturday, the Student Volunteer Center is organizing a cleanup of Riverside Park from nine a.m. to noon. Gloves, bags, and water will be provided, so just bring yourself and comfortable shoes. Volunteers will also receive a free lunch at the student union afterward. To join, sign up on the Volunteer Center website by Thursday evening, so we know how many lunches to order. In case of heavy rain, the event will move to the following Saturday.',
    questions: [
      q('What will volunteers receive after the event?', ['A free meal', 'A pair of gloves to keep', 'Course credit', 'A park membership'], 'A free meal', 'Detail: «a free lunch at the student union».'),
      q('Why should students sign up by Thursday?', ['So the organizers can order the right amount of food', 'Because the park closes on Friday', 'So they can receive their equipment', 'Because only a few spots are available'], 'So the organizers can order the right amount of food', 'Purpose: «so we know how many lunches to order».'),
    ],
  },
  {
    task: 'announcement', title: 'Announcement · Practice 3', timeSec: 60,
    context: 'Listen to an announcement at the beginning of a lecture.',
    script: 'Professor: Okay, everyone, one more thing. As you know, our field trip to the geology museum was planned for next Tuesday. Unfortunately, the museum just told us that the mineral hall will be closed for renovation. So instead, we\'ll visit the university\'s own rock collection in the basement of the Earth Sciences building. It\'s smaller, but you\'ll be allowed to actually handle the samples, which you can\'t do at the museum. Please wear closed-toe shoes — the lab rules require them.',
    questions: [
      q('Why has the field trip been changed?', ['Part of the museum will be closed', 'The bus is not available', 'The museum is too far away', 'Students asked for a different trip'], 'Part of the museum will be closed', 'Detail: mineral hall closed for renovation.'),
      q('What does the professor imply about the university\'s rock collection?', ['It offers an experience the museum does not', 'It is larger than the museum\'s', 'It is closed to most students', 'It is not related to the course'], 'It offers an experience the museum does not', 'Inference: «you\'ll be allowed to actually handle the samples, which you can\'t do at the museum».'),
    ],
  },
]

export const ACADEMIC_TALKS = [
  {
    task: 'academic-talk', title: 'Academic Talk · Practice 1', timeSec: 100, genders: { Professor: 'female' },
    context: 'Listen to part of a talk in a biology class.',
    script: 'Professor: Today I want to talk about a strategy some animals use to survive winter: hibernation. Now, many people think hibernation is just a long, deep sleep. It\'s actually quite different. During hibernation, an animal\'s body temperature drops dramatically — in some ground squirrels, it falls close to zero degrees Celsius. Their heart rate can slow from around two hundred beats per minute to fewer than ten. This saves an enormous amount of energy, which matters because food is scarce in winter.\nInterestingly, hibernating animals don\'t stay in this state the whole time. Every week or two, they briefly warm up to a normal temperature for several hours, and then cool down again. Scientists still aren\'t completely sure why. These warm-ups use a lot of energy, so there must be a good reason. One idea is that the animal needs to restore its immune system. Another is that it actually needs real sleep, which it can\'t get while its brain is so cold.',
    questions: [
      q('What is the talk mainly about?', ['How hibernation works and an unanswered question about it', 'Why ground squirrels store food for winter', 'The differences between sleep and dreaming', 'How animals find food in winter'], 'How hibernation works and an unanswered question about it', 'Main idea: механизм спячки + загадка периодических «пробуждений».'),
      q('Why does the professor mention a heart rate of fewer than ten beats per minute?', ['To illustrate how much an animal\'s body slows down', 'To show that hibernation is dangerous', 'To compare squirrels with humans', 'To explain why animals wake up'], 'To illustrate how much an animal\'s body slows down', 'Purpose: пример резкого замедления организма.'),
      q('According to the professor, what is surprising about the brief warm-ups?', ['They cost a lot of energy', 'They happen only once each winter', 'They make the animal leave its nest', 'They happen only in very cold climates'], 'They cost a lot of energy', 'Detail: «These warm-ups use a lot of energy, so there must be a good reason».'),
      q('What does the professor imply about the explanations she mentions at the end?', ['Neither has been confirmed', 'Both have been proven wrong', 'Only the first one is accepted', 'They apply only to ground squirrels'], 'Neither has been confirmed', 'Inference: «Scientists still aren\'t completely sure why» — это гипотезы.'),
    ],
  },
  {
    task: 'academic-talk', title: 'Academic Talk · Practice 2', timeSec: 100,
    context: 'Listen to part of a talk in an economics class.',
    script: 'Professor: Let\'s talk about something you\'ve all experienced: the price of an airline ticket changing from one day to the next. This is called dynamic pricing. Airlines have a fixed number of seats, and an empty seat on a departing plane earns nothing. So they use software to adjust prices constantly, based on how many seats are left and how close the departure date is.\nEarly on, prices tend to be lower to fill the plane gradually. As the flight fills up, prices rise, because the remaining seats are more valuable to travelers who must fly — business travelers, for instance, who often book late and care less about cost.\nNow, dynamic pricing isn\'t limited to airlines. Hotels, concert tickets, and ride-sharing apps all use versions of it. Critics argue that it can feel unfair, especially when prices jump during emergencies. Supporters respond that higher prices encourage more drivers or sellers to enter the market, which eventually increases supply.',
    questions: [
      q('What is the main topic of the talk?', ['A pricing method that changes prices according to demand', 'Why airlines are losing money', 'How business travelers choose flights', 'The history of ride-sharing apps'], 'A pricing method that changes prices according to demand', 'Main idea: dynamic pricing.'),
      q('Why does the professor say that an empty seat "earns nothing"?', ['To explain why airlines try to sell every seat', 'To criticize airlines for overbooking', 'To show that airline tickets are too expensive', 'To describe how pilots are paid'], 'To explain why airlines try to sell every seat', 'Purpose: мотивация менять цены — продать все места.'),
      q('According to the professor, why do prices rise as a flight fills up?', ['The remaining seats are worth more to people who must travel', 'Fuel becomes more expensive closer to departure', 'Airlines need to pay more staff', 'Software makes more errors late in the process'], 'The remaining seats are worth more to people who must travel', 'Detail: последние места ценнее для тех, кому нужно лететь.'),
      q('How do supporters of dynamic pricing respond to critics?', ['Higher prices attract more sellers, increasing supply', 'Prices are rarely raised during emergencies', 'Customers can always choose a cheaper service', 'Dynamic pricing is required by law'], 'Higher prices attract more sellers, increasing supply', 'Detail в конце лекции.'),
    ],
  },
  {
    task: 'academic-talk', title: 'Academic Talk · Practice 3', timeSec: 100, genders: { Professor: 'female' },
    context: 'Listen to part of a talk in an art history class.',
    script: 'Professor: When we look at ancient Greek statues in museums today, we see gleaming white marble. For centuries, artists actually believed that this pure white look was the classical ideal. But here\'s the thing — most of these statues were originally painted, often in bright colors.\nHow do we know? Researchers shine ultraviolet light on the surfaces and find tiny traces of pigment that are invisible to the naked eye. Using these traces, some scholars have created full-color reconstructions. The results can be surprising — robes in deep blue and red, patterned borders, even painted eyes.\nNot everyone loves these reconstructions. Some visitors find them almost shocking, because they\'re so used to the white version. And some historians point out that we can\'t be sure exactly how bright the original colors were, since pigments fade differently. Still, the evidence that the statues were painted is very strong.',
    questions: [
      q('What is the main point of the talk?', ['Ancient Greek statues were originally painted', 'Marble is the best material for statues', 'Ultraviolet light damages ancient art', 'Modern artists copy Greek statues'], 'Ancient Greek statues were originally painted', 'Main idea.'),
      q('How do researchers find evidence of the original colors?', ['By using ultraviolet light to reveal traces of pigment', 'By reading ancient descriptions of the statues', 'By comparing statues with paintings', 'By removing the outer layer of marble'], 'By using ultraviolet light to reveal traces of pigment', 'Detail: UV light + traces of pigment.'),
      q('Why do some visitors find the reconstructions shocking?', ['They are used to seeing the statues as white', 'The colors are historically incorrect', 'The statues look damaged', 'The reconstructions are very expensive'], 'They are used to seeing the statues as white', 'Detail: «so used to the white version».'),
      q('What is the professor\'s attitude toward the claim that the statues were painted?', ['She thinks it is well supported', 'She doubts it', 'She thinks it is impossible to test', 'She has not decided'], 'She thinks it is well supported', 'Attitude: «the evidence ... is very strong».'),
    ],
  },
]
