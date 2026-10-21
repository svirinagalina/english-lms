// Listening · Intermediate (B1): stories and mini-podcasts written for this
// platform. Short sentences, everyday vocabulary, past simple / continuous.
import { story, podcast, q } from './helpers.js'

export const B1 = {
  title: 'Listening · Intermediate (B1)',
  description: 'Детективные истории и мини-подкасты об интересных фактах для уровня Intermediate. Слушайте и читайте одновременно; двойной клик по слову — перевод и добавление в ваш словарь.',
  rate: '-6%',
  lessons: [
    story({
      title: 'Detective 1. The Missing Painting',
      voice: 'en-GB-RyanNeural',
      paragraphs: [
        'The small museum in the town of Linfield had only one famous painting. It was called "The Blue Boat", and it showed a fishing boat on a calm sea at sunrise. Every summer, hundreds of tourists came to see it. So when the painting disappeared on a rainy Tuesday morning, the whole town was shocked.',
        'Detective Anna Price arrived at the museum at ten o\'clock. The director, Mr Holt, was waiting for her at the door. He looked pale and tired. "I locked the building at six o\'clock yesterday evening," he said. "When I came back this morning, the painting was gone. But the doors were still locked, and the alarm didn\'t ring."',
        'Anna walked slowly around the room. The empty wall looked strange. There were no broken windows and no marks on the floor. Only three people had keys to the museum: Mr Holt, the cleaner Mrs Green, and a young guide called Tom.',
        'First, Anna spoke to Mrs Green. She was an older woman who had worked at the museum for twenty years. "I finished cleaning at five yesterday," she said. "I went straight home because my granddaughter was visiting." Her neighbour later confirmed this.',
        'Then Anna spoke to Tom. He was nervous and kept looking at his phone. "I was at the cinema last night," he said quickly. "I watched a film with my friends." Anna asked him which film he saw. He told her the name, but he couldn\'t remember how it ended.',
        'Finally, Anna went back to Mr Holt\'s office. While she was waiting for him, she noticed something interesting. In the corner there was a large umbrella, and it was completely dry. But it had rained heavily all morning, and Mr Holt said he had walked to work.',
        '"Mr Holt," Anna said when he came in, "you told me you walked here this morning in the rain. Why is your umbrella dry?" The director\'s face turned red. He sat down and was silent for a long time.',
        'In the end, he told her the truth. The museum had serious money problems, and he was afraid it would close. A rich collector had offered him a lot of money for the painting. He came to the museum late at night, switched off the alarm and took the painting himself. He planned to say that it was stolen.',
        'The painting was found the next day in the boot of his car. "The Blue Boat" went back on the wall, and the people of Linfield were happy again. As for Tom, he really had been at the cinema. He just fell asleep in the middle of the film.',
      ],
      questions: [
        q('When did the painting disappear?', ['On a rainy Tuesday morning', 'On a sunny Sunday', 'During a summer festival'], 'On a rainy Tuesday morning'),
        q('How many people had keys to the museum?', ['Two', 'Three', 'Five'], 'Three'),
        q('What made Anna suspicious of Mr Holt?', ['His car was dirty', 'His umbrella was dry', 'He was late for work'], 'His umbrella was dry'),
        q('Why did Mr Holt take the painting?', ['He wanted to hang it at home', 'The museum had money problems', 'Tom asked him to'], 'The museum had money problems'),
        q('Why couldn\'t Tom remember the end of the film?', ['He was lying', 'He left early', 'He fell asleep'], 'He fell asleep'),
      ],
    }),
    story({
      title: 'Detective 2. The Birthday Cake',
      voice: 'en-US-AndrewMultilingualNeural',
      paragraphs: [
        'It was Lily\'s eighth birthday, and her mother had spent the whole afternoon making a beautiful chocolate cake. It had pink flowers on top and the words "Happy Birthday, Lily" in white icing. She put it on the kitchen table and went upstairs to get ready for the party.',
        'Twenty minutes later, she came back down and screamed. A large piece of the cake was missing. There were chocolate crumbs on the table and on the floor. The guests were arriving in half an hour, and the cake was ruined.',
        'Lily\'s grandfather, who had been a police officer for thirty years, heard the scream and came into the kitchen. "Don\'t worry," he said with a smile. "This is a simple case. Let\'s find the thief."',
        'There were four people in the house: Lily, her older brother Max, her little cousin Sophie, and the family dog, Biscuit. Grandad decided to interview everyone, one by one.',
        'Max was in the living room, playing a video game. "I didn\'t touch the cake," he said without looking up. "I\'ve been here for an hour. Ask anyone." Grandad noticed that Max\'s hands were clean and his game had a timer that showed he had played for fifty-five minutes without a break.',
        'Sophie was in the garden on the swing. She was only five, and she was wearing a white dress. "I don\'t like chocolate," she said. "I like strawberry." Her dress was perfectly clean.',
        'Lily was in her bedroom, choosing a hair band. She looked upset. "Why would I eat my own cake before the party?" she asked. It was a good question.',
        'Finally, Grandad looked for Biscuit. The dog was not in his usual place by the door. Grandad found him under the dining table. Biscuit didn\'t come out. He just looked up with big, sad eyes, and there was chocolate all around his mouth.',
        '"Case closed," said Grandad. But then he became serious. Chocolate is dangerous for dogs, so the family called the vet immediately. Luckily, Biscuit had eaten only a small amount and was fine. The party went ahead with a slightly smaller cake, and Lily said it was the most exciting birthday she had ever had.',
      ],
      questions: [
        q('How old was Lily?', ['Six', 'Eight', 'Ten'], 'Eight'),
        q('What was Grandad\'s job before he retired?', ['A cook', 'A teacher', 'A police officer'], 'A police officer'),
        q('Why did Grandad believe Max?', ['Max was in the garden', 'The game timer showed he had played without a break', 'Max said sorry'], 'The game timer showed he had played without a break'),
        q('Where did Grandad find Biscuit?', ['In the garden', 'Under the dining table', 'In Lily\'s bedroom'], 'Under the dining table'),
        q('Why did the family call the vet?', ['Chocolate is dangerous for dogs', 'Biscuit hurt his leg', 'Biscuit was very old'], 'Chocolate is dangerous for dogs'),
      ],
    }),
    podcast({
      title: 'Facts 1. Octopuses: the cleverest animals in the sea',
      voice: 'en-US-EmmaMultilingualNeural',
      paragraphs: [
        'Hello and welcome to Small Facts, Big World. Today we\'re going under the sea to meet one of the strangest and smartest animals on our planet: the octopus.',
        'Let\'s start with the body. An octopus has eight arms, but did you know it also has three hearts? Two hearts pump blood to the gills, where the octopus gets oxygen from the water. The third heart pumps blood to the rest of the body. And here\'s another surprise: octopus blood is blue, not red.',
        'Octopuses are also very intelligent. In experiments, they have learned to open jars to get food inside. Some octopuses in aquariums have escaped from their tanks at night, visited another tank to eat a fish, and then gone back home before the morning.',
        'Their arms are special too. Most of an octopus\'s nerve cells are not in its head but in its arms. This means each arm can do some things on its own, like touching, tasting and grabbing, while the octopus is thinking about something else.',
        'And then there\'s their famous trick: changing colour. An octopus can change the colour and even the texture of its skin in less than a second. It uses this to hide from enemies, to catch food and maybe even to show its mood.',
        'So next time you see an octopus in a picture or an aquarium, remember: you\'re looking at an animal with three hearts, blue blood and very clever arms. Thanks for listening, and see you next time.',
      ],
      questions: [
        q('How many hearts does an octopus have?', ['One', 'Two', 'Three'], 'Three'),
        q('What colour is octopus blood?', ['Red', 'Blue', 'Green'], 'Blue'),
        q('What have some octopuses done in aquariums?', ['Sung songs', 'Escaped and eaten fish from another tank', 'Opened the doors of the building'], 'Escaped and eaten fish from another tank'),
        q('Where are most of an octopus\'s nerve cells?', ['In its head', 'In its arms', 'In its hearts'], 'In its arms'),
      ],
    }),
    podcast({
      title: 'Facts 2. Why honey can last for thousands of years',
      voice: 'en-US-BrianMultilingualNeural',
      paragraphs: [
        'Welcome back to Small Facts, Big World. Here\'s a question for you: what food can stay good for hundreds, or even thousands, of years? The answer is sitting in many kitchens around the world. It\'s honey.',
        'Archaeologists have found pots of honey in ancient Egyptian tombs. The honey was thousands of years old, and it had not gone bad. So why doesn\'t honey spoil like milk, bread or fruit?',
        'The first reason is sugar. Honey is mostly sugar and contains very little water. Bacteria and other tiny living things need water to grow. In honey, there simply isn\'t enough of it for them to survive.',
        'The second reason is that honey is slightly acidic. This makes it an even more difficult place for bacteria to live.',
        'The third reason comes from the bees themselves. When bees make honey, they add a special substance from their bodies. This substance helps to produce a very small amount of hydrogen peroxide, which also fights bacteria. In the past, people even put honey on cuts and wounds to keep them clean.',
        'There is one thing to remember, though. Honey needs to be kept in a closed jar. If it takes in water from the air, it can start to change. And sometimes honey becomes hard and white. Don\'t worry, it isn\'t bad. Just warm the jar gently in hot water, and it will become liquid again. Thanks for listening!',
      ],
      questions: [
        q('Where have archaeologists found very old honey?', ['In ancient Egyptian tombs', 'In old ships', 'In caves in Russia'], 'In ancient Egyptian tombs'),
        q('Why can\'t bacteria grow well in honey?', ['It is too cold', 'There is very little water in it', 'It has too much salt'], 'There is very little water in it'),
        q('What did people in the past put honey on?', ['Bread only', 'Cuts and wounds', 'Their hair'], 'Cuts and wounds'),
        q('What should you do if your honey becomes hard and white?', ['Throw it away', 'Warm the jar gently in hot water', 'Put it in the fridge'], 'Warm the jar gently in hot water'),
      ],
    }),
    podcast({
      title: 'Facts 3. What happens to your brain while you sleep',
      voice: 'en-US-AvaMultilingualNeural',
      paragraphs: [
        'Hi, and welcome to Small Facts, Big World. Most of us spend about a third of our lives asleep. That sounds like a lot of wasted time, doesn\'t it? But scientists now know that sleep is one of the busiest times for our brain.',
        'Sleep happens in cycles. Each cycle lasts about ninety minutes, and we usually have four to six cycles every night. In each cycle there is light sleep, deep sleep and a stage called REM sleep. REM means "rapid eye movement", because during this stage our eyes move quickly under our eyelids. This is when we have most of our dreams.',
        'During deep sleep, the brain does something like housework. It sorts the things we learned during the day and saves the important ones as memories. This is why students who sleep well after studying often remember more than students who stay up all night.',
        'Sleep also helps us to control our emotions. After a bad night, small problems can seem much bigger, and people feel angry or sad more easily.',
        'So how much sleep do we need? Most adults need between seven and nine hours a night. Teenagers need even more. Some simple tips can help: go to bed at the same time every day, keep your bedroom dark and cool, and put your phone away at least half an hour before sleep.',
        'So tonight, when you go to bed, remember that your brain isn\'t switching off. It\'s busy working for you. Sleep well, and thanks for listening.',
      ],
      questions: [
        q('How long does one sleep cycle last?', ['About thirty minutes', 'About ninety minutes', 'About three hours'], 'About ninety minutes'),
        q('When do we have most of our dreams?', ['During light sleep', 'During REM sleep', 'Just before we wake up'], 'During REM sleep'),
        q('What does the brain do during deep sleep?', ['Saves important things as memories', 'Stops working completely', 'Makes our eyes move'], 'Saves important things as memories'),
        q('How much sleep do most adults need?', ['Five to six hours', 'Seven to nine hours', 'Ten to twelve hours'], 'Seven to nine hours'),
      ],
    }),
  ],
}
