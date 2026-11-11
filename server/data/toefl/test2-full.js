import { q, cw, bs, FULL } from './helpers.js'

const cr = (prompt, options, answer = options[0], explain = '') => ({ prompt, ...q('', options, answer, explain) })

// Simulation Test 2, the tasks that bring it to full exam length
// (merged into test2.js by extendTest).
export const EXTRA_2 = {
  minutes: FULL.minutes,
  writingIntro: FULL.writingIntro,
  reading: {
    intro: FULL.reading.intro,
    routing: [
      cw('Complete the Words', 'Glaciers are large masses of ice that move slowly across the land. They {{form}} in places where more snow {{falls}} in winter than melts {{in}} summer. Over many years, {{the}} snow is pressed into thick {{layers}} of ice. As a glacier {{moves}}, it carries rocks and soil {{with}} it, cutting deep valleys {{into}} the landscape. Many lakes {{and}} valleys we see today {{were}} shaped by glaciers long ago.'),
      {
        task: 'daily-life', title: 'Read in Daily Life', timeSec: 150, passageTitle: 'Email',
        passage: '<b>From:</b> Housing Office\n<b>Subject:</b> Room change requests\n\nDear residents,\n\nRoom change requests for the spring semester can be submitted online from November 15 to November 30. Requests are handled in the order they are received, and we cannot guarantee that every request will be approved.\n\nIf your request is approved, you will have three days to move. Please note that a $40 cleaning fee will be charged to students who leave their old room in poor condition.\n\nThe Housing Office',
        questions: [
          q('What is the main purpose of the email?', ['To explain how to ask for a different room', 'To announce higher housing prices', 'To remind students to clean their rooms', 'To introduce new residence halls'], 'To explain how to ask for a different room'),
          q('What is true about the requests?', ['Earlier requests are considered first', 'All of them will be approved', 'They must be made in person', 'They can be sent at any time'], 'Earlier requests are considered first'),
          q('When might a student have to pay $40?', ['If the old room is left dirty', 'If the request is submitted late', 'If the student moves in three days', 'If the request is not approved'], 'If the old room is left dirty'),
        ],
      },
    ],
    upper: [
      {
        task: 'daily-life', title: 'Read in Daily Life', timeSec: 120, passageTitle: 'Online review',
        passage: '<b>★★★☆☆ "Great equipment, frustrating booking"</b>\n\nThe new recording studio in the Media Building is genuinely impressive — soundproofed rooms, professional microphones, and staff who clearly know what they\'re doing. My complaint is the reservation system. Slots open exactly two weeks in advance at midnight, and the popular evening times disappear within minutes. Unless you\'re willing to stay up, you\'re left with mid-morning sessions that clash with most lecture schedules.',
        questions: [
          q('What is the reviewer\'s main criticism?', ['Convenient time slots are hard to reserve', 'The equipment is outdated', 'The staff are not helpful', 'The rooms are too noisy'], 'Convenient time slots are hard to reserve'),
          q('What does the reviewer imply about mid-morning sessions?', ['They are inconvenient for many students', 'They are the most popular times', 'They are cheaper than evening sessions', 'They must be booked a month ahead'], 'They are inconvenient for many students'),
        ],
      },
    ],
    lower: [
      {
        task: 'daily-life', title: 'Read in Daily Life', timeSec: 150, passageTitle: 'Notice',
        passage: '<b>LOST AND FOUND</b>\n\nDid you lose something in the library?\nAsk at the front desk on the first floor.\n\nWe keep lost items for 30 days.\nPhones and wallets are kept in a locked box — please bring your student ID to collect them.',
        questions: [
          q('Where should students ask about lost items?', ['At the front desk', 'At the student center', 'On the second floor', 'At the security office'], 'At the front desk'),
          q('How long are lost items kept?', ['For one month', 'For one week', 'For one year', 'For one day'], 'For one month'),
          q('What must students bring to collect a lost phone?', ['Their student ID', 'A photo of the phone', 'A receipt', 'A library book'], 'Their student ID'),
        ],
      },
    ],
  },
  listening: {
    intro: FULL.listening.intro,
    routing: [
      {
        task: 'choose-response', title: 'Choose a Response',
        items: [
          cr('Do you know if the printer on this floor is working?', ['It was fixed this morning.', 'I work on this floor.', 'I printed my name.', 'It\'s a new floor.']),
          cr('Are you taking the history course next term?', ['I am, if there\'s still space.', 'History is very old.', 'It took a long time.', 'Next term starts in May.']),
          cr('Sorry I\'m late — the traffic was terrible.', ['No problem, we just started.', 'The traffic light is green.', 'It\'s late at night.', 'I\'m sorry too.']),
          cr('What did you think of the guest speaker?', ['She was really inspiring.', 'I think so.', 'The guest room is upstairs.', 'I speak three languages.'], 'She was really inspiring.'),
        ],
      },
      {
        task: 'conversation', title: 'Listen to a Conversation', timeSec: 50,
        script: 'Man: Hi, I\'d like to sign up for a tennis court for Saturday morning.\nWoman: Let me check... Saturday morning is fully booked, I\'m afraid. There\'s a court free at two in the afternoon.\nMan: Hmm, I have a work shift until three. What about Sunday?\nWoman: Sunday at ten is open.\nMan: Perfect. Can I reserve it for two hours?\nWoman: The limit is ninety minutes, but you can book another slot later if no one else takes it.',
        questions: [
          q('Why can\'t the man play on Saturday afternoon?', ['He has to work then', 'The courts are closed', 'His partner is busy', 'It is going to rain'], 'He has to work then'),
          q('What does the woman say about the length of a booking?', ['It cannot be longer than ninety minutes', 'It must be at least two hours', 'It depends on the weather', 'It is free on Sundays'], 'It cannot be longer than ninety minutes'),
        ],
      },
      {
        task: 'announcement', title: 'Listen to an Announcement', timeSec: 50,
        script: 'Professor: One more thing before you go. The midterm exam has been moved from Thursday to the following Tuesday, because the exam room is needed for a conference. The format doesn\'t change: forty multiple-choice questions and two short essays. I\'ll hold an extra review session on Monday at five in this room. Attendance is optional, but I strongly recommend it.',
        questions: [
          q('Why has the exam date changed?', ['The room is being used for another event', 'The professor will be away', 'Students asked for more time', 'The exam format has changed'], 'The room is being used for another event'),
          q('What does the professor say about the review session?', ['Students are not required to attend it', 'It will be held online', 'It replaces the exam', 'It takes place on Tuesday'], 'Students are not required to attend it'),
        ],
      },
      {
        task: 'academic-talk', title: 'Listen to an Academic Talk', timeSec: 90,
        genders: { Professor: 'female' },
        script: 'Professor: In biology today, let\'s talk about migration, specifically the monarch butterfly. Every fall, millions of monarchs fly from Canada and the northern United States to a few forests in central Mexico — a journey of up to four thousand kilometers. What makes this remarkable is that no single butterfly makes the round trip. The monarchs that fly south in the fall are the great-grandchildren of the ones that left Mexico the spring before.\nSo how do they know where to go? Research suggests they use the sun as a compass, together with an internal clock in their antennae that corrects for the sun\'s movement across the sky. Scientists are still studying how they find such a small area at the end of the journey.',
        questions: [
          q('What is the talk mainly about?', ['How monarch butterflies migrate', 'Why forests in Mexico are disappearing', 'How butterflies develop from eggs', 'Why some insects live in cold places'], 'How monarch butterflies migrate'),
          q('What does the professor find remarkable about the journey?', ['No individual butterfly completes the whole round trip', 'The butterflies fly only at night', 'The journey takes only a few days', 'The butterflies travel in pairs'], 'No individual butterfly completes the whole round trip'),
          q('According to the professor, what role do the antennae play?', ['They contain a clock that adjusts for the sun\'s movement', 'They detect the smell of the forests', 'They sense the Earth\'s magnetic field', 'They help the butterflies keep warm'], 'They contain a clock that adjusts for the sun\'s movement'),
          q('What does the professor say is still unknown?', ['How the butterflies find their exact destination', 'Why the butterflies fly south', 'How far the butterflies travel', 'When the migration begins'], 'How the butterflies find their exact destination'),
        ],
      },
    ],
    upper: [
      {
        task: 'choose-response', title: 'Choose a Response',
        items: [
          cr('I\'d have thought the lab would be open during the break.', ['Apparently they\'re renovating it until January.', 'I thought about the break.', 'The lab coat is white.', 'It broke last week.']),
          cr('You might want to double-check those figures before you submit.', ['Good point — I\'ll go over them again.', 'I submitted two figures.', 'Check, please.', 'I want a double room.']),
          cr('Wasn\'t Professor Hale supposed to be on leave this semester?', ['She postponed it until next year.', 'She left the room.', 'The semester is long.', 'I\'m supposed to go.']),
          cr('I can\'t make heads or tails of these instructions.', ['Let me take a look — maybe I can help.', 'Heads, I win.', 'The instructions are printed.', 'I made them yesterday.']),
        ],
      },
      {
        task: 'conversation', title: 'Listen to a Conversation', timeSec: 50,
        genders: { Student: 'male', Professor: 'female' },
        script: 'Student: Professor Moore, I wanted to ask about the grade on my lab report. I got a C, but I thought my results were correct.\nProfessor: Your results were fine. The problem was the discussion section. You described what happened, but you didn\'t explain why — and you didn\'t compare your numbers with the values in the textbook.\nStudent: I see. I thought the results would speak for themselves.\nProfessor: In science writing they rarely do. If you revise the discussion and resubmit it by next Friday, I\'ll regrade it.\nStudent: Thank you. I\'ll do that.',
        questions: [
          q('Why did the student receive a low grade?', ['His discussion did not interpret the results', 'His results were incorrect', 'He submitted the report late', 'He copied the textbook'], 'His discussion did not interpret the results'),
          q('What does the professor offer to do?', ['Grade a revised version of the report', 'Repeat the experiment with him', 'Give him a different assignment', 'Explain the textbook values in class'], 'Grade a revised version of the report'),
        ],
      },
      {
        task: 'announcement', title: 'Listen to an Announcement', timeSec: 50,
        script: 'Announcer: Attention, all graduate students. The deadline for travel grant applications has been brought forward to October 20, two weeks earlier than originally announced, because the funding committee will meet sooner this year. Applicants should include a budget and a letter from their supervisor confirming that the conference is relevant to their research. Incomplete applications will not be reviewed.',
        questions: [
          q('What change does the announcer describe?', ['Applications are now due earlier', 'The grants have become larger', 'The committee has been replaced', 'The conference has been cancelled'], 'Applications are now due earlier'),
          q('What will happen to an application without a supervisor\'s letter?', ['It will not be considered', 'It will be reviewed later', 'It will receive less money', 'It will be returned for changes'], 'It will not be considered'),
        ],
      },
      {
        task: 'academic-talk', title: 'Listen to an Academic Talk', timeSec: 90,
        genders: { Professor: 'male' },
        script: 'Professor: Today, a concept from art history: the role of patrons in the Renaissance. We tend to imagine artists like Michelangelo as independent geniuses following their own vision. In reality, most Renaissance art was commissioned. A wealthy family, a church, or a city government paid for a work and often specified its subject, its size, and even the colors — blue paint made from crushed lapis lazuli was so expensive that contracts sometimes stated exactly how much of it the artist had to use.\nThis doesn\'t mean artists had no freedom. The best of them negotiated, and their reputations gave them more room to experiment. But it does mean that to understand a painting, we need to ask who paid for it and why. A portrait could be a political statement; a chapel fresco could advertise a family\'s wealth.',
        questions: [
          q('What is the talk mainly about?', ['How patrons influenced Renaissance art', 'How blue paint was produced', 'Why Michelangelo was famous', 'How frescoes were painted'], 'How patrons influenced Renaissance art'),
          q('Why does the professor mention blue paint?', ['To show how detailed some contracts were', 'To explain why paintings faded', 'To describe a new painting technique', 'To show that artists chose their own colors'], 'To show how detailed some contracts were'),
          q('What does the professor say about well-known artists?', ['They could negotiate more freedom', 'They refused to work for patrons', 'They paid for their own materials', 'They worked only for churches'], 'They could negotiate more freedom'),
          q('What does the professor suggest students do when studying a painting?', ['Consider who commissioned it and for what purpose', 'Focus only on the artist\'s technique', 'Ignore the political context', 'Compare its price with other works'], 'Consider who commissioned it and for what purpose'),
        ],
      },
    ],
    lower: [
      {
        task: 'choose-response', title: 'Choose a Response',
        items: [
          cr('What time is the movie tonight?', ['It starts at eight.', 'It\'s a funny movie.', 'I watched it at home.', 'Tonight is cold.']),
          cr('Do you want some water?', ['Yes, please. I\'m very thirsty.', 'The water is blue.', 'I want to swim.', 'It\'s near the river.']),
          cr('Who is your new roommate?', ['A student from Brazil.', 'The room is new.', 'At the dormitory.', 'I need a new key.'], 'A student from Brazil.'),
          cr('Can you help me carry these books?', ['Sure, give me some.', 'Books are expensive.', 'I carry a bag.', 'They\'re in the library.']),
        ],
      },
      {
        task: 'conversation', title: 'Listen to a Conversation', timeSec: 50,
        script: 'Woman: Hi, I\'d like to open a library account.\nMan: Sure. Are you a student here?\nWoman: Yes, I started this week.\nMan: Great. I just need your student card. You can borrow up to ten books at a time.\nWoman: How long can I keep them?\nMan: Three weeks. You can also renew them online.',
        questions: [
          q('What does the woman want to do?', ['Open a library account', 'Buy some books', 'Find a job in the library', 'Return a book'], 'Open a library account'),
          q('How long can students keep books?', ['Three weeks', 'One week', 'Ten days', 'One month'], 'Three weeks'),
        ],
      },
      {
        task: 'announcement', title: 'Listen to an Announcement', timeSec: 50,
        script: 'Announcer: Good afternoon. The music club is having a free concert this Friday at six p.m. in the main hall. Students from the club will play guitar, piano, and violin. Everyone is welcome, and you can bring your friends and family.',
        questions: [
          q('What is the announcement about?', ['A free concert', 'Music lessons', 'A new club room', 'Selling instruments'], 'A free concert'),
          q('Who can come to the event?', ['Anyone', 'Only club members', 'Only music teachers', 'Only first-year students'], 'Anyone'),
        ],
      },
      {
        task: 'academic-talk', title: 'Listen to an Academic Talk', timeSec: 90,
        script: 'Professor: Today we are going to talk about volcanoes under the sea. Most volcanoes on Earth are not on land. They are deep under the ocean. When these volcanoes erupt, hot lava meets cold sea water and quickly becomes hard rock.\nSometimes, after many eruptions, the rock grows so tall that it comes out of the water. This is how some islands are made. The Hawaiian Islands, for example, were made by volcanoes. New islands are still forming there today.',
        questions: [
          q('What is the talk mainly about?', ['Volcanoes under the ocean', 'How to swim in the sea', 'Why sea water is cold', 'The history of Hawaii'], 'Volcanoes under the ocean'),
          q('Where are most volcanoes on Earth?', ['Under the ocean', 'On high mountains', 'In deserts', 'Near big cities'], 'Under the ocean'),
          q('What happens when lava meets sea water?', ['It becomes hard rock', 'It turns into sand', 'It makes the water warm forever', 'It disappears'], 'It becomes hard rock'),
          q('Why does the professor mention the Hawaiian Islands?', ['They were made by volcanoes', 'They have no volcanoes', 'They are very old', 'They are under the sea'], 'They were made by volcanoes'),
        ],
      },
    ],
  },
  buildSentence: [
    bs('Can you recommend a good place to eat near campus?', 'There is a small Italian restaurant on Main Street.', { chunks: ['is', 'a small', 'Italian restaurant', 'on', 'Main Street'], prefix: 'There' }),
    bs('What did your manager ask you to do?', 'She asked me to update the schedule for next week.', { chunks: ['asked me', 'to update', 'the schedule', 'for', 'next week'], prefix: 'She', distractor: 'updating' }),
    bs('Why did you change your topic?', 'I could not find enough sources on the first one.', { chunks: ['could not', 'find', 'enough sources', 'on', 'the first one'], prefix: 'I' }),
    bs('Is the museum open on Mondays?', 'It is closed on Mondays, but it opens late on Fridays.', { chunks: ['is closed', 'on Mondays,', 'but', 'it opens', 'late', 'on Fridays'], prefix: 'It' }),
  ],
}
