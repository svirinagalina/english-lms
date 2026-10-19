// Speaking: Listen and Repeat (7 sentences), Take an Interview (4 questions).

export const LISTEN_REPEAT = [
  {
    task: 'listen-repeat', title: 'Listen and Repeat · Practice 1',
    scenario: 'You are learning to give tours of the university library. Listen to the head librarian and repeat what she says.',
    sentences: [
      'Welcome to the main library.',
      'The quiet study area is upstairs.',
      'Please keep your phone on silent.',
      'You can borrow up to ten books at a time.',
      'Printers are located next to the information desk.',
      'Group study rooms can be reserved on the library website.',
      'If you need help finding a source, ask any of our librarians.',
    ],
  },
  {
    task: 'listen-repeat', title: 'Listen and Repeat · Practice 2',
    scenario: 'You are training to work at the campus science museum. Listen to your supervisor and repeat what he says.', gender: 'male',
    sentences: [
      'The museum opens at ten.',
      'Visitors should start on the ground floor.',
      'Touching the fossils is not allowed.',
      'The planetarium show begins every hour.',
      'Children under twelve must stay with an adult.',
      'The gift shop is at the end of the dinosaur exhibit.',
      'Please remind visitors that photos without flash are welcome.',
    ],
  },
  {
    task: 'listen-repeat', title: 'Listen and Repeat · Practice 3',
    scenario: 'You are a new assistant in a chemistry lab. Listen to the lab manager and repeat what she says.',
    sentences: [
      'Always wear your safety glasses.',
      'Lab coats hang behind the door.',
      'Never eat or drink in this room.',
      'Wash your hands before you leave the lab.',
      'Broken glass goes in the red container.',
      'Write down every measurement in your lab notebook.',
      'If a chemical touches your skin, rinse it with water immediately.',
    ],
  },
]

export const INTERVIEWS = [
  {
    task: 'interview', title: 'Take an Interview · Practice 1', responseSec: 45,
    scenario: 'You have agreed to take part in a research study about how students spend their free time. A researcher will ask you some questions.',
    questions: [
      'What do you usually do to relax after a busy day?',
      'Do you prefer spending your free time alone or with other people? Why?',
      'Some people say that students today have less free time than in the past. Do you agree?',
      'Should universities require students to take part in at least one club or sport? Explain your opinion.',
    ],
  },
  {
    task: 'interview', title: 'Take an Interview · Practice 2', responseSec: 45,
    scenario: 'You are taking part in a study about technology and daily life. A researcher will ask you some questions.',
    questions: [
      'Which app or device do you use most often, and what for?',
      'Has technology made it easier or harder for you to concentrate when you study? Why?',
      'Many schools now ban phones in classrooms. What is your opinion of this rule?',
      'In the future, do you think people will work mostly from home? Explain why or why not.',
    ],
  },
  {
    task: 'interview', title: 'Take an Interview · Practice 3', responseSec: 45,
    scenario: 'You are participating in a study about cities and the environment. A researcher will ask you some questions.',
    questions: [
      'How do you usually get around in your town or city?',
      'What is one thing your city could do to become cleaner or greener?',
      'Some people believe cars should be banned from city centers. Do you agree?',
      'Is it the responsibility of individuals or governments to protect the environment? Explain your view.',
    ],
  },
]
