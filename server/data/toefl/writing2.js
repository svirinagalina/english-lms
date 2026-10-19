import { bs } from './helpers.js'

// Writing, practice sets 4–6.

export const BUILD_SENTENCE_2 = [
  {
    task: 'build-sentence', title: 'Build a Sentence · Practice 4', timeSec: 360,
    items: [
      bs('Why didn\'t you come to the party?', 'I had to stay home and finish my project.', { chunks: ['had to', 'stay', 'home', 'and', 'finish', 'my project'], prefix: 'I' }),
      bs('What did the tour guide tell you?', 'She told us when the museum would close.', { chunks: ['told us', 'when', 'the museum', 'would', 'close'], prefix: 'She', distractor: 'did', explain: 'Косвенный вопрос: when the museum would close — без did и с прямым порядком.' }),
      bs('Is the chemistry lab open on weekends?', 'It is open on Saturdays but not on Sundays.', { chunks: ['is open', 'on Saturdays', 'but', 'not', 'on Sundays'], prefix: 'It' }),
      bs('How did you hear about the scholarship?', 'My advisor mentioned it during our last meeting.', { chunks: ['advisor', 'mentioned', 'it', 'during', 'our last meeting'], prefix: 'My' }),
      bs('Do you want to sit by the window?', 'I would rather sit closer to the board.', { chunks: ['would rather', 'sit', 'closer', 'to the board'], prefix: 'I', explain: 'would rather + глагол без to.' }),
      bs('Have you ever been to the botanical garden?', 'I have never been there, but I would like to go.', { chunks: ['have never', 'been there,', 'but', 'I would', 'like to go'], prefix: 'I' }),
      bs('Why are you leaving so early?', 'My train leaves in less than an hour.', { chunks: ['train', 'leaves', 'in', 'less than', 'an hour'], prefix: 'My' }),
      bs('Can you recommend a good book on economics?', 'The one our professor wrote is very clear.', { chunks: ['our professor', 'wrote', 'is', 'very', 'clear'], prefix: 'The one', explain: 'Относительное придаточное без who/that: the one (that) our professor wrote.' }),
      bs('Did the experiment work?', 'Not yet, but we are going to try again tomorrow.', { chunks: ['but', 'we are', 'going to', 'try again', 'tomorrow'], prefix: 'Not yet,' }),
      bs('What do you need for the trip?', 'I need to buy a warm jacket and some boots.', { chunks: ['need', 'to buy', 'a warm jacket', 'and', 'some boots'], prefix: 'I' }),
    ],
  },
  {
    task: 'build-sentence', title: 'Build a Sentence · Practice 5', timeSec: 360,
    items: [
      bs('Where did you find that old map?', 'I found it in a box in my grandfather\'s attic.', { chunks: ['found', 'it', 'in a box', 'in', 'my grandfather\'s attic'], prefix: 'I' }),
      bs('Could you tell me where the registrar\'s office is?', 'It is in the building next to the library.', { chunks: ['is', 'in the building', 'next to', 'the library'], prefix: 'It' }),
      bs('Why was the meeting cancelled?', 'The manager was not feeling well this morning.', { chunks: ['manager', 'was not', 'feeling', 'well', 'this morning'], prefix: 'The' }),
      bs('Do you know whether the café takes cards?', 'I am not sure if they accept credit cards.', { chunks: ['am', 'not sure', 'if', 'they accept', 'credit cards'], prefix: 'I', distractor: 'do they', explain: 'После if в косвенном вопросе — прямой порядок: if they accept, не if do they.' }),
      bs('Who is going to lead the discussion?', 'The student who sits in the front row will.', { chunks: ['student', 'who', 'sits', 'in the front row', 'will'], prefix: 'The' }),
      bs('How long have you been learning Japanese?', 'I have been studying it for almost two years.', { chunks: ['have been', 'studying', 'it', 'for', 'almost two years'], prefix: 'I', explain: 'Present Perfect Continuous + for + период.' }),
      bs('Was the final exam difficult?', 'It was harder than I had expected.', { chunks: ['was', 'harder', 'than', 'I had', 'expected'], prefix: 'It' }),
      bs('What should I do if I miss the bus?', 'You can call a taxi from the front desk.', { chunks: ['can', 'call', 'a taxi', 'from', 'the front desk'], prefix: 'You' }),
      bs('Why are you studying so hard?', 'I want to get into a good graduate program.', { chunks: ['want', 'to get into', 'a good', 'graduate program'], prefix: 'I' }),
      bs('Did you like the documentary?', 'Yes, it made me think about the environment.', { chunks: ['it', 'made', 'me', 'think about', 'the environment'], prefix: 'Yes,', explain: 'make + объект + глагол без to.' }),
    ],
  },
  {
    task: 'build-sentence', title: 'Build a Sentence · Practice 6', timeSec: 360,
    items: [
      bs('When will the grades be posted?', 'They should be available by the end of the week.', { chunks: ['should be', 'available', 'by', 'the end', 'of the week'], prefix: 'They' }),
      bs('What did your parents ask about your new school?', 'They asked how many students were in my class.', { chunks: ['asked', 'how many students', 'were', 'in my class'], prefix: 'They', distractor: 'did', explain: 'Косвенный вопрос: how many students were…, без did.' }),
      bs('Are you taking the bus or walking?', 'I will probably walk because it is a nice day.', { chunks: ['will', 'probably', 'walk', 'because', 'it is', 'a nice day'], prefix: 'I', explain: 'probably — после will.' }),
      bs('Why do you like this coffee shop?', 'It is quiet enough to study in.', { chunks: ['is', 'quiet', 'enough', 'to study in'], prefix: 'It', explain: 'enough после прилагательного: quiet enough.' }),
      bs('Have you met the new teaching assistant?', 'Yes, she helped me with my lab report yesterday.', { chunks: ['she', 'helped', 'me', 'with my lab report', 'yesterday'], prefix: 'Yes,' }),
      bs('Where are the extra chairs?', 'They are stored in the room behind the stage.', { chunks: ['are', 'stored', 'in the room', 'behind', 'the stage'], prefix: 'They' }),
      bs('What is the best way to learn new vocabulary?', 'Reading every day is the most effective method.', { chunks: ['every day', 'is', 'the most', 'effective', 'method'], prefix: 'Reading' }),
      bs('Why is the road closed?', 'Workers are repairing a broken water pipe.', { chunks: ['are', 'repairing', 'a broken', 'water pipe'], prefix: 'Workers' }),
      bs('Did you remember to bring your laptop?', 'I left it charging in my room.', { chunks: ['left', 'it', 'charging', 'in my room'], prefix: 'I' }),
      bs('How was the hiking trip?', 'It was tiring, but the views were amazing.', { chunks: ['was', 'tiring,', 'but', 'the views', 'were', 'amazing'], prefix: 'It' }),
    ],
  },
]

export const EMAILS_2 = [
  {
    task: 'email', title: 'Write an Email · Practice 4', timeSec: 420,
    scenario: 'You are in a study group for your economics class. One member of the group, Chris, has missed the last three meetings and has not answered messages in the group chat. The group project is due in two weeks.',
    toName: 'Chris',
    points: ['Explain why you are writing', 'Describe what the group has done and what still needs to be done', 'Suggest how Chris could contribute'],
    to: 'chris.b@university.edu', subject: 'Our economics project',
    sample: 'Hi Chris,\n\nI hope everything is okay. I\'m writing because we haven\'t seen you at our last three group meetings, and we were a bit worried when you didn\'t reply in the group chat.\n\nSo far, we have collected the data and written the introduction and the methods section. What we still need is the analysis of the results and the slides for the presentation, which is due in two weeks.\n\nSince you are the best at statistics in our group, it would be great if you could take care of the analysis. If you can\'t come to meetings right now, you could work on it at home and send it to us by next Friday.\n\nLet me know how you\'re doing.\n\nBest,\nOlga',
  },
  {
    task: 'email', title: 'Write an Email · Practice 5', timeSec: 420,
    scenario: 'You recently attended a guest lecture by Dr. Elena Ruiz, a marine biologist, at your university. You found the lecture very interesting and would like to learn more about her research.',
    toName: 'Dr. Ruiz',
    points: ['Thank her and say what you found most interesting', 'Ask a question about her research', 'Ask whether there are opportunities for students to get involved'],
    to: 'e.ruiz@oceaninstitute.org', subject: 'Thank you for your lecture',
    sample: 'Dear Dr. Ruiz,\n\nThank you very much for your lecture on coral reef restoration last Tuesday. I found the part about growing coral fragments on underwater "nurseries" especially fascinating, because I had no idea that corals could be grown like plants.\n\nI was wondering how long it usually takes for the restored areas to attract fish again. Do you see a difference between reefs near cities and those far from the coast?\n\nI am a second-year biology student, and I would love to gain experience in this field. Are there any volunteer or internship opportunities for students at your institute, perhaps during the summer?\n\nThank you again for your time.\n\nSincerely,\nDmitri Volkov',
  },
  {
    task: 'email', title: 'Write an Email · Practice 6', timeSec: 420,
    scenario: 'You ordered a textbook from the campus bookstore\'s website two weeks ago. When it arrived, you saw that it was the wrong edition — your professor requires the 5th edition, but you received the 4th.',
    toName: 'the bookstore\'s customer service team',
    points: ['Explain the problem', 'Explain why you need the correct book soon', 'Say what you would like the bookstore to do'],
    to: 'orders@campusbookstore.com', subject: 'Wrong edition received — order #58213',
    sample: 'Dear Customer Service Team,\n\nI am writing about my order #58213, which I placed on your website on March 2. I ordered the 5th edition of "Principles of Biology," but the book I received is the 4th edition.\n\nUnfortunately, I need the correct edition as soon as possible, because our professor assigns homework problems from it every week, and the page numbers and exercises are different in the older edition. Our next assignment is due on Monday.\n\nCould you please send me the 5th edition by express delivery? I can return the 4th edition to the store this week. Alternatively, if the correct book is in stock at the campus store, I could exchange it there in person.\n\nThank you for your help.\n\nKind regards,\nElena Markova',
  },
]

export const DISCUSSIONS_2 = [
  {
    task: 'discussion', title: 'Academic Discussion · Practice 4', timeSec: 600,
    professor: { name: 'Dr. Morgan', text: 'In our environmental science course, we have discussed ways to reduce waste. Some people think the most effective approach is for governments to pass laws, such as banning single-use plastics. Others believe that education and changing individual habits is more effective in the long run. Which approach do you think will make a bigger difference, and why?' },
    students: [
      { name: 'Sofia', text: 'Laws work faster. When my country banned plastic bags, people adapted within a few months. Waiting for everyone to change their habits voluntarily would take decades.' },
      { name: 'James', text: 'I think education matters more. If people don\'t understand why a rule exists, they find ways around it. When people really care about the environment, they make good choices without being forced.' },
    ],
    sample: 'I think laws are more effective, but they work best when they make the sustainable choice the easiest one, not just when they ban something. Sofia\'s example shows how quickly people adapt, while James is right that people sometimes look for loopholes. A good solution is a law that changes the default. For example, in my city restaurants are now required to give customers plastic cutlery only if they ask for it. Nobody is forbidden from using it, yet the amount of waste dropped a lot, because most people simply accept the default. So well-designed laws can change behavior even without changing people\'s values first.',
  },
  {
    task: 'discussion', title: 'Academic Discussion · Practice 5', timeSec: 600,
    professor: { name: 'Dr. Kim', text: 'This week we are looking at teamwork in the workplace. Some managers prefer to form teams of people with similar backgrounds and skills, because they communicate easily. Others prefer teams of people with very different backgrounds and skills. Which kind of team do you think is more successful? Explain why.' },
    students: [
      { name: 'Daniel', text: 'Similar teams are more efficient. When everyone has the same training, you don\'t waste time explaining basic things, and there are fewer conflicts.' },
      { name: 'Mei', text: 'Diverse teams are more creative. People with different experiences notice different problems and suggest solutions others wouldn\'t think of.' },
    ],
    sample: 'In my view, the answer depends on the task, and I think this is the point both Daniel and Mei miss. For routine work with clear steps, a similar team is probably faster, as Daniel says. However, for new problems that have no obvious solution, a diverse team is much more successful. For example, when my university club organized a festival for the first time, our team included an engineering student, an art student and an international student. We argued more, but the international student suggested inviting local restaurants, which made the festival a success. So managers should choose the team based on how new and complex the problem is.',
  },
  {
    task: 'discussion', title: 'Academic Discussion · Practice 6', timeSec: 600,
    professor: { name: 'Dr. Hughes', text: 'In our history of science course, we have seen that many important discoveries were made by accident. Some people argue that governments should fund only research that has clear practical goals, such as curing a disease. Others say that funding curiosity-driven research, with no obvious application, is just as important. What is your opinion?' },
    students: [
      { name: 'Olivia', text: 'Public money is limited, so it should go to research that solves real problems, like climate change or cancer. Taxpayers expect results.' },
      { name: 'Ahmed', text: 'But many useful inventions came from research that had no practical goal at first. The laser, for example, was called "a solution looking for a problem."' },
    ],
    sample: 'I agree with Ahmed that curiosity-driven research is important, and I would add a further argument: it trains the scientists who later solve practical problems. Olivia is right that money is limited, but a country that only funds applied projects will eventually lack experts with deep knowledge. For instance, many of the researchers who quickly developed vaccines during the pandemic had spent years studying basic questions about how cells read genetic instructions, with no clear application in mind. Without that earlier work, there would have been nothing to apply. So governments should keep a balance, but they should never stop funding basic research.',
  },
]
