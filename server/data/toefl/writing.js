import { bs } from './helpers.js'

// Writing: Build a Sentence, Write an Email, Academic Discussion.

export const BUILD_SENTENCE = [
  {
    task: 'build-sentence', title: 'Build a Sentence · Practice 1', timeSec: 360,
    items: [
      bs('Where did you put the lab reports?', 'I left them on the desk by the window.', { chunks: ['left', 'them', 'on the desk', 'by', 'the window'], prefix: 'I', explain: 'Порядок: подлежащее + глагол + объект + место (on the desk) + уточнение (by the window).' }),
      bs('Are you coming to the review session?', 'I can\'t because I have to work tonight.', { chunks: ['can\'t', 'because', 'I', 'have to', 'work', 'tonight'], prefix: 'I', explain: 'Придаточное причины: because + полное предложение (I have to work). Время — в конце.' }),
      bs('What did the professor want to know?', 'She asked where we had found our sources.', { chunks: ['asked', 'where', 'we', 'had found', 'our sources'], prefix: 'She', distractor: 'did', explain: 'Косвенный вопрос: после where — прямой порядок слов (we had found), без did. Лишнее слово — did.' }),
      bs('Which book should I read first?', 'The one with the blue cover is the easiest.', { chunks: ['with', 'the blue cover', 'is', 'the easiest'], prefix: 'The one', explain: '«The one with…» — подлежащее с определением, затем глагол is.' }),
      bs('Did you enjoy the concert last night?', 'It was much better than I had expected.', { chunks: ['was', 'much', 'better', 'than', 'I had expected'], prefix: 'It', explain: 'Сравнение: much better than…; much усиливает сравнительную степень.' }),
      bs('Why is the cafeteria so crowded?', 'They are offering free coffee to all students today.', { chunks: ['are offering', 'free coffee', 'to all students', 'today'], prefix: 'They', explain: 'Глагол + прямое дополнение + кому + когда.' }),
      bs('Have you decided on a topic for your essay?', 'I\'m still trying to choose between two ideas.', { chunks: ['still', 'trying', 'to choose', 'between', 'two ideas'], prefix: 'I\'m', explain: 'still стоит перед смысловым глаголом: I\'m still trying.' }),
      bs('How long does the shuttle take?', 'It usually takes about twenty minutes to get downtown.', { chunks: ['usually', 'takes', 'about twenty minutes', 'to get', 'downtown'], prefix: 'It', explain: 'Наречие частоты usually — перед смысловым глаголом. It takes + время + to do.' }),
      bs('Could you help me with this equation?', 'I would be happy to look at it after class.', { chunks: ['would', 'be happy', 'to look at', 'it', 'after class'], prefix: 'I', explain: 'be happy to do something; it после фразового глагола look at.' }),
      bs('Do you know if the gym is open on Sundays?', 'I\'m not sure whether it opens before noon.', { chunks: ['not sure', 'whether', 'it', 'opens', 'before noon'], prefix: 'I\'m', distractor: 'does', explain: 'После whether — прямой порядок (it opens), без does.' }),
    ],
  },
  {
    task: 'build-sentence', title: 'Build a Sentence · Practice 2', timeSec: 360,
    items: [
      bs('What time does the museum close?', 'I think it closes at six on weekdays.', { chunks: ['think', 'it', 'closes', 'at six', 'on weekdays'], prefix: 'I' }),
      bs('Did you register for the workshop?', 'Yes, but I haven\'t received a confirmation yet.', { chunks: ['but', 'I', 'haven\'t received', 'a confirmation', 'yet'], prefix: 'Yes,', explain: 'yet в отрицании — в конце предложения.' }),
      bs('What did your roommate say about the noise?', 'He wanted to know who had been playing music so late.', { chunks: ['wanted to know', 'who', 'had been playing', 'music', 'so late'], prefix: 'He', distractor: 'did', explain: 'Косвенный вопрос с who — без вспомогательного did.' }),
      bs('Why are you taking the stairs?', 'The elevator has been out of order since Monday.', { chunks: ['has been', 'out of order', 'since', 'Monday'], prefix: 'The elevator', explain: 'Present Perfect + since + момент времени.' }),
      bs('Which group are you in for the project?', 'I\'m working with the students who sit near the door.', { chunks: ['working', 'with', 'the students', 'who', 'sit', 'near the door'], prefix: 'I\'m', explain: 'Относительное придаточное who sit… сразу после существительного.' }),
      bs('Is it going to rain tomorrow?', 'The forecast says there is a chance of storms.', { chunks: ['says', 'there is', 'a chance', 'of storms'], prefix: 'The forecast' }),
      bs('Where can I find a quiet place to study?', 'You should try the reading room on the top floor.', { chunks: ['should', 'try', 'the reading room', 'on the top floor'], prefix: 'You' }),
      bs('How was your first week at the internship?', 'It was challenging, but I learned a lot.', { chunks: ['was', 'challenging,', 'but', 'I', 'learned', 'a lot'], prefix: 'It' }),
      bs('Why did you change your major?', 'I realized that I enjoyed biology more than chemistry.', { chunks: ['realized', 'that', 'I enjoyed', 'biology', 'more than', 'chemistry'], prefix: 'I' }),
      bs('Can you tell me how to get to the dean\'s office?', 'It is on the second floor next to the elevators.', { chunks: ['is', 'on the second floor', 'next to', 'the elevators'], prefix: 'It' }),
    ],
  },
  {
    task: 'build-sentence', title: 'Build a Sentence · Practice 3', timeSec: 360,
    items: [
      bs('Have you seen my calculator?', 'I saw it on the table in the study room.', { chunks: ['saw', 'it', 'on the table', 'in the study room'], prefix: 'I' }),
      bs('What did the coach tell the team?', 'He told us that practice would start earlier.', { chunks: ['told', 'us', 'that', 'practice', 'would start', 'earlier'], prefix: 'He', explain: 'Согласование времён: will → would в косвенной речи.' }),
      bs('Do you need any help with the posters?', 'Thanks, but we have almost finished them.', { chunks: ['but', 'we', 'have', 'almost', 'finished', 'them'], prefix: 'Thanks,', explain: 'almost — между have и причастием.' }),
      bs('Why is Professor Diaz so popular?', 'Her lectures are both informative and entertaining.', { chunks: ['lectures', 'are', 'both', 'informative', 'and', 'entertaining'], prefix: 'Her', explain: 'Парный союз both … and.' }),
      bs('Where are you going this summer?', 'I am planning to visit my grandparents in Spain.', { chunks: ['am', 'planning', 'to visit', 'my grandparents', 'in Spain'], prefix: 'I' }),
      bs('Could you explain the assignment again?', 'You need to compare two articles on the same topic.', { chunks: ['need', 'to compare', 'two articles', 'on', 'the same topic'], prefix: 'You' }),
      bs('Do you remember when the deadline is?', 'I have no idea when we are supposed to submit it.', { chunks: ['have', 'no idea', 'when', 'we are', 'supposed to', 'submit it'], prefix: 'I', distractor: 'are we', explain: 'Косвенный вопрос — прямой порядок: when we are…, а не when are we.' }),
      bs('Was the lecture recorded?', 'Yes, the video will be posted online tomorrow.', { chunks: ['the video', 'will be', 'posted', 'online', 'tomorrow'], prefix: 'Yes,', explain: 'Пассив в будущем: will be + V3.' }),
      bs('How did you get so good at chess?', 'My father taught me when I was a child.', { chunks: ['father', 'taught', 'me', 'when', 'I was', 'a child'], prefix: 'My' }),
      bs('What should I bring to the picnic?', 'Bring something to drink if you can.', { chunks: ['something', 'to drink', 'if', 'you', 'can'], prefix: 'Bring' }),
    ],
  },
]

export const EMAILS = [
  {
    task: 'email', title: 'Write an Email · Practice 1', timeSec: 420,
    scenario: 'You signed up for a weekend photography workshop offered by your university\'s art department. Yesterday you learned that you have to take an important exam on the same Saturday morning.',
    toName: 'the workshop organizer, Ms. Carter',
    points: ['Explain your situation', 'Ask whether you can join a later session or get a refund', 'Say what you were especially looking forward to in the workshop'],
    to: 'j.carter@university.edu', subject: 'Photography workshop — schedule conflict',
    sample: 'Dear Ms. Carter,\n\nI registered for the weekend photography workshop, and I was really looking forward to it. Unfortunately, I have just found out that my final chemistry exam has been scheduled for Saturday morning, so I won\'t be able to attend the first session.\n\nI was wondering whether it would be possible to join the next workshop, if there is one later this semester. If not, could I get a refund for my registration fee?\n\nI was especially excited about the session on portrait lighting, because I have recently started taking photos of my friends and want to improve my skills.\n\nThank you for your understanding.\n\nBest regards,\nAnna Petrova',
  },
  {
    task: 'email', title: 'Write an Email · Practice 2', timeSec: 420,
    scenario: 'You live in a student apartment. For two weeks, the heating in your room has not worked properly, and the room is very cold at night. You reported it once, but nothing has happened.',
    toName: 'the building manager, Mr. Grant',
    points: ['Describe the problem and how it affects you', 'Mention what you have already done', 'Suggest a time when the repair could be made'],
    to: 'housing.grant@university.edu', subject: 'Heating problem in Room 305',
    sample: 'Dear Mr. Grant,\n\nI am writing about the heating in my room, 305. For the past two weeks, the radiator has barely worked, and at night the temperature drops so low that I have trouble sleeping and studying.\n\nI reported the problem through the online maintenance form on March 3, but I have not received a reply or a visit yet.\n\nCould someone come to fix it this week? I am usually in my room after 4 p.m., and I am free all day on Friday, so any of those times would be convenient.\n\nThank you in advance for your help.\n\nSincerely,\nIvan Sokolov',
  },
  {
    task: 'email', title: 'Write an Email · Practice 3', timeSec: 420,
    scenario: 'A friend of yours, Sam, is moving to your city next month to start a new job. Sam has asked you for advice about where to live.',
    toName: 'your friend Sam',
    points: ['Recommend a neighborhood and explain why', 'Warn Sam about something to avoid', 'Offer to help in some way'],
    to: 'sam.miller@mail.com', subject: 'Re: Moving next month!',
    sample: 'Hi Sam,\n\nGreat news about the job! I think you should look for a place in Riverside. It\'s quiet, there are lots of cafés and a big park, and it takes only twenty minutes to get downtown by tram.\n\nOne thing to avoid is renting an apartment near the old station. The rent is cheap, but it\'s really noisy at night because of the trains.\n\nIf you like, I can go to some viewings with you when you arrive, or check out a few apartments for you before then and send you photos.\n\nCan\'t wait to see you!\n\nCheers,\nMasha',
  },
]

export const DISCUSSIONS = [
  {
    task: 'discussion', title: 'Academic Discussion · Practice 1', timeSec: 600,
    professor: { name: 'Dr. Rivera', text: 'This week we are discussing technology in education. Some universities now record every lecture and post it online. Supporters say this helps students review difficult material. Others worry that students will stop attending classes. Do you think universities should record all lectures and make them available online? Why or why not?' },
    students: [
      { name: 'Kelly', text: 'I think recordings are really helpful. I often miss small details when I take notes, and being able to watch a part again before an exam makes a big difference. Also, students who are sick don\'t fall behind.' },
      { name: 'Andrew', text: 'I understand the benefits, but I think attendance would drop a lot. Being in the classroom lets you ask questions and discuss ideas with others, and you can\'t do that with a video.' },
    ],
    sample: 'I believe universities should record lectures, but with one condition: the recordings should be available only after a short delay, for example a week. Kelly is right that videos help students review, but Andrew\'s concern about attendance is also reasonable. A delay would solve both problems. Students would still need to come to class to keep up with the material and take part in discussions, but they could use the recordings later to prepare for exams. In my own experience, I review recorded lectures mainly before tests, not instead of going to class, so a delay would not reduce their value.',
  },
  {
    task: 'discussion', title: 'Academic Discussion · Practice 2', timeSec: 600,
    professor: { name: 'Dr. Chen', text: 'In our urban planning unit, we have been looking at how cities spend their budgets. Imagine a city has extra money this year. Should it spend it on improving public transportation or on creating more parks and green spaces? Which choice would benefit residents more, and why?' },
    students: [
      { name: 'Priya', text: 'Public transportation, definitely. If buses and trains are faster and cheaper, people can get to jobs and schools more easily, and there would be less traffic and pollution.' },
      { name: 'Marco', text: 'I\'d choose parks. People in cities spend so much time indoors. Parks give them a place to exercise and relax, which is good for both physical and mental health.' },
    ],
    sample: 'Both Priya and Marco make good points, but I would choose public transportation because it helps more people every single day, including people who cannot afford a car. However, I want to add an aspect nobody has mentioned: good transport actually makes existing parks more useful. In my city, the largest park is on the edge of town, and many families never visit it because there is no direct bus. If the city improved transport, more residents could reach green spaces that already exist. So investing in transport would bring the benefits Marco describes without building new parks.',
  },
  {
    task: 'discussion', title: 'Academic Discussion · Practice 3', timeSec: 600,
    professor: { name: 'Dr. Okafor', text: 'Today we are talking about work and careers. Some people believe that young people should choose a career based mainly on salary. Others think that personal interest is more important. When choosing a career, what should young people consider most important? Explain your view.' },
    students: [
      { name: 'Jenna', text: 'I think interest matters most. If you don\'t enjoy your job, you won\'t be motivated, and you will probably not be very successful anyway.' },
      { name: 'Tomás', text: 'Salary is more practical. Many young people have student loans, and a good salary gives them security. You can enjoy hobbies outside of work.' },
    ],
    sample: 'In my opinion, young people should look first at the skills a job will help them develop, rather than only at salary or interest. Jenna and Tomás both focus on the present, but a first job is mostly a place to learn. For example, my cousin took a job with an average salary at a small tech company because she could work on many different projects. Three years later, her experience let her move to a much better-paid position that she also enjoys. So choosing a job that builds valuable skills can lead to both a good salary and interesting work in the long run.',
  },
]
