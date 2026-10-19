import { q, cw, bs } from './helpers.js'

const cr = (prompt, options, answer, explain = '') => ({ prompt, ...q('', options, answer, explain) })

export const TEST_2 = {
  title: 'TOEFL iBT Simulation Test 2',
  minutes: 75,
  sections: {
    reading: {
      intro: '<b>Reading.</b> Module 1, then Module 2 (harder or easier depending on your results). Each task has its own timer.',
      routing: [
        cw('Complete the Words', 'Coral reefs cover less than one percent of the ocean floor but support about a quarter of all marine species. Reefs {{are}} built by tiny animals called {{polyps}}, which {{produce}} hard skeletons {{of}} calcium carbonate. Over thousands {{of}} years, these skeletons pile {{up}} to form large structures. {{Today}}, rising ocean temperatures {{threaten}} many reefs, because heat {{causes}} the polyps to lose {{their}} colorful algae.'),
        {
          task: 'daily-life', title: 'Read in Daily Life', timeSec: 120, passageTitle: 'Chat',
          passage: '<b>Nina (18:02):</b> r u still selling ur old desk lamp?\n\n<b>Omar (18:05):</b> yep! $10, works perfectly. only issue is the switch is a bit stiff\n\n<b>Nina (18:06):</b> deal. can I pick it up tmrw after 5?\n\n<b>Omar (18:08):</b> I\'m at practice till 6. come by 6:30? Room 117, Pine Hall',
          questions: [
            q('What does Omar say about the lamp?', ['It works but the switch is hard to press', 'It needs a new bulb', 'It is broken', 'It is too expensive'], 'It works but the switch is hard to press'),
            q('When will Nina most likely pick up the lamp?', ['Tomorrow at 6:30', 'Tomorrow at 5:00', 'Tonight at 6:00', 'Tomorrow morning'], 'Tomorrow at 6:30'),
          ],
        },
        {
          task: 'academic-passage', title: 'Read an Academic Passage', timeSec: 420, passageTitle: 'The Invention of Standard Time',
          passage: 'Until the late nineteenth century, most towns set their clocks by the sun: noon was the moment the sun was highest in the sky. Because the sun reaches this point at slightly different moments in different places, a town just a few dozen kilometers to the west might be several minutes behind its neighbor.\n\nFor most of history, these small differences hardly mattered. The arrival of railways changed that. Trains connected distant towns on precise schedules, and railway companies struggled to publish timetables that worked in dozens of local times. Confusion, missed connections, and even accidents resulted.\n\nIn 1883, railways in the United States and Canada adopted a system of standard time zones, in which every location within a zone used the same time. An international conference in 1884 proposed a global system based on the meridian passing through Greenwich, England. Although some cities resisted at first, standard time gradually became the norm, showing how a new technology can reshape even something as basic as the measurement of time.',
          questions: [
            q('According to paragraph 1, why did nearby towns often have different times?', ['Each town set its clocks by the position of the sun', 'Towns used different types of clocks', 'Some towns ignored railway schedules', 'Clocks were often broken'], 'Each town set its clocks by the position of the sun'),
            q('The word "precise" in the passage is closest in meaning to', ['exact', 'difficult', 'flexible', 'public'], 'exact'),
            q('Why does the author mention accidents?', ['To show how serious the problem of local times had become', 'To argue that trains were dangerous', 'To explain how time zones are calculated', 'To compare American and European railways'], 'To show how serious the problem of local times had become'),
            q('Which of the following is NOT mentioned in the passage?', ['The cost of introducing standard time', 'The role of railway companies', 'A proposal based on Greenwich', 'Resistance from some cities'], 'The cost of introducing standard time'),
            q('What is the author\'s main point in the final sentence?', ['Technology can change basic aspects of daily life', 'Standard time was a mistake', 'Railways are no longer important', 'Cities should set their own time'], 'Technology can change basic aspects of daily life'),
          ],
        },
      ],
      upper: [
        cw('Complete the Words', 'Behavioral economists study why people often make decisions that do not serve their long-term interests. One {{well}}-known example is present bias: {{people}} tend to value immediate rewards {{far}} more than future ones, even {{when}} the future reward is {{larger}}. This {{helps}} explain why many {{individuals}} delay saving for retirement or {{postpone}} healthy habits, despite knowing {{the}} benefits they would {{eventually}} gain.'),
        {
          task: 'daily-life', title: 'Read in Daily Life', timeSec: 150, passageTitle: 'Policy notice',
          passage: '<b>UPDATED LATE-SUBMISSION POLICY — Department of Economics</b>\n\nEffective this semester, assignments submitted after the deadline will lose 5% of the available marks per day, up to a maximum of five days. Work submitted more than five days late will not be graded unless an extension was approved in advance.\n\nExtensions may be requested through the department portal no later than 48 hours before the deadline. Requests based on documented medical emergencies may be submitted at any time.',
          questions: [
            q('What happens to an assignment submitted three days late without an extension?', ['It loses 15% of the available marks', 'It is not graded', 'It loses 5% of the available marks', 'It must be resubmitted'], 'It loses 15% of the available marks'),
            q('According to the notice, which request could be made one hour before a deadline?', ['A request based on a documented medical emergency', 'A request for a two-day extension', 'Any request submitted through the portal', 'A request approved by another student'], 'A request based on a documented medical emergency'),
            q('The phrase "no later than" is closest in meaning to', ['at the latest', 'soon after', 'exactly', 'instead of'], 'at the latest'),
          ],
        },
        {
          task: 'academic-passage', title: 'Read an Academic Passage', timeSec: 420, passageTitle: 'Microplastics',
          passage: 'Microplastics — fragments of plastic smaller than five millimeters — have been found nearly everywhere scientists have looked, from deep ocean trenches to Arctic snow. Some are manufactured at that size, such as the tiny beads once common in cosmetics, but most result from the gradual breakdown of larger items like bottles, bags, and synthetic clothing.\n\nTheir small size makes them particularly difficult to manage. Wastewater treatment plants capture a large share of microplastics, but the captured material often ends up in sludge that is spread on farmland as fertilizer, returning the particles to the environment. Meanwhile, every wash of synthetic garments releases thousands of fibers.\n\nThe effects on living organisms are still being clarified. Laboratory studies show that some marine animals that ingest microplastics eat less and grow more slowly, yet researchers caution that laboratory concentrations are frequently far higher than those found in nature. Determining realistic risks, including any risks to human health, therefore remains an active area of research.',
          questions: [
            q('According to paragraph 1, where do most microplastics come from?', ['The breakdown of larger plastic objects', 'Cosmetic products', 'Deep ocean trenches', 'Arctic snow'], 'The breakdown of larger plastic objects'),
            q('Why does the author mention sludge spread on farmland?', ['To show that captured microplastics can return to the environment', 'To recommend a method of fertilizing crops', 'To explain how treatment plants work', 'To argue that farming produces plastic'], 'To show that captured microplastics can return to the environment'),
            q('The word "caution" in the passage is closest in meaning to', ['warn', 'agree', 'prove', 'hope'], 'warn'),
            q('What limitation of laboratory studies does the author point out?', ['They often use more microplastics than exist in nature', 'They study only land animals', 'They have found no effects', 'They are too expensive to repeat'], 'They often use more microplastics than exist in nature'),
            q('What can be inferred about the risks of microplastics to human health?', ['They are not yet clearly known', 'They have been proven to be serious', 'They are lower than the risks to animals', 'They have been studied only in the Arctic'], 'They are not yet clearly known'),
          ],
        },
      ],
      lower: [
        cw('Complete the Words', 'Many people keep a plant in their room. Plants {{make}} a room look nicer, and {{some}} people say they help them {{feel}} calm. Most house plants need {{water}} once or twice a {{week}}. They {{also}} need light, {{so}} it is a good idea {{to}} put them near a {{window}}. Too much water can {{kill}} a plant.'),
        {
          task: 'daily-life', title: 'Read in Daily Life', timeSec: 120, passageTitle: 'Sign',
          passage: '<b>GYM — POOL RULES</b>\n\n• Shower before entering the pool.\n• No food or glass bottles.\n• Children under 10 must be with an adult.\n• Lifeguard on duty: 7 a.m. – 9 p.m.',
          questions: [
            q('What must swimmers do before they enter the pool?', ['Take a shower', 'Show an ID', 'Talk to the lifeguard', 'Buy a ticket'], 'Take a shower'),
            q('What is NOT allowed at the pool?', ['Glass bottles', 'Children over 10', 'Swimming at 8 a.m.', 'Showers'], 'Glass bottles'),
          ],
        },
        {
          task: 'academic-passage', title: 'Read an Academic Passage', timeSec: 420, passageTitle: 'Camels in the Desert',
          passage: 'Camels are well known for living in hot, dry deserts. They can travel for many days without drinking water. Many people think camels store water in their humps, but this is not true. The hump is full of fat.\n\nThe fat in the hump gives the camel energy when there is little food. When a camel does not eat for a long time, its hump becomes smaller and may fall to one side.\n\nCamels have other useful features too. Their long eyelashes protect their eyes from sand, and their wide feet help them walk on soft sand without sinking. Because of these features, people in desert regions have used camels to carry goods for thousands of years.',
          questions: [
            q('What is in a camel\'s hump?', ['Fat', 'Water', 'Sand', 'Muscle'], 'Fat'),
            q('What happens to the hump when a camel does not eat for a long time?', ['It becomes smaller', 'It becomes harder', 'It fills with water', 'It grows bigger'], 'It becomes smaller'),
            q('The word "protect" in the passage is closest in meaning to', ['keep safe', 'clean', 'close', 'hurt'], 'keep safe'),
            q('Why do camels have wide feet?', ['To walk on soft sand without sinking', 'To run faster than horses', 'To dig for water', 'To carry heavy goods'], 'To walk on soft sand without sinking'),
            q('Why have people used camels for thousands of years?', ['They are well suited to life in the desert', 'They are very fast', 'They need a lot of water', 'They are easy to feed'], 'They are well suited to life in the desert'),
          ],
        },
      ],
    },
    listening: {
      intro: '<b>Listening.</b> Module 1, then Module 2. Each recording plays only once — use headphones.',
      routing: [
        {
          task: 'choose-response', title: 'Choose a Response', timeSec: 150,
          items: [
            cr('Are you going home for the holidays?', ['Yes, I fly out on the twentieth.', 'Home is where the heart is.', 'The holidays are long.', 'I went there by car.'], 'Yes, I fly out on the twentieth.'),
            cr('Can you recommend a good dentist near campus?', ['Dr. Moore on Elm Street is great.', 'My teeth are fine.', 'It\'s near the campus.', 'I recommend the soup.'], 'Dr. Moore on Elm Street is great.'),
            cr('The printer in the lab is jammed again.', ['I\'ll let the technician know.', 'I printed it yesterday.', 'The lab is upstairs.', 'Jam is sweet.'], 'I\'ll let the technician know.'),
            cr('Why don\'t you join the hiking club?', ['Maybe I will — when do they meet?', 'Because I joined.', 'The hike was long.', 'Clubs are popular.'], 'Maybe I will — when do they meet?'),
            cr('Who\'s giving the guest lecture tomorrow?', ['A scientist from the national museum.', 'Tomorrow at four.', 'It\'s in the big hall.', 'I gave it to her.'], 'A scientist from the national museum.'),
          ],
        },
        {
          task: 'conversation', title: 'Listen to a Conversation', timeSec: 50,
          script: 'Woman: Hi, Ben. Did you finish the reading for the seminar?\nMan: Most of it. But the second article was really dense. I didn\'t understand the part about sampling methods at all.\nWoman: Same here. Professor Novak said she\'d go over it in class, though.\nMan: That\'s a relief. Still, I\'d like to understand it before then. Want to look at it together at the library this afternoon?\nWoman: I have work until three, but I could meet at three-thirty.',
          questions: [
            q('What problem do the students have?', ['They found part of an article hard to understand', 'They lost the reading list', 'They missed the seminar', 'They cannot find the library'], 'They found part of an article hard to understand'),
            q('What will the students probably do this afternoon?', ['Study the article together', 'Visit Professor Novak', 'Work at the same place', 'Skip the seminar'], 'Study the article together'),
          ],
        },
        {
          task: 'announcement', title: 'Listen to an Announcement', timeSec: 50,
          script: 'Announcer: Attention, residents of North Hall. The fire alarm system will be tested tomorrow between ten a.m. and noon. You may hear the alarm several times during this period. There is no need to leave the building during the test. However, if the alarm sounds outside these hours, treat it as a real emergency and exit immediately by the nearest stairway.',
          questions: [
            q('What is the purpose of the announcement?', ['To inform residents about an alarm test', 'To report a fire in North Hall', 'To explain how to use the stairs', 'To ask residents to leave tomorrow'], 'To inform residents about an alarm test'),
            q('What should residents do if the alarm sounds at 3 p.m. tomorrow?', ['Leave the building immediately', 'Ignore it', 'Call the announcer', 'Wait until noon'], 'Leave the building immediately'),
          ],
        },
        {
          task: 'academic-talk', title: 'Listen to an Academic Talk', timeSec: 90,
          script: 'Professor: In today\'s architecture class, let\'s talk about green roofs — roofs that are partly or completely covered with plants. They\'re becoming popular in cities, and for good reasons.\nFirst, they help with rainwater. A normal roof sends rainwater straight into the drains, which can overflow during heavy storms. A green roof absorbs a lot of that water and releases it slowly.\nSecond, they insulate buildings. In summer, plants and soil keep the roof cooler, so the building needs less air conditioning.\nThere are challenges, though. Green roofs are heavy, especially when the soil is wet, so many older buildings would need to be reinforced first. And they need maintenance — someone has to look after the plants. So they\'re usually easier to include in new buildings than to add to old ones.',
          questions: [
            q('What is the talk mainly about?', ['The benefits and challenges of green roofs', 'How to repair old buildings', 'Why cities have heavy storms', 'How air conditioning works'], 'The benefits and challenges of green roofs'),
            q('How do green roofs help during heavy rain?', ['They absorb water and release it slowly', 'They send water quickly to the drains', 'They stop rain from falling on the city', 'They collect water for drinking'], 'They absorb water and release it slowly'),
            q('Why might older buildings need to be reinforced?', ['Green roofs can be very heavy', 'Old roofs are too cold', 'Plants damage old walls', 'Older buildings have no drains'], 'Green roofs can be very heavy'),
            q('What does the professor conclude?', ['Green roofs are easier to add to new buildings', 'Green roofs should be banned', 'Old buildings are better for green roofs', 'Green roofs need no maintenance'], 'Green roofs are easier to add to new buildings'),
          ],
        },
      ],
      upper: [
        {
          task: 'choose-response', title: 'Choose a Response', timeSec: 120,
          items: [
            cr('I don\'t suppose you\'ve seen my notebook anywhere?', ['I think you left it in the lecture hall.', 'I suppose so.', 'It was a good notebook.', 'I see it every day.'], 'I think you left it in the lecture hall.'),
            cr('It\'s a shame the concert got cancelled.', ['I know — I was really looking forward to it.', 'The concert was loud.', 'Shame on them.', 'They cancelled my order.'], 'I know — I was really looking forward to it.'),
            cr('You\'ve been to the new science building, haven\'t you?', ['Only once, for a lab tour.', 'Science is my major.', 'It\'s being built.', 'I haven\'t, have I?'], 'Only once, for a lab tour.'),
            cr('Wouldn\'t it be easier to just email the professor?', ['Probably, but I\'d rather ask in person.', 'Email is easy.', 'The professor is busy.', 'It would be.'], 'Probably, but I\'d rather ask in person.'),
          ],
        },
        {
          task: 'conversation', title: 'Listen to a Conversation', timeSec: 50,
          genders: { Student: 'male', Professor: 'female' },
          script: 'Student: Hi, I\'m interested in the research assistant position in your lab.\nProfessor: Great. Have you taken Cell Biology?\nStudent: Not yet — I\'m enrolled for next semester. But I worked in a hospital lab over the summer, so I\'m comfortable with basic procedures.\nProfessor: That\'s useful experience. Normally I require Cell Biology first, but I might make an exception. Could you send me a short description of what you did at the hospital?\nStudent: Absolutely. I\'ll have it to you by tomorrow.',
          questions: [
            q('Why might the student not qualify for the position?', ['He has not completed a required course', 'He has no laboratory experience', 'He applied too late', 'He works at a hospital'], 'He has not completed a required course'),
            q('Why does the professor ask for a description of the student\'s summer work?', ['To decide whether to make an exception', 'To check the student\'s writing', 'To recommend him to the hospital', 'To include it in her research'], 'To decide whether to make an exception'),
          ],
        },
        {
          task: 'academic-talk', title: 'Listen to an Academic Talk', timeSec: 90,
          script: 'Professor: Today we\'re looking at the so-called "Mozart effect." In 1993, a short study reported that college students who listened to a Mozart sonata for ten minutes performed slightly better on a spatial reasoning task right afterward. The media turned this into a much bigger claim: that classical music makes children smarter. Some governments even handed out classical CDs to new parents.\nWhat happened next is a good lesson in how science works. Other researchers tried to replicate the result and mostly couldn\'t. When the effect did appear, it was small, it lasted only minutes, and it wasn\'t specific to Mozart. Upbeat music of other kinds — even listening to an exciting story — produced similar results. The current interpretation is that the music simply increased arousal and mood, which can briefly improve performance on many tasks.',
          questions: [
            q('What is the main purpose of the talk?', ['To show how an early claim was revised by later research', 'To prove that classical music improves intelligence', 'To describe Mozart\'s life', 'To explain how spatial reasoning is tested'], 'To show how an early claim was revised by later research'),
            q('Why does the professor mention CDs given to new parents?', ['To show how far the original claim was exaggerated', 'To explain how the study was funded', 'To argue that parents should play music', 'To describe a later experiment'], 'To show how far the original claim was exaggerated'),
            q('What did later studies find?', ['The effect was small, brief, and not unique to Mozart', 'The effect lasted for years', 'Only Mozart produced the effect', 'Music made children less intelligent'], 'The effect was small, brief, and not unique to Mozart'),
            q('According to the current interpretation, why did performance improve?', ['The music improved listeners\' mood and alertness', 'Mozart\'s music contains mathematical patterns', 'Students practiced the task more', 'The task was easier the second time'], 'The music improved listeners\' mood and alertness'),
          ],
        },
      ],
      lower: [
        {
          task: 'choose-response', title: 'Choose a Response', timeSec: 120,
          items: [
            cr('Where did you buy that jacket?', ['At the mall downtown.', 'Last Saturday.', 'It\'s warm.', 'I bought two.'], 'At the mall downtown.'),
            cr('Can I sit here?', ['Of course.', 'I\'m sitting.', 'It\'s a chair.', 'Here it is.'], 'Of course.'),
            cr('I lost my keys.', ['Did you check your bag?', 'Keys are small.', 'I found a door.', 'They\'re mine.'], 'Did you check your bag?'),
            cr('How was your weekend?', ['Really relaxing, thanks.', 'It\'s on Sunday.', 'Two days.', 'I was at the weekend.'], 'Really relaxing, thanks.'),
          ],
        },
        {
          task: 'conversation', title: 'Listen to a Conversation', timeSec: 50,
          script: 'Man: Excuse me, does this bus go to the train station?\nWoman: No, this one goes to the airport. You need the number twelve.\nMan: Oh, thanks. Where does it stop?\nWoman: Just across the street, in front of the bank.',
          questions: [
            q('Where does the man want to go?', ['To the train station', 'To the airport', 'To the bank', 'To the bus office'], 'To the train station'),
            q('What will the man probably do next?', ['Cross the street to another bus stop', 'Get on the bus to the airport', 'Go into the bank', 'Take a taxi'], 'Cross the street to another bus stop'),
          ],
        },
        {
          task: 'academic-talk', title: 'Listen to an Academic Talk', timeSec: 90,
          script: 'Professor: Today let\'s talk about sleep. Most adults need seven to nine hours of sleep every night. But many students sleep much less, especially before exams.\nSleep is important for memory. While we sleep, the brain organizes what we learned during the day. So students who stay up all night to study often remember less than students who sleep well.\nThere are simple ways to sleep better. Go to bed at the same time every day, and stop using your phone an hour before bed, because the bright screen keeps the brain awake.',
          questions: [
            q('What is the talk mainly about?', ['Why sleep is important and how to sleep better', 'How to prepare for exams', 'How phones are made', 'Why students are tired in the morning'], 'Why sleep is important and how to sleep better'),
            q('How many hours of sleep do most adults need?', ['Seven to nine', 'Five to six', 'Ten to twelve', 'Three to four'], 'Seven to nine'),
            q('What happens in the brain during sleep?', ['It organizes what we learned', 'It forgets everything', 'It stops working', 'It becomes brighter'], 'It organizes what we learned'),
            q('Why should people stop using phones before bed?', ['The bright screen keeps the brain awake', 'Phones are expensive', 'Calls are too long', 'Phones need charging'], 'The bright screen keeps the brain awake'),
          ],
        },
      ],
    },
    writing: {
      intro: '<b>Writing.</b> Build a Sentence, then Write an Email (7 minutes) and an Academic Discussion post (10 minutes).',
      tasks: [
        {
          task: 'build-sentence', title: 'Build a Sentence', timeSec: 300,
          items: [
            bs('When does registration open?', 'It opens on the first day of next month.', { chunks: ['opens', 'on', 'the first day', 'of next month'], prefix: 'It' }),
            bs('Do you know who won the debate?', 'I heard that the team from Ohio won.', { chunks: ['heard', 'that', 'the team', 'from Ohio', 'won'], prefix: 'I' }),
            bs('What did the librarian tell you?', 'She told me where I could find the old newspapers.', { chunks: ['told me', 'where', 'I could', 'find', 'the old newspapers'], prefix: 'She', distractor: 'could I' }),
            bs('Why weren\'t you at practice?', 'I had to finish an essay that was due today.', { chunks: ['had to', 'finish', 'an essay', 'that was', 'due today'], prefix: 'I' }),
            bs('Is it worth taking the advanced course?', 'It is difficult, but you will learn a great deal.', { chunks: ['is difficult,', 'but', 'you will', 'learn', 'a great deal'], prefix: 'It' }),
            bs('How often do you go to the gym?', 'I usually go three times a week.', { chunks: ['usually', 'go', 'three times', 'a week'], prefix: 'I' }),
          ],
        },
        {
          task: 'email', title: 'Write an Email', timeSec: 420,
          scenario: 'You are a member of the university film club. The club wants to show a film for international students next month, and you have been asked to find a room. You would like to use the large lecture hall in the Humanities building.',
          toName: 'the building coordinator, Ms. Nguyen',
          points: ['Explain who you are and what event you are planning', 'Ask whether the room is available and what equipment it has', 'Describe how the club will make sure the room stays clean'],
          to: 'h.nguyen@university.edu', subject: 'Request to book the Humanities lecture hall',
        },
        {
          task: 'discussion', title: 'Academic Discussion', timeSec: 600,
          professor: { name: 'Dr. Williams', text: 'In our sociology class, we have been discussing communities. Some people say that social media has helped people stay connected with friends and family. Others argue that it has made relationships more superficial. Overall, do you think social media has had a positive or negative effect on personal relationships? Why?' },
          students: [
            { name: 'Aisha', text: 'Positive. My family lives in three different countries, and without video calls and group chats we would hardly ever talk.' },
            { name: 'Ryan', text: 'I think it\'s mostly negative. People have hundreds of online friends but fewer close ones, and they spend time scrolling instead of meeting in person.' },
          ],
        },
      ],
    },
    speaking: {
      intro: '<b>Speaking.</b> Allow the microphone. Listen and Repeat (7 sentences), then a short interview (4 questions, 45 seconds each). Recording starts automatically.',
      tasks: [
        {
          task: 'listen-repeat', title: 'Listen and Repeat',
          scenario: 'You are learning to work at the reception desk of the student sports center. Listen to the manager and repeat what he says.', gender: 'male',
          sentences: [
            'Good morning and welcome.',
            'Please scan your card at the gate.',
            'Lockers are available downstairs.',
            'The yoga class is in Studio B today.',
            'Towels can be rented for one dollar.',
            'The swimming pool closes thirty minutes before the gym.',
            'Remember to return all equipment to the shelves after use.',
          ],
        },
        {
          task: 'interview', title: 'Take an Interview', responseSec: 45,
          scenario: 'You are taking part in a study about food and health. A researcher will ask you some questions.',
          questions: [
            'What did you have for breakfast today, and is that typical for you?',
            'Do you prefer cooking at home or eating out? Why?',
            'Some people say fast food should be more expensive to encourage healthy eating. What do you think?',
            'Should schools teach students how to cook? Explain your opinion.',
          ],
        },
      ],
    },
  },
}
