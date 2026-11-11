import { q, cw, bs, FULL } from './helpers.js'

const cr = (prompt, options, answer = options[0], explain = '') => ({ prompt, ...q('', options, answer, explain) })

// Simulation Test 3, the tasks that bring it to full exam length
// (merged into test3.js by extendTest).
export const EXTRA_3 = {
  minutes: FULL.minutes,
  writingIntro: FULL.writingIntro,
  reading: {
    intro: FULL.reading.intro,
    routing: [
      cw('Complete the Words', 'The printing press, developed in Europe in the fifteenth century, changed the way information spread. Before {{its}} invention, books were copied {{by}} hand, which made them {{rare}} and expensive. With the {{new}} machines, printers could produce {{hundreds}} of copies in the {{time}} it once took to {{make}} one. As books became {{cheaper}}, more people learned to {{read}}, and new ideas travelled {{faster}} than ever before.'),
      {
        task: 'daily-life', title: 'Read in Daily Life', timeSec: 150, passageTitle: 'Website notice',
        passage: '<b>CAREER FAIR — WHAT TO EXPECT</b>\n\nThe Fall Career Fair takes place on October 9 from 10 a.m. to 3 p.m. in the Sports Arena. More than 80 employers will attend, including companies in engineering, finance, and healthcare.\n\nRegister in advance through the Career Portal to receive a map and a list of employers. Students who register before October 1 can also book a free 15-minute résumé review with a career advisor. Business attire is recommended.',
        questions: [
          q('What is the notice mainly about?', ['An event where students can meet employers', 'A new course on writing résumés', 'Changes to the Sports Arena schedule', 'Jobs at the Career Center'], 'An event where students can meet employers'),
          q('What do students get by registering before October 1?', ['A chance to have their résumé checked', 'A guaranteed job interview', 'Free business clothes', 'Early entry to the fair'], 'A chance to have their résumé checked'),
          q('What does the notice suggest students wear?', ['Formal clothes', 'Sports clothes', 'A university T-shirt', 'Anything they like'], 'Formal clothes'),
        ],
      },
    ],
    upper: [
      {
        task: 'daily-life', title: 'Read in Daily Life', timeSec: 120, passageTitle: 'Email',
        passage: '<b>From:</b> Dr. Elena Ruiz\n<b>Subject:</b> Co-authorship of the survey paper\n\nHi Sam,\n\nThe journal has asked for a substantial revision of our survey paper — mainly a new section on studies published since 2023. Given how much of the original analysis you did, I\'d like to offer you second authorship, provided you can take the lead on that section. The resubmission is due in six weeks, which I realize overlaps with your qualifying exams, so please be honest if the timing doesn\'t work.\n\nElena',
        questions: [
          q('Why is Dr. Ruiz writing to Sam?', ['To offer him a larger role in a paper', 'To tell him a paper was rejected', 'To ask him to review a journal article', 'To reschedule his qualifying exams'], 'To offer him a larger role in a paper'),
          q('What does Dr. Ruiz imply about the timing?', ['Sam may be too busy to accept', 'The deadline can easily be extended', 'The exams have been postponed', 'The section is nearly finished'], 'Sam may be too busy to accept'),
        ],
      },
    ],
    lower: [
      {
        task: 'daily-life', title: 'Read in Daily Life', timeSec: 150, passageTitle: 'Receipt',
        passage: '<b>CAMPUS BOOKSTORE</b>\n\nNotebook (x3) — $6.00\nBlue pens (pack of 10) — $4.50\nCalculator — $18.00\n\n<b>Total: $28.50</b>\nPaid by card\n\nReturns accepted within 14 days with this receipt.',
        questions: [
          q('What did the customer buy the most of?', ['Pens', 'Notebooks', 'Calculators', 'Books'], 'Pens'),
          q('How did the customer pay?', ['By card', 'In cash', 'With a gift card', 'By phone'], 'By card'),
          q('What is needed to return an item?', ['The receipt', 'A student ID', 'The original bag', 'A phone number'], 'The receipt'),
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
          cr('Is the campus pool open to visitors?', ['Only if they come with a student.', 'The pool is very deep.', 'I visited it yesterday.', 'It opens the door.']),
          cr('I\'m thinking of dropping my chemistry class.', ['Really? Have you talked to your advisor?', 'Chemistry is a science.', 'I dropped my phone.', 'The class is at nine.']),
          cr('How long does it take to walk to the station?', ['About fifteen minutes.', 'It\'s a long train.', 'I walk every day.', 'At the station.']),
          cr('Could you save me a seat at the meeting?', ['Of course — I\'ll be near the front.', 'The meeting was saved.', 'I see the seat.', 'It\'s a long meeting.']),
        ],
      },
      {
        task: 'conversation', title: 'Listen to a Conversation', timeSec: 50,
        script: 'Woman: Hi, I\'m having trouble connecting to the campus Wi-Fi in my dorm room.\nMan: Okay. Have you registered your laptop on the network page?\nWoman: I didn\'t know I had to.\nMan: Yes, every new device needs to be registered once. It only takes a minute — you enter your student number and the device name.\nWoman: Can I do it from my phone?\nMan: You can. Use the guest network to open the page, and then your laptop will connect automatically.',
        questions: [
          q('What is the woman\'s problem?', ['Her laptop will not connect to the Internet', 'She forgot her student number', 'Her phone is broken', 'She cannot find her dorm room'], 'Her laptop will not connect to the Internet'),
          q('What does the man tell the woman to do?', ['Register her device online', 'Buy a new laptop', 'Move to another room', 'Call the phone company'], 'Register her device online'),
        ],
      },
      {
        task: 'announcement', title: 'Listen to an Announcement', timeSec: 50,
        script: 'Announcer: Attention, library users. This weekend the library will stay open twenty-four hours a day to help students prepare for exams. The quiet study area on the third floor will be reserved for silent work only — no phone calls and no group discussions. Group study rooms on the second floor can be booked for up to three hours at a time.',
        questions: [
          q('Why will the library stay open all night?', ['To help students study for exams', 'Because of a special event', 'To repair the third floor', 'Because the library is moving'], 'To help students study for exams'),
          q('What is NOT allowed on the third floor?', ['Talking on the phone', 'Reading books', 'Using laptops', 'Working alone'], 'Talking on the phone'),
        ],
      },
      {
        task: 'academic-talk', title: 'Listen to an Academic Talk', timeSec: 90,
        genders: { Professor: 'female' },
        script: 'Professor: Let\'s talk about a business idea that sounds strange at first: giving things away for free. Many apps and online services are free to use. How do the companies make money? One common model is called "freemium." The basic version is free, and a small percentage of users pay for extra features — more storage, no ads, special tools.\nWhy does this work? Because the cost of serving one more user online is very low. If a million people use the free version and only three percent upgrade, that can still be thirty thousand paying customers. The free users also help: they recommend the product to friends and make it more visible.\nThe risk is that if the free version is too good, nobody upgrades. Companies have to find the right balance.',
        questions: [
          q('What is the talk mainly about?', ['How companies earn money from free products', 'Why apps are becoming more expensive', 'How to design a mobile app', 'Why people dislike online ads'], 'How companies earn money from free products'),
          q('Why can companies afford to have many free users?', ['Serving each additional user costs very little', 'Free users watch many ads', 'The government pays for them', 'Free users pay later'], 'Serving each additional user costs very little'),
          q('How do free users help the company, according to the professor?', ['They recommend the product to others', 'They test new features for money', 'They pay for extra storage', 'They write the advertisements'], 'They recommend the product to others'),
          q('What risk does the professor mention?', ['Users may not upgrade if the free version is too good', 'Free users may stop using the app', 'Paying users may ask for refunds', 'The company may run out of storage'], 'Users may not upgrade if the free version is too good'),
        ],
      },
    ],
    upper: [
      {
        task: 'choose-response', title: 'Choose a Response',
        items: [
          cr('I take it you weren\'t thrilled with the new grading policy.', ['Not really — it penalizes late work far too heavily.', 'I took it to the office.', 'The policy is printed.', 'I was thrilled to see you.']),
          cr('Shouldn\'t someone have told the visiting speaker about the room change?', ['I assumed the department had emailed her.', 'The speaker is very loud.', 'Someone changed rooms.', 'She told me a story.']),
          cr('I\'m inclined to turn down the scholarship in Edinburgh.', ['Why? I thought that was your first choice.', 'Turn left at the corner.', 'Edinburgh is in Scotland.', 'I\'m not inclined to eat.']),
          cr('It\'s a shame the field trip got called off.', ['Maybe they\'ll reschedule it for the spring.', 'The field is very green.', 'I called him yesterday.', 'The trip was short.']),
        ],
      },
      {
        task: 'conversation', title: 'Listen to a Conversation', timeSec: 50,
        genders: { Student: 'male', Librarian: 'female' },
        script: 'Student: Hi, I\'m writing a history paper and I need newspapers from the 1920s. The online archive only goes back to 1950.\nLibrarian: For earlier issues we have microfilm in the basement. The reader machines are a bit old, but they work.\nStudent: Can I make copies?\nLibrarian: You can save scans to a USB drive. Just keep in mind that the machines are popular around this time of the semester, so it\'s worth reserving one.\nStudent: Is that done online?\nLibrarian: No, you sign up on a sheet at the basement desk.',
        questions: [
          q('Why does the student need help?', ['The sources he wants are not available online', 'His USB drive is not working', 'He lost a library book', 'The basement is closed'], 'The sources he wants are not available online'),
          q('What does the librarian imply about the machines?', ['They may be hard to get without a reservation', 'They are too old to use', 'They can be borrowed overnight', 'They will be replaced soon'], 'They may be hard to get without a reservation'),
        ],
      },
      {
        task: 'announcement', title: 'Listen to an Announcement', timeSec: 50,
        script: 'Professor: Before you leave — a clarification about the peer review assignment. Several of you treated it as an exercise in finding errors. That\'s only part of it. A useful review also identifies what works in a draft and explains why, so the writer knows what to keep. For the next round, I\'d like every review to begin with at least two specific strengths before moving on to suggestions. Reviews that list only problems will lose points.',
        questions: [
          q('What problem does the professor point out?', ['Students focused only on weaknesses', 'Students submitted reviews late', 'The reviews were too short', 'Students reviewed their own drafts'], 'Students focused only on weaknesses'),
          q('What must the next reviews include?', ['Specific strengths of the draft', 'A grade for the writer', 'A list of grammar errors', 'A summary of the professor\'s comments'], 'Specific strengths of the draft'),
        ],
      },
      {
        task: 'academic-talk', title: 'Listen to an Academic Talk', timeSec: 90,
        genders: { Professor: 'male' },
        script: 'Professor: Today we\'re discussing a question in ecology: what happens when a top predator is removed from an ecosystem? The best-known example is Yellowstone National Park. Wolves were eliminated there by the 1920s. Without them, elk populations grew, and the elk grazed heavily on young willow and aspen trees along rivers.\nWhen wolves were reintroduced in 1995, researchers reported that those trees began to recover, and with them came beavers, songbirds, and more stable riverbanks. This chain of effects is called a trophic cascade, and Yellowstone became the textbook case.\nMore recent studies, however, suggest the story is less tidy. Elk numbers were also affected by hunting, droughts, and growing bear populations, and in many areas the trees have recovered only partly. So wolves clearly mattered — but probably as one factor among several, not as a single switch that restored the whole system.',
        questions: [
          q('What is the talk mainly about?', ['The effects of returning wolves to Yellowstone', 'Why elk are hunted in national parks', 'How beavers build dams', 'Why trees grow near rivers'], 'The effects of returning wolves to Yellowstone'),
          q('According to the professor, what happened when wolves disappeared?', ['Elk ate many young trees', 'Bear populations declined', 'Rivers dried up completely', 'Beavers became more common'], 'Elk ate many young trees'),
          q('Why does the professor mention hunting, droughts, and bears?', ['To show that other factors also affected elk', 'To explain why wolves were removed', 'To describe threats to beavers', 'To argue that wolves had no effect'], 'To show that other factors also affected elk'),
          q('What is the professor\'s view of the Yellowstone story?', ['It is real but more complicated than often told', 'It is completely false', 'It proves that one species controls an ecosystem', 'It is too recent to evaluate'], 'It is real but more complicated than often told'),
        ],
      },
    ],
    lower: [
      {
        task: 'choose-response', title: 'Choose a Response',
        items: [
          cr('Do you have a pencil I can use?', ['Yes, here you go.', 'I use a computer.', 'It\'s a yellow pencil.', 'No, I can\'t go.']),
          cr('When is your birthday?', ['It\'s in March.', 'I\'m twenty years old.', 'It was a great party.', 'On my birthday.']),
          cr('Is it going to rain today?', ['I think so — take an umbrella.', 'It rained a lot.', 'Today is Tuesday.', 'I like the sun.']),
          cr('Where do you live?', ['In a dorm near the gym.', 'I live well.', 'For two years.', 'It\'s my house.']),
        ],
      },
      {
        task: 'conversation', title: 'Listen to a Conversation', timeSec: 50,
        script: 'Man: Hi, I want to buy a ticket for the basketball game on Saturday.\nWoman: Student tickets are five dollars. Do you have your student card?\nMan: Yes, here it is. Can I buy one for my brother too? He isn\'t a student.\nWoman: Sure, but his ticket is ten dollars.\nMan: That\'s fine. Two tickets, please.',
        questions: [
          q('What does the man want to buy?', ['Tickets for a basketball game', 'A new student card', 'A basketball', 'Train tickets'], 'Tickets for a basketball game'),
          q('Why is the brother\'s ticket more expensive?', ['He is not a student', 'He is older', 'He wants a better seat', 'He bought it late'], 'He is not a student'),
        ],
      },
      {
        task: 'announcement', title: 'Listen to an Announcement', timeSec: 50,
        script: 'Announcer: Good morning, students. The elevator in the Science Building is not working today. Please use the stairs. If you need help getting to the upper floors, call the front desk, and someone will help you. We hope to fix the elevator by tomorrow.',
        questions: [
          q('What is the problem?', ['An elevator is broken', 'The stairs are closed', 'The front desk is closed', 'The Science Building is closed'], 'An elevator is broken'),
          q('What should students do if they need help?', ['Call the front desk', 'Wait until tomorrow', 'Go to another building', 'Email their teacher'], 'Call the front desk'),
        ],
      },
      {
        task: 'academic-talk', title: 'Listen to an Academic Talk', timeSec: 90,
        script: 'Professor: Today let\'s talk about chocolate. Chocolate comes from the seeds of the cacao tree. These trees grow in hot, wet places near the equator, like West Africa and South America.\nThe seeds are inside a big fruit called a pod. Farmers open the pods, take out the seeds, and leave them in the sun for a few days. Then the seeds are dried and sent to factories. In the factory, the seeds are roasted and made into chocolate. Most of the world\'s cacao is grown on small family farms.',
        questions: [
          q('What is the talk mainly about?', ['How chocolate is made', 'Why chocolate is unhealthy', 'How to grow fruit at home', 'Life in South America'], 'How chocolate is made'),
          q('Where do cacao trees grow?', ['In hot, wet places', 'In cold, dry places', 'In the mountains', 'Only in factories'], 'In hot, wet places'),
          q('What do farmers do after they open the pods?', ['Leave the seeds in the sun', 'Sell the pods', 'Plant the seeds', 'Eat the fruit'], 'Leave the seeds in the sun'),
          q('Who grows most of the world\'s cacao?', ['Small family farms', 'Large factories', 'Scientists', 'Chocolate shops'], 'Small family farms'),
        ],
      },
    ],
  },
  buildSentence: [
    bs('Did you get the job at the café?', 'They told me I could start next Monday.', { chunks: ['told me', 'I could', 'start', 'next Monday'], prefix: 'They' }),
    bs('What did your classmate want to know?', 'He wanted to know if I had finished the assignment.', { chunks: ['wanted to know', 'if', 'I had', 'finished', 'the assignment'], prefix: 'He', distractor: 'did' }),
    bs('Why are you leaving so early?', 'I need to catch the last bus home.', { chunks: ['need', 'to catch', 'the last bus', 'home'], prefix: 'I' }),
    bs('Was the concert worth the price?', 'It was expensive, but the music was amazing.', { chunks: ['was expensive,', 'but', 'the music', 'was amazing'], prefix: 'It' }),
  ],
}
