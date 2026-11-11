import { q, cw, bs, FULL } from './helpers.js'

const cr = (prompt, options, answer = options[0], explain = '') => ({ prompt, ...q('', options, answer, explain) })

// Simulation Test 1, the tasks that bring it to full exam length
// (merged into test1.js by extendTest).
export const EXTRA_1 = {
  minutes: FULL.minutes,
  writingIntro: FULL.writingIntro,
  reading: {
    intro: FULL.reading.intro,
    routing: [
      cw('Complete the Words', 'Honeybees communicate the location of food through a movement known as the waggle dance. When a {{worker}} returns to the hive, {{she}} moves in a figure-eight {{pattern}} on the honeycomb. The {{direction}} of the straight part {{of}} the dance shows where {{the}} flowers are in relation {{to}} the sun, and its {{length}} indicates how far away {{they}} are. Other bees follow {{these}} signals to find the food.'),
      {
        task: 'daily-life', title: 'Read in Daily Life', timeSec: 150, passageTitle: 'Text message',
        passage: '<b>Maya (4:12 p.m.):</b> Hey! Are we still on for the study group tonight? The library study rooms are all booked, so Leo suggested meeting at his apartment instead. It\'s on Pine Street, number 18, third floor. Bring your notes from chapters 5 and 6 — he\'ll make dinner if we bring snacks. We start at 7, but come at 6:45 if you want to help set up.',
        questions: [
          q('Why has the meeting place changed?', ['The library rooms are unavailable', 'Leo cannot leave his apartment', 'The study group has become bigger', 'The library closes early tonight'], 'The library rooms are unavailable'),
          q('What does Maya ask the reader to bring?', ['Notes from two chapters', 'Dinner for the group', 'A new textbook', 'Drinks for everyone'], 'Notes from two chapters'),
          q('What is suggested about arriving at 6:45?', ['It is for people who want to help prepare', 'It is required for everyone', 'The group will start early without the others', 'Leo will not be home before then'], 'It is for people who want to help prepare'),
        ],
      },
    ],
    upper: [
      {
        task: 'daily-life', title: 'Read in Daily Life', timeSec: 120, passageTitle: 'Memo',
        passage: '<b>MEMO</b>\n<b>To:</b> Laboratory staff\n<b>Re:</b> Freezer inventory\n\nThe −80 °C freezers in Room B12 are at full capacity. Beginning March 1, any sample box without a label showing the owner\'s name and the date will be relocated to a shared overflow unit, where temperature monitoring is less frequent. Boxes in the overflow unit that remain unclaimed for 60 days will be discarded. Researchers leaving the lab must transfer their samples to a current staff member before departure.',
        questions: [
          q('What is the main purpose of the memo?', ['To announce new rules for storing samples', 'To report a broken freezer', 'To ask staff to order new freezers', 'To introduce a new member of staff'], 'To announce new rules for storing samples'),
          q('What can be inferred about samples moved to the overflow unit?', ['They may be at greater risk of damage', 'They will be thrown away immediately', 'They will be labeled by the lab manager', 'They are kept at a colder temperature'], 'They may be at greater risk of damage'),
        ],
      },
    ],
    lower: [
      {
        task: 'daily-life', title: 'Read in Daily Life', timeSec: 150, passageTitle: 'Poster',
        passage: '<b>FREE YOGA ON THE LAWN</b>\n\nEvery Tuesday and Thursday in June\n7:30–8:15 a.m., in front of the Student Center\n\nAll levels welcome. Bring your own mat or borrow one from us.\nIf it rains, the class moves to Gym 2.',
        questions: [
          q('When are the classes?', ['On two mornings a week', 'Every evening in June', 'Only on weekends', 'Every day at noon'], 'On two mornings a week'),
          q('What can students do if they do not have a mat?', ['Borrow one at the class', 'Buy one at the Student Center', 'Use a towel from Gym 2', 'Sit on the grass'], 'Borrow one at the class'),
          q('What happens if it rains?', ['The class is held indoors', 'The class is cancelled', 'The class starts later', 'The class moves to another day'], 'The class is held indoors'),
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
          cr('Could you send me the slides from today\'s lecture?', ['Sure, I\'ll email them tonight.', 'The lecture was long.', 'I slid on the ice.', 'Today is Monday.']),
          cr('Why is the gym so crowded this morning?', ['There\'s a free class at nine.', 'It opens at six.', 'I go there every day.', 'It\'s a very big gym.']),
          cr('Have you decided on your major yet?', ['I\'m still choosing between biology and chemistry.', 'The major road is closed.', 'Yes, I decided to go.', 'It was a major event.']),
          cr('Would you mind closing the window?', ['Not at all — it is a bit cold.', 'The window is open.', 'I mind the store.', 'It\'s close to here.']),
        ],
      },
      {
        task: 'conversation', title: 'Listen to a Conversation', timeSec: 50,
        script: 'Woman: Hi, I\'d like to print my poster for the science fair. Can you do it here?\nMan: We can. What size is it?\nWoman: Ninety by one hundred twenty centimeters.\nMan: That\'s our large format. It takes about a day, because the large printer is busy this week.\nWoman: Oh. The fair is tomorrow afternoon.\nMan: Then I\'d suggest a smaller size. We can print sixty by ninety in an hour.\nWoman: Okay, let me check whether the fair allows that size, and I\'ll come back.',
        questions: [
          q('What does the woman want to do?', ['Print a poster', 'Enter the science fair', 'Buy a printer', 'Repair her computer'], 'Print a poster'),
          q('What will the woman probably do next?', ['Find out if a smaller poster is acceptable', 'Pay for the large poster', 'Wait for the large printer', 'Ask the man to deliver the poster'], 'Find out if a smaller poster is acceptable'),
        ],
      },
      {
        task: 'announcement', title: 'Listen to an Announcement', timeSec: 50,
        script: 'Announcer: Good morning, everyone. Starting next Monday, the campus shuttle will follow a new route. Instead of stopping at the main gate, it will stop at the new transit center on Elm Avenue. Buses will run every ten minutes during the day and every twenty minutes after seven p.m. You can find the full schedule on the transportation office website.',
        questions: [
          q('What is the announcement mainly about?', ['A change to the shuttle route', 'A new parking fee', 'The closing of the main gate', 'A job at the transportation office'], 'A change to the shuttle route'),
          q('How often will buses run after 7 p.m.?', ['Every twenty minutes', 'Every ten minutes', 'Every hour', 'They will not run'], 'Every twenty minutes'),
        ],
      },
      {
        task: 'academic-talk', title: 'Listen to an Academic Talk', timeSec: 90,
        script: 'Professor: Today I want to talk about urban heat islands. Cities are often several degrees warmer than the countryside around them, especially at night. Why? Mostly because of the materials we build with. Asphalt and concrete absorb heat from the sun during the day and release it slowly after dark. Cities also have fewer trees, and trees cool the air by releasing water through their leaves. On top of that, cars, air conditioners, and factories produce heat of their own.\nSo what can cities do? Some are painting roofs white so they reflect sunlight. Others are planting trees along streets. In one study, neighborhoods with more trees were up to four degrees cooler on summer afternoons.',
        questions: [
          q('What is the talk mainly about?', ['Why cities are warmer than the areas around them', 'How concrete is produced', 'Why trees lose water in summer', 'How air conditioners work'], 'Why cities are warmer than the areas around them'),
          q('According to the professor, why do asphalt and concrete keep cities warm at night?', ['They release stored heat slowly', 'They reflect sunlight', 'They produce heat of their own', 'They block the wind'], 'They release stored heat slowly'),
          q('How do trees help cool the air?', ['By releasing water through their leaves', 'By absorbing heat at night', 'By reducing car traffic', 'By reflecting sunlight upward'], 'By releasing water through their leaves'),
          q('Why does the professor mention a study?', ['To show that planting trees can make a real difference', 'To prove that white roofs do not work', 'To explain why summers are getting longer', 'To compare cities in different countries'], 'To show that planting trees can make a real difference'),
        ],
      },
    ],
    upper: [
      {
        task: 'choose-response', title: 'Choose a Response',
        items: [
          cr('I was under the impression the deadline had been extended.', ['Only for the graduate students, unfortunately.', 'I was impressed by it.', 'The line was very long.', 'They extended the building.']),
          cr('Don\'t you think the committee should have asked us first?', ['Definitely — the decision affects all of us.', 'The committee meets in Room 5.', 'I asked a doctor.', 'First, let\'s eat.']),
          cr('Any chance you could cover my shift on Saturday?', ['I could, as long as I\'m done by six.', 'The chance of rain is low.', 'I covered the book.', 'Saturday was fun.']),
          cr('The keynote speaker turned out to be quite a letdown.', ['Really? Everyone was so excited about her.', 'She turned left.', 'The speaker is too loud.', 'Let me put it down.']),
        ],
      },
      {
        task: 'conversation', title: 'Listen to a Conversation', timeSec: 50,
        genders: { Student: 'female', Advisor: 'male' },
        script: 'Student: Thanks for seeing me. I\'ve been offered a summer internship at a research institute, but it overlaps with the last two weeks of the field course I need to graduate.\nAdvisor: That\'s a tough one. Have you asked the institute whether the start date is flexible?\nStudent: Not yet. I assumed it wasn\'t, since they sent a formal offer.\nAdvisor: Offers are often more negotiable than they look. And if they can\'t move it, the field course is also offered in the fall, although that would delay your graduation by a semester.\nStudent: I\'d rather not delay. I\'ll write to them today.',
        questions: [
          q('What is the student\'s problem?', ['An internship conflicts with a required course', 'She was rejected by a research institute', 'She cannot find a summer job', 'Her field course has been cancelled'], 'An internship conflicts with a required course'),
          q('What does the advisor imply about the formal offer?', ['Its terms might still be changed', 'It should be accepted immediately', 'It is probably not genuine', 'It cannot be negotiated'], 'Its terms might still be changed'),
        ],
      },
      {
        task: 'announcement', title: 'Listen to an Announcement', timeSec: 50,
        script: 'Professor: Before we start, a note about the final project. Several of you have asked whether you can work in pairs. The answer is yes, with one condition: a paired project needs to be roughly twice the scope of an individual one, and each partner must submit a one-page statement describing exactly what they contributed. I\'ll grade the project as a whole, but I may adjust individual grades based on those statements. If you\'d like to work with a partner, let me know by Friday.',
        questions: [
          q('What condition does the professor set for paired projects?', ['They must be larger in scope than individual projects', 'They must be on an assigned topic', 'They must be submitted early', 'They must be presented in class'], 'They must be larger in scope than individual projects'),
          q('Why does the professor ask for contribution statements?', ['To decide whether partners should get different grades', 'To check the students\' writing skills', 'To choose the best project', 'To find partners for other students'], 'To decide whether partners should get different grades'),
        ],
      },
      {
        task: 'academic-talk', title: 'Listen to an Academic Talk', timeSec: 90,
        genders: { Professor: 'male' },
        script: 'Professor: Let\'s turn to a classic question in linguistics: does the language you speak shape the way you think? The strong version of this idea, sometimes called linguistic determinism, claims that language limits what we can think at all. Very few researchers accept that today — people clearly have thoughts they struggle to put into words.\nBut a weaker version has found real support. Consider an Aboriginal community in Australia whose language has no words for "left" and "right." Speakers describe everything with compass directions: "the cup is north of the plate." Experiments show that these speakers keep track of direction remarkably well, even indoors — far better than English speakers do. So language may not set the limits of thought, but it can train our attention and make some distinctions habitual.\nThe challenge for researchers is separating language from culture, since the two always come together.',
        questions: [
          q('What is the talk mainly about?', ['Whether language influences the way people think', 'How children learn to describe directions', 'The history of Aboriginal languages', 'Why some languages have no written form'], 'Whether language influences the way people think'),
          q('What does the professor say about the strong version of the idea?', ['Most researchers reject it', 'Experiments have proven it', 'It applies only to Australian languages', 'It explains how cultures develop'], 'Most researchers reject it'),
          q('Why does the professor mention speakers who use compass directions?', ['To support the weaker version of the idea', 'To show that English is more precise', 'To argue that language limits thought', 'To describe a flaw in the experiments'], 'To support the weaker version of the idea'),
          q('According to the professor, what makes the question hard to study?', ['Language and culture are difficult to separate', 'Few of these languages are still spoken', 'People cannot describe their thoughts', 'The experiments cannot be done indoors'], 'Language and culture are difficult to separate'),
        ],
      },
    ],
    lower: [
      {
        task: 'choose-response', title: 'Choose a Response',
        items: [
          cr('Where did you buy that backpack?', ['At the store next to the bank.', 'It\'s blue and black.', 'I back up my files.', 'Yes, I did.']),
          cr('Can I borrow your pen for a minute?', ['Of course, here it is.', 'It\'s a minute past ten.', 'I borrowed a book.', 'The pen is on sale.']),
          cr('How was your weekend?', ['Really nice — I went hiking.', 'It\'s on Saturday.', 'I work on weekdays.', 'Two days.']),
          cr('Is this seat taken?', ['No, go ahead.', 'I took the bus.', 'The seat is blue.', 'It takes an hour.']),
        ],
      },
      {
        task: 'conversation', title: 'Listen to a Conversation', timeSec: 50,
        script: 'Man: Hi, I lost my umbrella yesterday. Did anyone bring one here?\nWoman: We have a few. What does it look like?\nMan: It\'s black, with a wooden handle.\nWoman: Let me see... Is this it?\nMan: Yes, that\'s mine! Thank you so much.\nWoman: You\'re welcome. Please sign this form first.',
        questions: [
          q('Why does the man come to the office?', ['To find his lost umbrella', 'To buy a new umbrella', 'To report bad weather', 'To return an umbrella he found'], 'To find his lost umbrella'),
          q('What does the woman ask the man to do?', ['Sign a form', 'Come back tomorrow', 'Describe his bag', 'Pay a small fee'], 'Sign a form'),
        ],
      },
      {
        task: 'announcement', title: 'Listen to an Announcement', timeSec: 50,
        script: 'Announcer: Hello, students. Tomorrow the cafeteria will open one hour late, at eight thirty instead of seven thirty, because we are cleaning the kitchen. Coffee and muffins will be available in the lobby from seven o\'clock. Thank you.',
        questions: [
          q('Why will the cafeteria open late?', ['The kitchen is being cleaned', 'There are not enough workers', 'It is a holiday', 'The lobby is closed'], 'The kitchen is being cleaned'),
          q('What can students get in the lobby?', ['Coffee and muffins', 'A full breakfast', 'A free lunch', 'Fruit and juice'], 'Coffee and muffins'),
        ],
      },
      {
        task: 'academic-talk', title: 'Listen to an Academic Talk', timeSec: 90,
        script: 'Professor: Today let\'s talk about owls. Owls are birds that hunt mostly at night. They have very large eyes, so they can see well in the dark. Owls can also turn their heads very far — almost all the way around. This helps them look in many directions without moving their bodies.\nOwls have special feathers, too. These feathers are soft at the edges, so owls fly almost without a sound. Because of this, the small animals they hunt, like mice, usually don\'t hear them coming.',
        questions: [
          q('What is the talk mainly about?', ['How owls are able to hunt at night', 'Why mice are afraid of birds', 'How birds build nests', 'Why some birds sleep at night'], 'How owls are able to hunt at night'),
          q('Why do owls have large eyes?', ['To see well in the dark', 'To find water', 'To look bigger', 'To sleep during the day'], 'To see well in the dark'),
          q('What is special about an owl\'s head?', ['It can turn very far', 'It is very small', 'It has no feathers', 'It changes color'], 'It can turn very far'),
          q('Why do mice usually not hear owls coming?', ['Owls fly almost silently', 'Mice cannot hear well', 'Owls hunt during the day', 'Owls fly very high'], 'Owls fly almost silently'),
        ],
      },
    ],
  },
  buildSentence: [
    bs('Are you coming to the lecture tonight?', 'I can\'t, because I have to work until nine.', { chunks: ['can\'t,', 'because', 'I have', 'to work', 'until nine'], prefix: 'I' }),
    bs('What did the professor say about your essay?', 'He said that it needed more examples.', { chunks: ['said', 'that', 'it needed', 'more examples'], prefix: 'He', distractor: 'does' }),
    bs('Where can I find the lab manual?', 'You can download it from the course website.', { chunks: ['can download', 'it', 'from', 'the course website'], prefix: 'You' }),
    bs('Do you know when the bookstore opens?', 'I think it opens at half past eight.', { chunks: ['think', 'it opens', 'at', 'half past eight'], prefix: 'I' }),
  ],
}
