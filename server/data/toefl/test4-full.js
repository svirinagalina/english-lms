import { q, cw, bs, FULL } from './helpers.js'

const cr = (prompt, options, answer = options[0], explain = '') => ({ prompt, ...q('', options, answer, explain) })

// Simulation Test 4, the tasks that bring it to full exam length
// (merged into test4.js by extendTest).
export const EXTRA_4 = {
  minutes: FULL.minutes,
  writingIntro: FULL.writingIntro,
  reading: {
    intro: FULL.reading.intro,
    routing: [
      cw('Complete the Words', 'Deserts are not always hot. A desert is defined by how little rain it receives, not {{by}} its temperature. Antarctica, for example, {{is}} the largest desert on Earth, even {{though}} it is covered in ice. It {{receives}} very little snow each year, {{and}} the air is extremely dry. {{Because}} of this, scientists group it {{with}} places like the Sahara, where {{rain}} is also rare. In both {{places}}, plants and animals must adapt {{to}} survive.'),
      {
        task: 'daily-life', title: 'Read in Daily Life', timeSec: 150, passageTitle: 'Group chat',
        passage: '<b>Priya:</b> Reminder — our presentation is on Wednesday at 10!\n<b>Tom:</b> I finished the slides on the survey results. Can someone check the charts? The colors look strange on my screen.\n<b>Priya:</b> I\'ll look tonight. Ahmed, are you still doing the introduction?\n<b>Ahmed:</b> Yes, but I\'m sick today. I\'ll send it tomorrow morning. If I can\'t come on Wednesday, can one of you read my part?\n<b>Tom:</b> No problem. Get well soon!',
        questions: [
          q('What does Tom ask the group to do?', ['Check the charts in his slides', 'Finish the survey', 'Choose new colors for the slides', 'Write the introduction'], 'Check the charts in his slides'),
          q('Why might Ahmed miss the presentation?', ['He is ill', 'He has another class', 'He forgot the date', 'He is traveling'], 'He is ill'),
          q('What does Tom agree to do?', ['Present Ahmed\'s part if necessary', 'Write the introduction tonight', 'Change the presentation date', 'Take Ahmed to the doctor'], 'Present Ahmed\'s part if necessary'),
        ],
      },
    ],
    upper: [
      {
        task: 'daily-life', title: 'Read in Daily Life', timeSec: 120, passageTitle: 'Policy update',
        passage: '<b>UPDATE TO THE LAPTOP LOAN POLICY</b>\n\nEffective immediately, laptops borrowed from the IT Help Desk may be kept for up to seven days, rather than the previous three. However, renewals will no longer be permitted, and late returns will result in a two-week suspension of borrowing privileges instead of a fine. The change reflects feedback that short loan periods were impractical for project work, while fines did little to encourage timely returns.',
        questions: [
          q('Why was the policy changed?', ['Students needed laptops for longer, and fines were ineffective', 'Too many laptops were damaged', 'The Help Desk bought more laptops', 'Students asked for lower fines'], 'Students needed laptops for longer, and fines were ineffective'),
          q('What happens now if a student returns a laptop late?', ['The student cannot borrow for two weeks', 'The student pays a fine', 'The loan is renewed automatically', 'The student loses the laptop deposit'], 'The student cannot borrow for two weeks'),
        ],
      },
    ],
    lower: [
      {
        task: 'daily-life', title: 'Read in Daily Life', timeSec: 150, passageTitle: 'Text message',
        passage: '<b>Mom (11:05 a.m.):</b> Hi! Your package arrived today. It\'s a big box from the bookstore. Do you want me to send it to you or keep it until you come home on Friday? Sending it costs $12. Call me after your class!',
        questions: [
          q('What arrived today?', ['A box from the bookstore', 'A letter from school', 'A new phone', 'A train ticket'], 'A box from the bookstore'),
          q('When is the student coming home?', ['On Friday', 'Today', 'Tomorrow morning', 'Next month'], 'On Friday'),
          q('What does Mom want the student to do?', ['Call her after class', 'Pay $12 now', 'Go to the bookstore', 'Send her a package'], 'Call her after class'),
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
          cr('Who\'s giving the lecture on Thursday?', ['A visiting professor from Toronto.', 'It\'s about economics.', 'In the main hall.', 'At four o\'clock.']),
          cr('I can\'t find my lab partner anywhere.', ['I saw her in the cafeteria a minute ago.', 'The lab is on the left.', 'I found my keys.', 'She is a good partner.'], 'I saw her in the cafeteria a minute ago.'),
          cr('Do you think we\'ll finish the project on time?', ['If we work this weekend, we should.', 'The project is about water.', 'It\'s ten past three.', 'I finished my lunch.']),
          cr('Is there an extra fee for the art class materials?', ['Yes, it\'s twenty dollars for the semester.', 'The art is beautiful.', 'I feel great.', 'The class is full of students.']),
        ],
      },
      {
        task: 'conversation', title: 'Listen to a Conversation', timeSec: 50,
        script: 'Man: Hi, I\'d like to change my meal plan. I have the full plan, but I\'m eating at the cafeteria only twice a day.\nWoman: You can switch to the ten-meals-a-week plan. It\'s about two hundred dollars cheaper per semester.\nMan: Great. Will I get the difference back?\nWoman: Not as cash. The difference goes onto your student card, and you can spend it at any campus café.\nMan: That works for me.',
        questions: [
          q('Why does the man want to change his meal plan?', ['He does not use all his meals', 'The food is not good', 'He is moving off campus', 'He wants more meals'], 'He does not use all his meals'),
          q('What will happen to the money he saves?', ['It will be added to his student card', 'It will be paid back in cash', 'It will go to next semester\'s rent', 'It will be lost'], 'It will be added to his student card'),
        ],
      },
      {
        task: 'announcement', title: 'Listen to an Announcement', timeSec: 50,
        script: 'Announcer: Hello, everyone. The university is looking for student volunteers for Open Day on April 12. Volunteers will give campus tours and answer questions from future students and their parents. Training is on April 10 at four p.m. All volunteers will receive a free T-shirt and lunch on the day. To sign up, email the admissions office by April 5.',
        questions: [
          q('What will volunteers do on Open Day?', ['Show visitors around the campus', 'Teach classes', 'Sell T-shirts', 'Cook lunch'], 'Show visitors around the campus'),
          q('What must students do by April 5?', ['Email the admissions office', 'Attend the training', 'Pay for lunch', 'Invite their parents'], 'Email the admissions office'),
        ],
      },
      {
        task: 'academic-talk', title: 'Listen to an Academic Talk', timeSec: 90,
        genders: { Professor: 'male' },
        script: 'Professor: Today we\'re looking at why some cities grow up around rivers. If you look at a map of the world\'s oldest cities, most of them are next to a river. There are good reasons for this. First, rivers provided fresh water for drinking and for farming. The land along rivers is often very fertile, because floods leave behind rich soil.\nSecond, rivers were roads. Before trains and trucks, moving heavy goods by boat was much easier than moving them over land. A city on a river could trade with other cities upstream and downstream.\nToday, of course, cities can bring water from far away and move goods by road or air. But most large cities are still in the places where they started — next to their rivers.',
        questions: [
          q('What is the talk mainly about?', ['Why early cities were built near rivers', 'How floods destroy cities', 'How boats are built', 'Why modern cities are growing'], 'Why early cities were built near rivers'),
          q('Why is land near rivers good for farming?', ['Floods leave rich soil behind', 'It is always flat', 'It gets more sunlight', 'It has fewer insects'], 'Floods leave rich soil behind'),
          q('Why does the professor say that rivers were roads?', ['Goods were easier to move by boat', 'People built roads next to rivers', 'Rivers were used for racing', 'Rivers marked the borders of cities'], 'Goods were easier to move by boat'),
          q('What point does the professor make at the end?', ['Large cities still remain beside their rivers', 'Rivers are no longer useful', 'Most cities have moved away from rivers', 'Trains replaced all river transport'], 'Large cities still remain beside their rivers'),
        ],
      },
    ],
    upper: [
      {
        task: 'choose-response', title: 'Choose a Response',
        items: [
          cr('You\'re not seriously considering taking six courses next term, are you?', ['I am, but only because two of them are half-credit.', 'Six is an even number.', 'I took the course seriously.', 'Next term is in the fall.']),
          cr('Funny — I could have sworn the seminar was in this building.', ['It was, until they moved it to the Annex last week.', 'The building is funny.', 'I never swear.', 'The seminar was interesting.']),
          cr('Do you happen to know whether the grant covers travel costs?', ['As far as I know, only conference fees.', 'I travel by train.', 'The grant was happy.', 'I don\'t know him.']),
          cr('I\'m having second thoughts about presenting first.', ['Want me to swap places with you?', 'Two thoughts are better.', 'I presented a gift.', 'The first one is free.']),
        ],
      },
      {
        task: 'conversation', title: 'Listen to a Conversation', timeSec: 50,
        genders: { Student: 'female', Professor: 'male' },
        script: 'Student: Professor Lin, I\'m struggling to narrow down my research question. I want to study social media and political opinions, but every article I read seems to cover something slightly different.\nProfessor: That\'s normal at this stage. The topic is huge. Try picking one platform, one group of users, and one kind of opinion. For example, how short videos affect first-time voters\' views on climate policy.\nStudent: That feels very narrow.\nProfessor: It is — and that\'s what makes it researchable. You can always mention the bigger picture in your introduction.\nStudent: Okay. I\'ll draft two or three narrower questions and bring them on Monday.',
        questions: [
          q('What is the student\'s problem?', ['Her research topic is too broad', 'She cannot find any articles', 'She does not use social media', 'She missed the deadline'], 'Her research topic is too broad'),
          q('Why does the professor give an example about short videos?', ['To show what a focused question looks like', 'To suggest a topic for his own research', 'To criticize social media', 'To explain how voters choose a candidate'], 'To show what a focused question looks like'),
        ],
      },
      {
        task: 'announcement', title: 'Listen to an Announcement', timeSec: 50,
        script: 'Announcer: This is a message for all residents of West Campus apartments. Due to a water main repair, hot water will be unavailable on Wednesday from eight a.m. until approximately four p.m. Showers in the Recreation Center will remain open throughout the day for residents with a valid ID. If the repair takes longer than expected, we will send an update by text message, so please make sure your phone number in the housing portal is current.',
        questions: [
          q('What is the announcement mainly about?', ['A temporary loss of hot water', 'A new recreation center', 'A change to rent payments', 'Construction of new apartments'], 'A temporary loss of hot water'),
          q('Why should residents check their phone numbers?', ['So they can receive updates about the repair', 'So they can enter the Recreation Center', 'So they can book a shower time', 'So they can report water leaks'], 'So they can receive updates about the repair'),
        ],
      },
      {
        task: 'academic-talk', title: 'Listen to an Academic Talk', timeSec: 90,
        genders: { Professor: 'female' },
        script: 'Professor: Today I want to discuss a phenomenon in psychology called the "bystander effect." In the 1960s, researchers found that people are less likely to help someone in an emergency when other people are present. In one experiment, participants heard someone apparently having a seizure over an intercom. When participants believed they were the only listener, most went for help quickly. When they believed four others could also hear, far fewer did.\nThe usual explanation is diffusion of responsibility: each person assumes someone else will act. There\'s also uncertainty — if nobody else reacts, we may decide the situation isn\'t really an emergency.\nInterestingly, a large study in 2019 analyzed real video recordings of public conflicts in three countries and found that in about nine out of ten cases, at least one bystander did intervene. So the effect may be weaker in real life than the early experiments suggested — partly because the more people there are, the more likely it is that at least one of them will help.',
        questions: [
          q('What is the talk mainly about?', ['Why people sometimes fail to help in emergencies', 'How to respond to a medical emergency', 'Why people argue in public', 'How intercoms were used in experiments'], 'Why people sometimes fail to help in emergencies'),
          q('What did the intercom experiment show?', ['People helped less when they thought others were listening', 'People helped more in groups', 'People did not believe the emergency was real', 'People preferred to call the police'], 'People helped less when they thought others were listening'),
          q('According to the professor, what is "diffusion of responsibility"?', ['Each person expects someone else to act', 'People cannot tell what an emergency is', 'People are afraid of being hurt', 'Groups make decisions slowly'], 'Each person expects someone else to act'),
          q('What does the 2019 study suggest?', ['The effect may be smaller in real situations', 'The early experiments were completely correct', 'People never help strangers', 'Bystanders help only in some countries'], 'The effect may be smaller in real situations'),
        ],
      },
    ],
    lower: [
      {
        task: 'choose-response', title: 'Choose a Response',
        items: [
          cr('Where is the bathroom?', ['At the end of the hall.', 'It\'s very clean.', 'I took a bath.', 'In five minutes.']),
          cr('Would you like tea or coffee?', ['Tea, please.', 'Yes, I would.', 'It\'s hot.', 'In the kitchen.']),
          cr('How much is this notebook?', ['Three dollars.', 'Two notebooks.', 'It has many pages.', 'Yes, very much.']),
          cr('Are you ready to go?', ['Almost — give me two minutes.', 'I read a book.', 'It\'s ready.', 'Go to the left.']),
        ],
      },
      {
        task: 'conversation', title: 'Listen to a Conversation', timeSec: 50,
        script: 'Woman: Hi, my bike has a flat tire. Can you fix it today?\nMan: Sure. It takes about thirty minutes, and it costs eight dollars.\nWoman: Great. Can I leave it here and come back later?\nMan: Of course. We close at six.\nWoman: Thanks. I\'ll be back at five.',
        questions: [
          q('What is wrong with the woman\'s bike?', ['It has a flat tire', 'The brakes are broken', 'It is too small', 'The chain is missing'], 'It has a flat tire'),
          q('When will the woman come back?', ['At five o\'clock', 'At six o\'clock', 'In thirty minutes', 'Tomorrow'], 'At five o\'clock'),
        ],
      },
      {
        task: 'announcement', title: 'Listen to an Announcement', timeSec: 50,
        script: 'Announcer: Hello, passengers. The train to Riverside is ten minutes late today. It will leave from platform three, not platform one. We are sorry for the delay.',
        questions: [
          q('What is the problem with the train?', ['It is late', 'It is full', 'It is cancelled', 'It is too slow'], 'It is late'),
          q('Where will the train leave from?', ['Platform three', 'Platform one', 'Platform ten', 'The bus station'], 'Platform three'),
        ],
      },
      {
        task: 'academic-talk', title: 'Listen to an Academic Talk', timeSec: 90,
        script: 'Professor: Today let\'s talk about elephants. Elephants are the largest animals that live on land. They eat plants — grass, leaves, and fruit — and they eat for up to sixteen hours a day!\nElephants live in family groups. The leader of the group is usually the oldest female. She remembers where to find food and water, even after many years. Elephants also use their long trunks for many things: to drink, to pick up food, and to say hello to each other.',
        questions: [
          q('What is the talk mainly about?', ['How elephants live', 'Why elephants are in danger', 'How to feed animals in a zoo', 'Where elephants sleep'], 'How elephants live'),
          q('What do elephants eat?', ['Plants', 'Small animals', 'Fish', 'Insects'], 'Plants'),
          q('Who usually leads an elephant family?', ['The oldest female', 'The biggest male', 'The youngest elephant', 'Two brothers'], 'The oldest female'),
          q('Which use of the trunk does the professor NOT mention?', ['Building homes', 'Drinking', 'Picking up food', 'Greeting each other'], 'Building homes'),
        ],
      },
    ],
  },
  buildSentence: [
    bs('Where did you study before you came here?', 'I studied at a small college in Texas.', { chunks: ['studied', 'at', 'a small college', 'in Texas'], prefix: 'I' }),
    bs('What did the teaching assistant explain?', 'He explained how we should format the references.', { chunks: ['explained', 'how', 'we should', 'format', 'the references'], prefix: 'He', distractor: 'do' }),
    bs('Why didn\'t you come to the party?', 'I was too tired after the long trip.', { chunks: ['was', 'too tired', 'after', 'the long trip'], prefix: 'I' }),
    bs('Should I take the bus or walk?', 'The bus is faster, but walking is cheaper.', { chunks: ['bus', 'is faster,', 'but', 'walking', 'is cheaper'], prefix: 'The' }),
  ],
}
