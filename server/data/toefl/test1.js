import { q, cw, bs } from './helpers.js'

const cr = (prompt, options, answer, explain = '') => ({ prompt, ...q('', options, answer, explain) })

// Simulation Test 1. Reading and Listening: a first module for everyone,
// then `upper` (harder) or `lower` (easier) depending on the first.
export const TEST_1 = {
  title: 'TOEFL iBT Simulation Test 1',
  minutes: 75,
  sections: {
    reading: {
      intro: '<b>Reading.</b> Module 1, then Module 2 (harder or easier depending on your results). Each task has its own timer.',
      routing: [
        cw('Complete the Words', 'Volcanoes form where molten rock from deep inside the Earth reaches the surface. Most {{of}} them are {{found}} along the {{edges}} of tectonic plates, where {{the}} crust is either pulling apart {{or}} pushing together. When pressure {{builds}} up beneath the surface, {{gas}} and magma can explode upward, {{throwing}} ash high into the {{air}} and changing the shape {{of}} the land.'),
        {
          task: 'daily-life', title: 'Read in Daily Life', timeSec: 120, passageTitle: 'Notice',
          passage: '<b>BIKE PARKING UPDATE</b>\n\nThe bike racks in front of the Engineering Building will be removed on Monday, May 4, to make room for a new entrance ramp. Bikes left there after Sunday night will be moved to the campus security office.\n\nTemporary racks will be available behind the building, next to the parking garage.',
          questions: [
            q('Why are the bike racks being removed?', ['A new entrance ramp is being built', 'Too many bikes were stolen', 'The parking garage is being expanded', 'The Engineering Building is closing'], 'A new entrance ramp is being built'),
            q('What will happen to bikes left in front of the building on Monday?', ['They will be taken to the security office', 'Their owners will be fined', 'They will be moved to the parking garage', 'They will be given away'], 'They will be taken to the security office'),
          ],
        },
        {
          task: 'academic-passage', title: 'Read an Academic Passage', timeSec: 420, passageTitle: 'The Sense of Smell in Salmon',
          passage: 'Pacific salmon hatch in freshwater streams, swim hundreds or even thousands of kilometers into the ocean, and, several years later, return to the very stream where they were born in order to reproduce. How they manage this journey has fascinated biologists for decades.\n\nOn the open ocean, salmon appear to use the Earth\'s magnetic field to find the general direction of the coast. Once they reach the right river system, however, a different sense takes over: smell. Each stream has a distinctive chemical "signature" created by the soil, rocks, and plants in its area. Young salmon memorize this odor before they leave for the sea.\n\nExperiments support this idea. When researchers blocked the noses of returning salmon, the fish chose streams at random. In other studies, young salmon raised in water containing an artificial chemical later swam toward streams to which the same chemical had been added, even though they had never been there before.',
          questions: [
            q('The word "distinctive" in the passage is closest in meaning to', ['characteristic', 'strong', 'pleasant', 'temporary'], 'characteristic'),
            q('According to paragraph 2, how do salmon find the general direction of the coast?', ['By using the Earth\'s magnetic field', 'By following other fish', 'By recognizing the smell of the ocean', 'By observing the position of the sun'], 'By using the Earth\'s magnetic field'),
            q('When do young salmon learn the odor of their home stream?', ['Before they swim out to sea', 'When they first reach the ocean', 'Just before they reproduce', 'While they are returning to the coast'], 'Before they swim out to sea'),
            q('Why does the author mention salmon whose noses were blocked?', ['To provide evidence that smell guides the fish', 'To show that salmon can be harmed by experiments', 'To explain how salmon find the coast', 'To argue that salmon choose streams at random'], 'To provide evidence that smell guides the fish'),
            q('What can be inferred from the experiment with the artificial chemical?', ['Salmon are attracted to the smell they learned when young', 'Salmon prefer artificial chemicals to natural ones', 'Salmon cannot survive in unfamiliar streams', 'Salmon avoid streams they have never visited'], 'Salmon are attracted to the smell they learned when young'),
          ],
        },
      ],
      upper: [
        cw('Complete the Words', 'The idea of a "circular economy" challenges the traditional model of take, make, and dispose. Instead {{of}} discarding products at the {{end}} of their use, a {{circular}} system aims to keep {{materials}} in circulation for as {{long}} as possible {{through}} repair, {{reuse}}, and recycling. Advocates argue {{that}} this approach reduces waste {{while}} also creating new business {{opportunities}}.'),
        {
          task: 'daily-life', title: 'Read in Daily Life', timeSec: 150, passageTitle: 'Email',
          passage: '<b>From:</b> Graduate Writing Center\n<b>Subject:</b> Thesis boot camp — limited spots\n\nDear graduate students,\n\nOur annual Thesis Boot Camp will run January 8–12. Participants commit to writing from 9 a.m. to 4 p.m. each day in a distraction-free room, with one-on-one consultations available every afternoon.\n\nBecause demand has exceeded capacity in previous years, applicants must submit a one-paragraph statement describing their current progress and goals. Priority will be given to students within a year of their defense date.\n\nApplications close December 1.',
          questions: [
            q('What is the main purpose of the email?', ['To invite applications for an intensive writing program', 'To remind students of their thesis defense dates', 'To announce new hours for the Writing Center', 'To offer paid writing consultations'], 'To invite applications for an intensive writing program'),
            q('Why are applicants asked to submit a statement?', ['More students want to attend than there are places', 'The Writing Center needs a writing sample to grade', 'Statements are required for the thesis defense', 'Consultants want to prepare feedback in advance'], 'More students want to attend than there are places'),
            q('Which student is most likely to be given priority?', ['A student defending a thesis in eight months', 'A student who attended last year', 'A student who has not chosen a topic', 'A student who can attend only in the mornings'], 'A student defending a thesis in eight months'),
          ],
        },
        {
          task: 'academic-passage', title: 'Read an Academic Passage', timeSec: 420, passageTitle: 'The Placebo Effect',
          passage: 'A placebo is a treatment with no active ingredient, such as a sugar pill, yet patients who receive one sometimes report genuine improvements in their symptoms. This placebo effect is so consistent that new drugs are routinely tested against placebos: a medicine is considered effective only if it outperforms an inactive treatment.\n\nFor a long time, the effect was dismissed as imagination. Brain-imaging studies have complicated that view. In patients who expect pain relief from a placebo, the brain releases its own natural painkillers, and activity decreases in regions associated with pain. Expectations, in other words, can produce measurable physical changes.\n\nThe effect is not limitless. Placebos have little influence on conditions such as infections or tumors, and they work best on symptoms that the brain itself modulates, such as pain, nausea, and fatigue. Intriguingly, some studies have found that placebos can help even when patients are told openly that the pills contain no medicine — a finding that researchers are still trying to explain.',
          questions: [
            q('The word "routinely" in the passage is closest in meaning to', ['regularly', 'carefully', 'rarely', 'recently'], 'regularly'),
            q('According to paragraph 1, when is a new medicine considered effective?', ['When it produces better results than a placebo', 'When patients report feeling better', 'When it contains a sugar-based ingredient', 'When it has no side effects'], 'When it produces better results than a placebo'),
            q('What is the purpose of paragraph 2?', ['To present evidence that challenges an earlier explanation', 'To describe how placebos are manufactured', 'To argue that pain is mostly imaginary', 'To explain why placebos are dangerous'], 'To present evidence that challenges an earlier explanation'),
            q('According to the passage, placebos are LEAST likely to help with', ['an infection', 'pain', 'nausea', 'fatigue'], 'an infection'),
            q('What does the author suggest about "open-label" placebos at the end of the passage?', ['Their effect is not yet fully understood', 'They work only on infections', 'They have been proven ineffective', 'They are more powerful than real drugs'], 'Their effect is not yet fully understood'),
          ],
        },
      ],
      lower: [
        cw('Complete the Words', 'Many students drink coffee to stay awake while they study. Coffee {{has}} caffeine, which {{makes}} the {{brain}} feel more alert for {{several}} hours. However, too {{much}} caffeine can make it {{hard}} to sleep at night. {{Doctors}} say it is better {{to}} stop drinking coffee in {{the}} afternoon and to get {{enough}} rest.'),
        {
          task: 'daily-life', title: 'Read in Daily Life', timeSec: 120, passageTitle: 'Menu board',
          passage: '<b>CAMPUS CAFÉ — TODAY\'S SPECIALS</b>\n\nSoup of the day: Tomato & basil — $3.50\nVeggie wrap — $5.00\nChicken salad — $6.50\n\nStudent deal: any special + a drink for $1 off (show your ID).\nClosed today from 2 to 3 p.m. for staff training.',
          questions: [
            q('How can students get a discount?', ['By showing their student ID', 'By coming before 2 p.m.', 'By ordering two soups', 'By bringing their own cup'], 'By showing their student ID'),
            q('What is true about the café today?', ['It will close for one hour in the afternoon', 'It sells only vegetarian food', 'It is closed all afternoon', 'It offers free drinks'], 'It will close for one hour in the afternoon'),
          ],
        },
        {
          task: 'academic-passage', title: 'Read an Academic Passage', timeSec: 420, passageTitle: 'Why Leaves Change Color',
          passage: 'In many parts of the world, the leaves of trees turn yellow, orange, and red in the fall. Leaves are green most of the year because they contain chlorophyll, a substance that helps plants make food from sunlight.\n\nWhen days become shorter and colder, trees stop producing chlorophyll. As the green color fades, other colors that were in the leaves all along, such as yellow and orange, become visible. Some trees also make new red substances in the fall.\n\nEventually the leaves fall to the ground. This helps trees save water and energy during the winter, when there is less sunlight. In spring, the trees grow new green leaves.',
          questions: [
            q('Why are leaves green most of the year?', ['They contain chlorophyll', 'They receive a lot of water', 'They grow in cold weather', 'They are very young'], 'They contain chlorophyll'),
            q('The word "fades" in the passage is closest in meaning to', ['becomes weaker', 'becomes brighter', 'moves', 'changes shape'], 'becomes weaker'),
            q('According to paragraph 2, where do yellow and orange colors come from?', ['They were already in the leaves', 'They are made by sunlight', 'They come from the soil', 'They appear only on old trees'], 'They were already in the leaves'),
            q('Why do trees lose their leaves?', ['To save water and energy in winter', 'Because animals eat them', 'To make room for flowers', 'Because the leaves turn red'], 'To save water and energy in winter'),
            q('What happens in spring?', ['Trees grow new green leaves', 'Leaves turn yellow', 'Trees stop making chlorophyll', 'Leaves fall to the ground'], 'Trees grow new green leaves'),
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
            cr('Do you want to study together for the midterm?', ['Sure, how about Thursday evening?', 'The midterm is in Room 4.', 'I studied abroad last year.', 'Together they make ten.'], 'Sure, how about Thursday evening?'),
            cr('Where is the nearest bus stop?', ['Right across the street.', 'At about five o\'clock.', 'It stops often.', 'I took the bus.'], 'Right across the street.'),
            cr('I forgot my wallet at home.', ['Don\'t worry, I can pay for lunch.', 'Home is far away.', 'The wallet is brown.', 'I forgot it too yesterday.'], 'Don\'t worry, I can pay for lunch.'),
            cr('Hasn\'t the seminar already started?', ['No, it was pushed back half an hour.', 'The seminar is about history.', 'Yes, I started it.', 'It is in the main building.'], 'No, it was pushed back half an hour.'),
            cr('Which textbook do we need for this course?', ['Only the one on the syllabus.', 'I need a new course.', 'The book is heavy.', 'It was a good course.'], 'Only the one on the syllabus.'),
          ],
        },
        {
          task: 'conversation', title: 'Listen to a Conversation', timeSec: 50,
          script: 'Man: Excuse me, is this where I pick up my student ID card?\nWoman: It is. Did you submit a photo online?\nMan: I did, last week.\nWoman: Okay, what\'s your name?\nMan: David Kim.\nWoman: Hmm, I see your request, but the photo was rejected because it was too dark. You\'ll need to take a new one. We have a camera right here.\nMan: Oh, great. Can I do it now? I need the card to get into the library tonight.',
          questions: [
            q('Why hasn\'t the man received his ID card?', ['His photo did not meet the requirements', 'He forgot to submit a request', 'The office has run out of cards', 'He gave the wrong name'], 'His photo did not meet the requirements'),
            q('Why does the man want the card quickly?', ['He needs it to enter the library', 'He is leaving campus tonight', 'He has an exam tomorrow', 'He wants to buy a meal plan'], 'He needs it to enter the library'),
          ],
        },
        {
          task: 'announcement', title: 'Listen to an Announcement', timeSec: 50,
          script: 'Professor: Quick reminder before you leave. Next week\'s class will not be held in this room. We\'re meeting in the computer lab on the second floor, Room 210, because we\'ll be practicing with the statistics software. Please install the free student version on your laptop before then if you can — the link is on the course page. If your laptop can\'t run it, don\'t worry; the lab computers already have it.',
          questions: [
            q('What is the main point of the announcement?', ['Next week\'s class will be in a different room', 'The course page has been updated', 'Students must buy new software', 'Class is cancelled next week'], 'Next week\'s class will be in a different room'),
            q('What does the professor say about students whose laptops cannot run the software?', ['They can use the lab computers', 'They should buy a new laptop', 'They should skip the class', 'They can borrow a laptop from her'], 'They can use the lab computers'),
          ],
        },
        {
          task: 'academic-talk', title: 'Listen to an Academic Talk', timeSec: 90,
          script: 'Professor: Let\'s look at a question from psychology: why do we forget things? One old idea was that memories simply fade over time, like ink in the sun. But research suggests that a lot of forgetting is caused by interference — other memories getting in the way.\nThere are two kinds. Proactive interference is when old information makes it harder to learn something new. Say you\'ve had the same phone number for years, then you get a new one — you keep giving people the old number. Retroactive interference works the other way: new learning makes old memories harder to recall. If you study Spanish this year, you might find it harder to remember the Italian you studied last year.\nThe practical lesson? Spacing out study sessions and switching between very similar topics less often can reduce interference.',
          questions: [
            q('What is the talk mainly about?', ['How interference between memories causes forgetting', 'Why phone numbers are hard to remember', 'How to learn Spanish and Italian', 'The history of memory research'], 'How interference between memories causes forgetting'),
            q('Why does the professor mention a phone number?', ['To illustrate proactive interference', 'To show that memories fade over time', 'To explain retroactive interference', 'To describe a memory experiment'], 'To illustrate proactive interference'),
            q('According to the professor, what is retroactive interference?', ['New learning making older memories harder to recall', 'Old memories making new learning harder', 'Memories fading like ink', 'Forgetting caused by lack of sleep'], 'New learning making older memories harder to recall'),
            q('What advice does the professor give?', ['Space out study sessions', 'Study similar topics at the same time', 'Learn only one language', 'Write notes in ink'], 'Space out study sessions'),
          ],
        },
      ],
      upper: [
        {
          task: 'choose-response', title: 'Choose a Response', timeSec: 120,
          items: [
            cr('You wouldn\'t happen to have a spare charger, would you?', ['Actually, I do — here you go.', 'I happened to be there.', 'It\'s fully charged.', 'Spare time is rare.'], 'Actually, I do — here you go.'),
            cr('I can\'t believe they\'re raising tuition again.', ['I know, it\'s getting really hard to afford.', 'They raised their hands.', 'Tuition is paid in August.', 'I believe in them.'], 'I know, it\'s getting really hard to afford.'),
            cr('Shouldn\'t the results have been posted by now?', ['The professor said there was a delay.', 'They posted a letter.', 'The results were good.', 'Now is a good time.'], 'The professor said there was a delay.'),
            cr('How come you switched to the evening section?', ['It fits better with my work schedule.', 'I switched off the light.', 'The evening was nice.', 'It comes at seven.'], 'It fits better with my work schedule.'),
          ],
        },
        {
          task: 'conversation', title: 'Listen to a Conversation', timeSec: 50,
          script: 'Student: Professor Ahmed, do you have a minute? It\'s about my paper on renewable energy.\nProfessor: Of course. What\'s on your mind?\nStudent: Well, I found a really interesting report, but it\'s from a company that sells solar panels. I\'m not sure I can use it.\nProfessor: Good instinct. You can use it, but you need to acknowledge the possible bias. Better yet, see whether an independent source confirms the same figures.\nStudent: The government energy agency publishes similar data, I think.\nProfessor: Then cite both. That actually makes your argument stronger.',
          questions: [
            q('Why is the student uncertain about the report?', ['Its author may have a financial interest in the topic', 'It is too old to be useful', 'It is written in another language', 'It contradicts the professor\'s lecture'], 'Its author may have a financial interest in the topic'),
            q('What does the professor imply about citing both sources?', ['It will make the paper more convincing', 'It is not allowed in this course', 'It will make the paper too long', 'It is unnecessary if the data are similar'], 'It will make the paper more convincing'),
          ],
        },
        {
          task: 'academic-talk', title: 'Listen to an Academic Talk', timeSec: 90,
          genders: { Professor: 'female' },
          script: 'Professor: Today, a puzzle from astronomy. When we measure how fast stars orbit the center of a galaxy, we find something odd. Based on the visible matter — stars, gas, dust — the outer stars should move more slowly than the inner ones, just as the outer planets in our solar system move more slowly than Mercury. But they don\'t. Outer stars move about as fast as inner ones.\nThe most widely accepted explanation is dark matter: an invisible form of matter that doesn\'t emit or absorb light but adds gravity. Estimates suggest there\'s roughly five times more dark matter than ordinary matter. The catch is that no experiment has detected a dark matter particle directly. A minority of physicists therefore argue that our theory of gravity itself needs modification at very large scales. For now, dark matter remains the leading hypothesis, but the question is far from settled.',
          questions: [
            q('What puzzle does the professor describe?', ['Outer stars in galaxies move faster than expected', 'Galaxies contain fewer stars than predicted', 'Mercury moves more slowly than outer planets', 'Light from distant stars is disappearing'], 'Outer stars in galaxies move faster than expected'),
            q('Why does the professor mention the planets of our solar system?', ['To show what we would normally expect', 'To prove that dark matter exists', 'To compare their size with galaxies', 'To explain how light is absorbed'], 'To show what we would normally expect'),
            q('What is the main weakness of the dark matter explanation, according to the professor?', ['Its particles have never been detected directly', 'It cannot explain the speed of stars', 'It requires changing the theory of gravity', 'Most physicists reject it'], 'Its particles have never been detected directly'),
            q('What is the professor\'s attitude toward the question?', ['She considers it unresolved', 'She thinks it has been solved', 'She thinks it is unimportant', 'She believes the minority view is correct'], 'She considers it unresolved'),
          ],
        },
      ],
      lower: [
        {
          task: 'choose-response', title: 'Choose a Response', timeSec: 120,
          items: [
            cr('What time does the library close tonight?', ['At ten.', 'It\'s very close.', 'Tonight is Friday.', 'In the library.'], 'At ten.'),
            cr('Thanks for helping me move my boxes.', ['You\'re welcome — anytime.', 'The boxes are big.', 'I moved last year.', 'Help is on the desk.'], 'You\'re welcome — anytime.'),
            cr('Is there a pharmacy on campus?', ['Yes, in the health center.', 'I don\'t feel well.', 'The campus is large.', 'It\'s my medicine.'], 'Yes, in the health center.'),
            cr('Let\'s get pizza after the game.', ['Great idea!', 'The game was long.', 'Pizza is from Italy.', 'I got it.'], 'Great idea!'),
          ],
        },
        {
          task: 'conversation', title: 'Listen to a Conversation', timeSec: 50,
          script: 'Woman: Hi, I want to join the swimming class, but the website says it\'s full.\nMan: Yes, the Monday class is full. But we just opened a new class on Wednesdays at six.\nWoman: Wednesday at six is perfect. Can I sign up here?\nMan: Sure. I just need your name and student number.',
          questions: [
            q('What does the woman want to do?', ['Join a swimming class', 'Get a job at the pool', 'Change her student number', 'Cancel a class'], 'Join a swimming class'),
            q('What will the woman probably do next?', ['Give the man her name and student number', 'Come back on Monday', 'Check the website again', 'Go swimming right away'], 'Give the man her name and student number'),
          ],
        },
        {
          task: 'academic-talk', title: 'Listen to an Academic Talk', timeSec: 90,
          script: 'Professor: Today we\'ll talk about bamboo. Bamboo looks like a tree, but it is actually a kind of grass. It is one of the fastest-growing plants in the world. Some types can grow almost one meter in a single day!\nPeople use bamboo for many things. In some countries, it is used to build houses and bridges, because it is light but very strong. It is also used to make furniture, paper, and even clothes.\nBamboo is also good for the environment. It grows back quickly after it is cut, so people don\'t need to plant it again.',
          questions: [
            q('What is the talk mainly about?', ['Bamboo and its uses', 'How to build a bridge', 'The tallest trees in the world', 'How clothes are made'], 'Bamboo and its uses'),
            q('What does the professor say about bamboo?', ['It is a kind of grass', 'It is a kind of tree', 'It grows very slowly', 'It is very heavy'], 'It is a kind of grass'),
            q('Why is bamboo used for building?', ['It is light but strong', 'It is cheap to paint', 'It does not need water', 'It is easy to burn'], 'It is light but strong'),
            q('Why is bamboo good for the environment?', ['It grows back quickly after cutting', 'It cleans water', 'It is used for paper', 'It grows only in cold places'], 'It grows back quickly after cutting'),
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
            bs('Where should we meet for the group project?', 'Let\'s meet in the lounge on the first floor.', { chunks: ['meet', 'in the lounge', 'on', 'the first floor'], prefix: 'Let\'s' }),
            bs('Did you understand the lecture today?', 'Not really, so I am going to watch the recording.', { chunks: ['so', 'I am going', 'to watch', 'the recording'], prefix: 'Not really,' }),
            bs('What did the advisor ask you?', 'She asked what courses I was planning to take.', { chunks: ['asked', 'what courses', 'I was', 'planning', 'to take'], prefix: 'She', distractor: 'did' }),
            bs('Why are you so happy today?', 'I just found out that I got the scholarship.', { chunks: ['just', 'found out', 'that', 'I got', 'the scholarship'], prefix: 'I' }),
            bs('Is the new café any good?', 'The coffee is great, but it is always crowded.', { chunks: ['coffee', 'is great,', 'but', 'it is', 'always', 'crowded'], prefix: 'The' }),
            bs('Have you finished your application?', 'I still need to ask my professor for a reference.', { chunks: ['still', 'need', 'to ask', 'my professor', 'for a reference'], prefix: 'I' }),
          ],
        },
        {
          task: 'email', title: 'Write an Email', timeSec: 420,
          scenario: 'Last week you borrowed a camera from your university\'s media center for a class project. When you returned it, you noticed that the lens cap was missing. You think you may have left it in the classroom.',
          toName: 'the media center manager, Mr. Lopez',
          points: ['Explain what happened', 'Describe what you have done to find the lens cap', 'Ask what you should do now'],
          to: 'media.lopez@university.edu', subject: 'Missing lens cap — camera #14',
        },
        {
          task: 'discussion', title: 'Academic Discussion', timeSec: 600,
          professor: { name: 'Dr. Patel', text: 'This week we have been studying how people learn new skills. Some people believe it is better to learn a skill on your own, using online videos and practice. Others believe it is better to learn from a teacher or coach. Which approach do you think is more effective, and why?' },
          students: [
            { name: 'Lucas', text: 'I prefer learning on my own. There are amazing free videos online, and I can learn at my own pace without paying for lessons.' },
            { name: 'Hana', text: 'A teacher is better because they can see your mistakes and correct them immediately. When I taught myself guitar, I developed bad habits that were hard to fix later.' },
          ],
        },
      ],
    },
    speaking: {
      intro: '<b>Speaking.</b> Allow the microphone. Listen and Repeat (7 sentences), then a short interview (4 questions, 45 seconds each). Recording starts automatically.',
      tasks: [
        {
          task: 'listen-repeat', title: 'Listen and Repeat',
          scenario: 'You are learning to welcome new students at the campus orientation. Listen to the coordinator and repeat what she says.',
          sentences: [
            'Welcome to orientation day.',
            'Please pick up your name tag here.',
            'The campus tour starts at eleven.',
            'Lunch will be served in the main hall.',
            'Make sure you download the university app.',
            'Your student ID card will be ready this afternoon.',
            'If you get lost, look for a volunteer in a green shirt.',
          ],
        },
        {
          task: 'interview', title: 'Take an Interview', responseSec: 45,
          scenario: 'You are taking part in a research study about learning habits. A researcher will ask you some questions.',
          questions: [
            'Where do you usually study, and why do you like that place?',
            'Do you prefer studying in the morning or at night? Why?',
            'Some people think group study is a waste of time. What do you think?',
            'Should schools give less homework so students have more free time? Explain your opinion.',
          ],
        },
      ],
    },
  },
}
