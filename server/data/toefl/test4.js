import { q, cw, bs } from './helpers.js'

const cr = (prompt, options, answer, explain = '') => ({ prompt, ...q('', options, answer, explain) })

export const TEST_4 = {
  title: 'TOEFL iBT Simulation Test 4',
  minutes: 75,
  sections: {
    reading: {
      intro: '<b>Reading.</b> Module 1, then Module 2 (harder or easier depending on your results). Each task has its own timer.',
      routing: [
        cw('Complete the Words', 'The human heart is a muscular pump about the size of a fist. It {{beats}} around one hundred thousand times {{each}} day, pushing blood through a {{network}} of vessels that reaches every {{part}} of the body. Blood carries {{oxygen}} and nutrients to the cells {{and}} removes waste products. Regular {{exercise}} makes the heart stronger, so {{it}} can pump more blood {{with}} each {{beat}}.'),
        {
          task: 'daily-life', title: 'Read in Daily Life', timeSec: 120, passageTitle: 'Notice',
          passage: '<b>WRITING CENTER — FINALS WEEK</b>\n\nDuring finals week (Dec 9–13), appointments are limited to 30 minutes so that more students can be seen. Walk-in visits will not be available.\n\nBook online at least 24 hours in advance. If you cannot attend, please cancel so another student can take your spot.',
          questions: [
            q('What change is made during finals week?', ['Appointments are shorter', 'The center is closed', 'Only walk-in visits are allowed', 'Appointments are longer'], 'Appointments are shorter'),
            q('Why are students asked to cancel appointments they cannot attend?', ['So other students can use the time', 'To avoid paying a fee', 'So the center can close early', 'To book a longer session'], 'So other students can use the time'),
          ],
        },
        {
          task: 'academic-passage', title: 'Read an Academic Passage', timeSec: 420, passageTitle: 'Coffee and Coffeehouses',
          passage: 'Coffee was first cultivated in the region around Yemen, and by the fifteenth century it was widely drunk in the Arabian Peninsula. From there, the drink spread through the Ottoman Empire and, in the seventeenth century, reached Europe.\n\nIn European cities such as London, coffeehouses quickly became much more than places to drink coffee. For the price of a single cup, customers could stay for hours, read newspapers, and debate politics and science with strangers. Because they were cheap and open to men of many social classes, coffeehouses were sometimes called "penny universities."\n\nSome coffeehouses developed into important institutions. Merchants and ship owners gathered at one London coffeehouse to exchange news about shipping, and that meeting place eventually grew into Lloyd\'s, one of the world\'s largest insurance markets. Not everyone approved, however: the English king tried to close coffeehouses in 1675, fearing they encouraged criticism of the government. The order was withdrawn within days after strong public protest.',
          questions: [
            q('According to paragraph 1, where was coffee first grown?', ['In the region around Yemen', 'In London', 'In the Ottoman capital', 'Across Europe'], 'In the region around Yemen'),
            q('Why were coffeehouses called "penny universities"?', ['People could learn and discuss ideas there cheaply', 'They were located near universities', 'Students worked there to pay for school', 'They charged university professors one penny'], 'People could learn and discuss ideas there cheaply'),
            q('The word "institutions" in the passage is closest in meaning to', ['established organizations', 'large buildings', 'famous people', 'old traditions'], 'established organizations'),
            q('Why did the king try to close coffeehouses?', ['He feared they encouraged criticism of the government', 'He thought coffee was unhealthy', 'He wanted to protect insurance companies', 'They were too expensive'], 'He feared they encouraged criticism of the government'),
            q('What can be inferred about the king\'s order?', ['Public opinion forced the king to change his decision', 'It closed coffeehouses for many years', 'It applied only to Lloyd\'s', 'It was supported by merchants'], 'Public opinion forced the king to change his decision'),
          ],
        },
      ],
      upper: [
        cw('Complete the Words', 'Antibiotic resistance occurs when bacteria evolve so that drugs no longer kill them. Each {{time}} an antibiotic is used, the most {{vulnerable}} bacteria die, while a few {{resistant}} ones may survive and multiply. {{Overuse}} of antibiotics, for example to {{treat}} viral infections they cannot cure, {{accelerates}} this process. Health experts {{therefore}} urge doctors to prescribe them {{only}} when necessary and patients {{to}} finish {{the}} full course.'),
        {
          task: 'daily-life', title: 'Read in Daily Life', timeSec: 150, passageTitle: 'Email',
          passage: '<b>From:</b> Dr. Samuel Okoro\n<b>To:</b> Research assistants\n<b>Subject:</b> Data collection — revised plan\n\nTeam,\n\nThe ethics committee has approved our study, with one condition: participants under 18 must now provide a signed form from a parent, not just their own consent. I realize this will slow us down at the two high schools.\n\nTo stay on schedule, let\'s begin with the university sample next week and move the school visits to March. Please print the new parental forms (attached) and bring them to Thursday\'s meeting, where we\'ll go over the procedure.\n\nSam',
          questions: [
            q('What new requirement did the ethics committee add?', ['Young participants need a parent\'s signed permission', 'The study must include more schools', 'Participants must be over 18', 'The study must end in March'], 'Young participants need a parent\'s signed permission'),
            q('How does Dr. Okoro plan to deal with the delay?', ['By changing the order in which groups are studied', 'By cancelling the school visits', 'By hiring more assistants', 'By asking the committee to reconsider'], 'By changing the order in which groups are studied'),
            q('What should the assistants bring on Thursday?', ['Printed copies of the parental forms', 'Signed consent forms from students', 'Their data from the university', 'A schedule of the school visits'], 'Printed copies of the parental forms'),
          ],
        },
        {
          task: 'academic-passage', title: 'Read an Academic Passage', timeSec: 420, passageTitle: 'Memory Is Reconstructive',
          passage: 'We often think of memory as a recording that we replay when we remember. Decades of research suggest otherwise. Each time we recall an event, we reconstruct it from fragments, filling gaps with expectations, knowledge, and information acquired later. As a result, memories can change without our noticing.\n\nIn a classic series of experiments, participants watched a film of a car accident and were then asked how fast the cars were going when they "hit" or "smashed into" each other. Those who heard "smashed" gave higher speed estimates, and a week later they were more likely to report having seen broken glass — although there had been none.\n\nSuch findings have serious implications for the legal system, where eyewitness testimony can be decisive. Confident witnesses are not necessarily accurate ones; confidence can actually grow as a memory is retold. Consequently, many researchers recommend that police record a witness\'s first account, ask open rather than leading questions, and treat later recollections with caution.',
          questions: [
            q('What is the author\'s main point in paragraph 1?', ['Remembering involves rebuilding events, which can alter them', 'Memories are exact recordings of the past', 'People forget most events quickly', 'Expectations have no effect on memory'], 'Remembering involves rebuilding events, which can alter them'),
            q('Why does the author describe the car accident experiment?', ['To provide evidence that wording can change memories', 'To show how fast cars were going', 'To explain how accidents happen', 'To argue that films are unreliable'], 'To provide evidence that wording can change memories'),
            q('The word "decisive" in the passage is closest in meaning to', ['able to determine the outcome', 'easy to understand', 'often mistaken', 'quickly forgotten'], 'able to determine the outcome'),
            q('According to paragraph 3, what is true about confident witnesses?', ['Their memories may still be inaccurate', 'They are usually correct', 'They rarely change their stories', 'They should be questioned with leading questions'], 'Their memories may still be inaccurate'),
            q('Which recommendation is NOT mentioned in the passage?', ['Showing witnesses photographs of the scene', 'Recording a witness\'s first account', 'Asking open questions', 'Being careful with later recollections'], 'Showing witnesses photographs of the scene'),
          ],
        },
      ],
      lower: [
        cw('Complete the Words', 'Breakfast is often called the most important meal of the day. After a long {{night}}, the body needs energy to start {{the}} morning. A good breakfast can {{help}} students pay attention in {{class}}. Healthy choices include fruit, eggs, {{and}} bread. Some people are not {{hungry}} in the morning, so they {{eat}} later. Doctors say it is {{best}} to eat something {{small}} rather than {{nothing}}.'),
        {
          task: 'daily-life', title: 'Read in Daily Life', timeSec: 120, passageTitle: 'Sign',
          passage: '<b>COMPUTER LAB</b>\n\nOpen 8 a.m. – 11 p.m.\nNo food. Drinks with lids only.\nPrinting: 10 cents per page.\nPlease log out when you leave.',
          questions: [
            q('What is allowed in the computer lab?', ['A drink with a lid', 'A sandwich', 'An open cup of coffee', 'Snacks'], 'A drink with a lid'),
            q('How much does it cost to print five pages?', ['50 cents', '10 cents', '5 cents', '1 dollar'], '50 cents'),
          ],
        },
        {
          task: 'academic-passage', title: 'Read an Academic Passage', timeSec: 420, passageTitle: 'Penguins',
          passage: 'Penguins are birds, but they cannot fly. Instead, they are excellent swimmers. Their wings work like flippers, and their bodies have a smooth shape that helps them move quickly through water.\n\nMost penguins live in the Southern Hemisphere, and some live in very cold places like Antarctica. They have thick layers of fat and tightly packed feathers that keep them warm. Emperor penguins stand close together in large groups to share body heat during winter storms.\n\nPenguins eat fish, squid, and small sea animals called krill. Some penguins can dive more than 500 meters deep to find food.',
          questions: [
            q('What is special about penguins as birds?', ['They cannot fly but swim very well', 'They fly very high', 'They live only in hot places', 'They do not eat fish'], 'They cannot fly but swim very well'),
            q('What helps penguins stay warm?', ['Fat and tightly packed feathers', 'Long legs', 'Warm water', 'Their flippers'], 'Fat and tightly packed feathers'),
            q('Why do emperor penguins stand close together?', ['To share body heat', 'To catch fish', 'To protect their eggs from birds', 'To make noise'], 'To share body heat'),
            q('The word "dive" in the passage is closest in meaning to', ['go down under water', 'fly in the air', 'walk on ice', 'eat quickly'], 'go down under water'),
            q('Where do most penguins live?', ['In the Southern Hemisphere', 'In the Arctic', 'In deserts', 'In rivers'], 'In the Southern Hemisphere'),
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
            cr('Could you hold the door for me?', ['Of course — those boxes look heavy.', 'The door is open.', 'I hold it every day.', 'It\'s a wooden door.'], 'Of course — those boxes look heavy.'),
            cr('Didn\'t you say you\'d already taken this class?', ['I took the introductory one, not this one.', 'I said hello.', 'The class is full.', 'I\'ll take it.'], 'I took the introductory one, not this one.'),
            cr('What time should we leave for the airport?', ['Around six, to avoid traffic.', 'At the airport.', 'The plane is big.', 'We left yesterday.'], 'Around six, to avoid traffic.'),
            cr('My laptop just crashed in the middle of my essay.', ['Did you save it in the cloud?', 'The essay is long.', 'Cars crash sometimes.', 'My laptop is new.'], 'Did you save it in the cloud?'),
            cr('Who\'s organizing the end-of-year party?', ['The student council, I think.', 'At the end of the year.', 'It was a great party.', 'I organized my desk.'], 'The student council, I think.'),
          ],
        },
        {
          task: 'conversation', title: 'Listen to a Conversation', timeSec: 50,
          script: 'Man: Hey, Nina, are you taking Professor Grey\'s statistics class next semester?\nWoman: I wanted to, but it\'s already full.\nMan: Oh, no. There\'s a waiting list, though. People usually drop the class in the first week.\nWoman: Really? Then maybe I\'ll add my name to the list.\nMan: I would. And go to the first lecture anyway — sometimes the professor lets extra students in.',
          questions: [
            q('What is the woman\'s problem?', ['The class she wants is full', 'She failed statistics', 'She does not like the professor', 'She missed the first lecture'], 'The class she wants is full'),
            q('What does the man advise the woman to do?', ['Join the waiting list and attend the first lecture', 'Take a different class', 'Email the professor', 'Wait until next year'], 'Join the waiting list and attend the first lecture'),
          ],
        },
        {
          task: 'announcement', title: 'Listen to an Announcement', timeSec: 50,
          script: 'Announcer: Good evening, students. Because of the snowstorm expected tonight, all classes tomorrow before noon are cancelled. Afternoon classes will go ahead as usual unless you receive another message by ten a.m. The dining halls and the library will stay open. Please avoid driving if possible, and check the university website for updates.',
          questions: [
            q('What will happen tomorrow morning?', ['Classes will be cancelled', 'The library will close', 'Students must leave campus', 'Classes will start early'], 'Classes will be cancelled'),
            q('How will students know if afternoon classes are cancelled?', ['They will receive a message by 10 a.m.', 'Their professors will call them', 'The dining halls will post a notice', 'The library will announce it'], 'They will receive a message by 10 a.m.'),
          ],
        },
        {
          task: 'academic-talk', title: 'Listen to an Academic Talk', timeSec: 90,
          script: 'Professor: Let\'s talk about why some foods turn brown when you cut them — apples, bananas, avocados. This is called enzymatic browning. When you cut the fruit, you break its cells, and an enzyme inside them comes into contact with oxygen from the air. The enzyme then helps convert natural compounds in the fruit into brown pigments.\nNow, browning isn\'t harmful, but it looks unappetizing, so people try to slow it down. Lemon juice works because its acid makes the enzyme less active. Cold also helps, which is why cut fruit browns more slowly in the refrigerator. Interestingly, scientists have developed apple varieties that produce much less of this enzyme, so they stay white for hours after being sliced.',
          questions: [
            q('What is the talk mainly about?', ['Why cut fruit turns brown and how to slow it', 'How apples are grown', 'Why lemon juice is healthy', 'How refrigerators work'], 'Why cut fruit turns brown and how to slow it'),
            q('What starts the browning process?', ['An enzyme meeting oxygen after cells are broken', 'Bacteria growing on the fruit', 'Heat from the kitchen', 'Water leaving the fruit'], 'An enzyme meeting oxygen after cells are broken'),
            q('Why does lemon juice slow browning?', ['Its acid makes the enzyme less active', 'It adds oxygen to the fruit', 'It covers the brown color', 'It kills bacteria'], 'Its acid makes the enzyme less active'),
            q('What does the professor say about some new apple varieties?', ['They produce less of the browning enzyme', 'They are always brown inside', 'They must be kept cold', 'They taste like lemons'], 'They produce less of the browning enzyme'),
          ],
        },
      ],
      upper: [
        {
          task: 'choose-response', title: 'Choose a Response', timeSec: 120,
          items: [
            cr('I was under the impression the deadline had been extended.', ['Only for the graduate students, unfortunately.', 'I was impressed too.', 'The deadline is a line.', 'It extended to the wall.'], 'Only for the graduate students, unfortunately.'),
            cr('You might want to double-check those figures before you submit.', ['Good point — I\'ll go over them again.', 'I have two figures.', 'I submitted my check.', 'The figures are nice.'], 'Good point — I\'ll go over them again.'),
            cr('Hasn\'t anyone told the professor the projector isn\'t working?', ['I just sent her an email about it.', 'The projector is old.', 'Nobody works there.', 'She told me.'], 'I just sent her an email about it.'),
            cr('I\'m torn between the internship and the summer course.', ['Which one fits your long-term plans better?', 'My shirt is torn.', 'Summer is hot.', 'I took the course.'], 'Which one fits your long-term plans better?'),
          ],
        },
        {
          task: 'conversation', title: 'Listen to a Conversation', timeSec: 50,
          genders: { Student: 'male', Librarian: 'female' },
          script: 'Student: Hi, I need an article from a journal the library doesn\'t subscribe to.\nLibrarian: We can request it through interlibrary loan. It usually takes three to five days.\nStudent: Hmm, my paper is due on Friday.\nLibrarian: Then it might be tight. But first, check whether the author posted a free version on their university page — many researchers do. If not, I can mark the request as urgent.\nStudent: I didn\'t know authors did that. I\'ll check right now.',
          questions: [
            q('Why is the student worried?', ['The article might arrive too late for his paper', 'The library has lost his request', 'He cannot afford the article', 'His paper topic has changed'], 'The article might arrive too late for his paper'),
            q('What does the librarian suggest trying first?', ['Looking for a free copy posted by the author', 'Buying the journal online', 'Changing the topic of the paper', 'Asking another student'], 'Looking for a free copy posted by the author'),
          ],
        },
        {
          task: 'academic-talk', title: 'Listen to an Academic Talk', timeSec: 90,
          genders: { Professor: 'female' },
          script: 'Professor: Today we turn to the economics of "network effects." A product has a network effect when it becomes more valuable as more people use it. The telephone is the classic example: one telephone is useless, two can only call each other, but millions create enormous value.\nNetwork effects explain why some markets end up dominated by a single company. Once a messaging app or social platform has most of your friends, switching to a competitor — even a better one — is costly, because your friends aren\'t there. Economists call this a lock-in.\nThat\'s why new platforms often spend huge sums at the start, giving services away for free or even paying users to join. They\'re betting that once they reach a critical mass, the network effect will take over. Of course, many fail before they get there.',
          questions: [
            q('What is the talk mainly about?', ['How products gain value as more people use them', 'The history of the telephone', 'Why messaging apps are free', 'How companies set prices'], 'How products gain value as more people use them'),
            q('Why does the professor mention the telephone?', ['To give a clear example of a network effect', 'To explain how phones work', 'To compare old and new technology', 'To show that phones are expensive'], 'To give a clear example of a network effect'),
            q('According to the professor, what makes switching to a better competitor difficult?', ['Users\' friends are not on the new service', 'The new service is more expensive', 'The law prevents it', 'Users do not know about it'], 'Users\' friends are not on the new service'),
            q('Why do new platforms often give services away at first?', ['To reach enough users for the network effect to work', 'Because their services are of low quality', 'To avoid paying taxes', 'Because governments require it'], 'To reach enough users for the network effect to work'),
          ],
        },
      ],
      lower: [
        {
          task: 'choose-response', title: 'Choose a Response', timeSec: 120,
          items: [
            cr('Is this your pen?', ['Yes, thank you!', 'It writes well.', 'I have a pencil.', 'Pens are cheap.'], 'Yes, thank you!'),
            cr('How do you get to school?', ['I usually walk.', 'At eight o\'clock.', 'School is fun.', 'I got it.'], 'I usually walk.'),
            cr('Let\'s watch a movie tonight.', ['Sure, which one?', 'I watched TV.', 'Tonight is dark.', 'The movie was long.'], 'Sure, which one?'),
            cr('Sorry I\'m late.', ['That\'s okay, we just started.', 'It\'s late at night.', 'I\'m sorry too.', 'You were early.'], 'That\'s okay, we just started.'),
          ],
        },
        {
          task: 'conversation', title: 'Listen to a Conversation', timeSec: 50,
          script: 'Woman: Excuse me, where can I find the science books?\nMan: They\'re on the second floor, on the left side.\nWoman: Is there an elevator?\nMan: Yes, it\'s just behind the front desk.',
          questions: [
            q('What is the woman looking for?', ['Science books', 'The front desk', 'A computer', 'The exit'], 'Science books'),
            q('Where is the elevator?', ['Behind the front desk', 'On the second floor', 'Next to the exit', 'On the left side'], 'Behind the front desk'),
          ],
        },
        {
          task: 'academic-talk', title: 'Listen to an Academic Talk', timeSec: 90,
          script: 'Professor: Today we\'re going to talk about rainbows. You can see a rainbow when the sun is behind you and there is rain in front of you.\nSunlight looks white, but it is really made of many colors. When sunlight goes into a raindrop, the light bends and separates into different colors — red, orange, yellow, green, blue, and violet.\nEach raindrop sends one color to your eyes, and millions of raindrops together make the whole rainbow. That\'s why two people standing in different places actually see slightly different rainbows.',
          questions: [
            q('What is the talk mainly about?', ['How rainbows form', 'Why it rains', 'How the sun moves', 'Why the sky is blue'], 'How rainbows form'),
            q('Where must the sun be for you to see a rainbow?', ['Behind you', 'In front of you', 'Directly above you', 'Below the horizon'], 'Behind you'),
            q('What happens when sunlight enters a raindrop?', ['It bends and separates into colors', 'It becomes white', 'It disappears', 'It turns into rain'], 'It bends and separates into colors'),
            q('Why do two people see slightly different rainbows?', ['Different raindrops send colors to each person', 'They have different eyes', 'The rainbow moves quickly', 'One person is closer to the sun'], 'Different raindrops send colors to each person'),
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
            bs('When is your next exam?', 'It is on Thursday morning at nine.', { chunks: ['is', 'on', 'Thursday morning', 'at nine'], prefix: 'It' }),
            bs('What did the receptionist want to know?', 'She wanted to know whether I had an appointment.', { chunks: ['wanted to know', 'whether', 'I had', 'an appointment'], prefix: 'She', distractor: 'did I' }),
            bs('Why is everyone so quiet today?', 'The final results are going to be announced soon.', { chunks: ['final results', 'are going', 'to be', 'announced', 'soon'], prefix: 'The' }),
            bs('Do you like your new apartment?', 'It is small, but it is close to campus.', { chunks: ['is small,', 'but', 'it is', 'close to', 'campus'], prefix: 'It' }),
            bs('What are you doing this weekend?', 'I am visiting my cousins who live by the sea.', { chunks: ['am visiting', 'my cousins', 'who', 'live', 'by the sea'], prefix: 'I' }),
            bs('Have you been to the new museum?', 'Not yet, but I have heard great things about it.', { chunks: ['but', 'I have', 'heard', 'great things', 'about it'], prefix: 'Not yet,' }),
          ],
        },
        {
          task: 'email', title: 'Write an Email', timeSec: 420,
          scenario: 'Your neighbor in the apartment building, Mrs. Davis, often plays loud music late at night. You have exams next week and have trouble sleeping. You have never talked to her about it before.',
          toName: 'your neighbor, Mrs. Davis',
          points: ['Introduce yourself and explain the problem politely', 'Explain why it is especially important for you now', 'Suggest a solution that could work for both of you'],
          to: 'davis.home@mail.com', subject: 'A small request from your neighbor in 4B',
        },
        {
          task: 'discussion', title: 'Academic Discussion', timeSec: 600,
          professor: { name: 'Dr. Rossi', text: 'In our education policy class, we are discussing grading. Some educators believe that schools should stop giving traditional letter grades and instead provide only written feedback. They argue that grades make students focus on scores rather than learning. Others think grades are necessary to motivate students and to compare their performance. What is your view?' },
          students: [
            { name: 'Emma', text: 'I support replacing grades with feedback. When I get a grade, I look at the number and ignore the comments. Feedback alone would make me read what I need to improve.' },
            { name: 'Kenji', text: 'Grades are necessary. Universities and employers need a simple way to compare students, and without grades many students wouldn\'t study as hard.' },
          ],
        },
      ],
    },
    speaking: {
      intro: '<b>Speaking.</b> Allow the microphone. Listen and Repeat (7 sentences), then a short interview (4 questions, 45 seconds each). Recording starts automatically.',
      tasks: [
        {
          task: 'listen-repeat', title: 'Listen and Repeat', gender: 'male',
          scenario: 'You are learning to work at the campus swimming pool. Listen to the head lifeguard and repeat what he says.',
          sentences: [
            'Please walk, do not run.',
            'Swimming caps are required here.',
            'The deep end is on the right side.',
            'Lanes are marked for slow and fast swimmers.',
            'Children must stay in the shallow area unless they can swim well.',
            'The pool closes for cleaning every day from one to two.',
            'If you see someone in trouble, call a lifeguard immediately.',
          ],
        },
        {
          task: 'interview', title: 'Take an Interview', responseSec: 45,
          scenario: 'You are taking part in a study about sports and exercise. A researcher will ask you some questions.',
          questions: [
            'What kind of physical activity do you enjoy most?',
            'Do you prefer exercising alone or in a group? Why?',
            'Some people think professional athletes are paid too much. What is your opinion?',
            'Should physical education be required for all university students? Explain your view.',
          ],
        },
      ],
    },
  },
}
