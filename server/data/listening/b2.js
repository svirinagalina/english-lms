// Listening · Upper-Intermediate (B2): longer stories and mini-podcasts with
// past perfect, reported speech, phrasal verbs and more precise vocabulary.
import { story, podcast, q } from './helpers.js'

export const B2 = {
  title: 'Listening · Upper-Intermediate (B2)',
  description: 'Детективные истории и мини-подкасты об интересных фактах для уровня Upper-Intermediate. Слушайте и читайте одновременно; двойной клик по слову — перевод и добавление в ваш словарь.',
  rate: '+0%',
  lessons: [
    story({
      title: 'Detective 1. The Last Train to Brighton',
      voice: 'en-GB-ThomasNeural',
      paragraphs: [
        'The 23:40 from London Victoria to Brighton was almost empty that Friday night. Only six passengers were scattered across the front carriage, most of them half-asleep or staring at their phones. When the train pulled into Brighton an hour later, one of them, a businessman called Gregory Shaw, discovered that his leather briefcase had vanished from the luggage rack above his seat.',
        'Inside the briefcase, he told the transport police, were the signed contracts for a deal worth two million pounds. Without them, the deal would collapse on Monday morning. Detective Sergeant Ravi Mehta, who happened to be on duty at the station, agreed to question the other passengers before they left.',
        'The first was a student named Chloe, who had been listening to music with her headphones on for the whole journey. She said she hadn\'t noticed anything unusual, except that the lights had flickered and gone out for a few seconds somewhere near Gatwick.',
        'The second was an elderly man, Mr Barnes, travelling with a walking stick. He claimed he had slept from Clapham Junction onwards and only woken up when the train stopped. He seemed irritated at being kept from his bed.',
        'The third passenger, a woman in a grey coat called Ms Doyle, said she worked in finance. When Mehta asked whether she knew Mr Shaw, she hesitated for a moment and then said she had never seen him before.',
        'The remaining two passengers were a young couple who had boarded together and spent most of the journey arguing in low voices. Neither of them had gone near Mr Shaw\'s end of the carriage, according to Chloe, who had been sitting opposite them.',
        'Mehta asked the guard about the lights. The guard confirmed that the train had briefly lost power in a tunnel, which happened from time to time on that line. "Twelve seconds, maybe fifteen," he said. "Long enough to make people jump."',
        'Mehta then looked more closely at the passengers\' belongings. Ms Doyle\'s handbag was too small to hide a briefcase, but her coat pocket held something interesting: a business card with the name of the company that was competing against Mr Shaw for the very same contract. When Mehta pointed this out, she insisted it was a coincidence. She met hundreds of people, she said.',
        'But it was Mr Barnes who had made the real mistake. When Mehta asked him how long the lights had been off, he replied without thinking, "Oh, no more than a quarter of a minute." Mehta smiled. "That\'s very precise," he said, "for a man who was fast asleep."',
        'The briefcase was found under a pile of newspapers in the toilet at the end of the carriage, exactly where Mr Barnes had left it during the blackout, planning to collect it after the other passengers had gone. It turned out that Ms Doyle\'s company had paid him to steal it. The walking stick, it emerged, was only part of his costume. He had never needed it in his life.',
      ],
      questions: [
        q('What was inside Mr Shaw\'s briefcase?', ['Cash', 'Signed contracts for a big deal', 'A laptop with secret files'], 'Signed contracts for a big deal'),
        q('What happened near Gatwick?', ['The train stopped for an hour', 'The lights went out for a few seconds', 'A passenger got off'], 'The lights went out for a few seconds'),
        q('What did Mehta find in Ms Doyle\'s coat?', ['The briefcase key', 'A business card from a competing company', 'A train ticket to London'], 'A business card from a competing company'),
        q('How did Mr Barnes give himself away?', ['He knew exactly how long the lights were off', 'He was carrying the briefcase', 'He ran away from the station'], 'He knew exactly how long the lights were off'),
        q('Where was the briefcase hidden?', ['Under a seat', 'In the toilet under newspapers', 'In Ms Doyle\'s handbag'], 'In the toilet under newspapers'),
      ],
    }),
    story({
      title: 'Detective 2. The Silent Witness',
      voice: 'en-US-AndrewMultilingualNeural',
      paragraphs: [
        'When Harriet Lane, a retired opera singer, reported that her diamond necklace had been stolen from her house in the countryside, the local police assumed it would be a routine case. There was no sign of a break-in, and only three people had been in the house that day: her nephew Oliver, her housekeeper Mrs Ford, and a gardener named Daniel who had come to cut the hedges.',
        'Inspector Clara Webb arrived late in the afternoon. The house was full of old photographs, theatre posters and, rather unexpectedly, a large grey parrot called Puccini, who sat on a stand in the living room and watched everyone with great interest.',
        'Oliver was the first to be interviewed. He explained, a little too eagerly, that he had spent the whole day in the library working on his novel. He admitted that he was short of money but pointed out that he was his aunt\'s only heir. "Why would I steal something that will be mine one day anyway?" he asked.',
        'Mrs Ford had been with the family for fifteen years. She said she had spent the morning shopping in the village and the afternoon in the kitchen. She remembered hearing the parrot making a racket at around three o\'clock, which, she added, was unusual, as he normally slept after lunch.',
        'Daniel, the gardener, had never been inside the house before. He said he had stayed outside the entire time and had only knocked on the back door once to ask for a glass of water. Mrs Ford confirmed this.',
        'Webb was about to leave when the parrot suddenly began to speak. "Lovely, lovely," it said in a deep voice. "Put it back, Ollie. Put it back." Then it whistled a few notes from an opera and fell silent.',
        'Harriet went pale. "He only learned to say Ollie last month," she whispered. "And the only person who calls my nephew that is his girlfriend. She was here yesterday, while I was at the doctor\'s."',
        'It turned out that Oliver had let his girlfriend into the house the day before. She had taken the necklace to have it valued, convinced that Oliver would never see his inheritance if they waited. Oliver had begged her to return it, standing in the living room, while Puccini listened to every word.',
        'Parrots are not usually considered reliable witnesses, and the evidence would never have stood up in court on its own. But faced with the bird\'s performance, Oliver broke down and confessed. The necklace was returned the following morning, and Harriet decided, rather wisely, to update her will.',
      ],
      questions: [
        q('Who was Harriet Lane?', ['A retired opera singer', 'A famous writer', 'A police inspector'], 'A retired opera singer'),
        q('Why did Oliver say he wouldn\'t steal the necklace?', ['He didn\'t like jewellery', 'He would inherit it one day anyway', 'He was in London that day'], 'He would inherit it one day anyway'),
        q('What was unusual about the parrot at three o\'clock?', ['It escaped', 'It was noisy when it normally slept', 'It refused to eat'], 'It was noisy when it normally slept'),
        q('Who actually took the necklace?', ['The gardener', 'The housekeeper', 'Oliver\'s girlfriend'], 'Oliver\'s girlfriend'),
        q('Why couldn\'t the parrot\'s words be the only evidence in court?', ['Parrots aren\'t considered reliable witnesses', 'Nobody understood it', 'It spoke in Italian'], 'Parrots aren\'t considered reliable witnesses'),
      ],
    }),
    podcast({
      title: 'Facts 1. Why the sky is blue and sunsets are red',
      voice: 'en-US-EmmaMultilingualNeural',
      paragraphs: [
        'Welcome to Curious Minds, the podcast where we take everyday things and ask, "But why?" Today\'s question is one that almost every child asks at some point: why is the sky blue? And while we\'re at it, why does it turn orange and red at sunset?',
        'Let\'s start with sunlight. It looks white to us, but it\'s actually a mixture of all the colours of the rainbow. Each colour travels as a wave, and the waves have different lengths. Red light has the longest waves, and blue and violet light have the shortest.',
        'When sunlight enters our atmosphere, it bumps into tiny molecules of gas, mostly nitrogen and oxygen. These molecules are much smaller than the waves of light, and they scatter short waves far more strongly than long ones. This effect is called Rayleigh scattering, after the British scientist who explained it in the nineteenth century.',
        'So blue light gets bounced around the sky in every direction, and wherever we look, some of it reaches our eyes. That\'s why the sky looks blue. You might wonder why it isn\'t violet, since violet waves are even shorter. Part of the answer is that sunlight contains less violet, and our eyes are simply more sensitive to blue.',
        'Now, sunsets. When the sun is low on the horizon, its light has to travel through much more air to reach us. By the time it arrives, most of the blue has been scattered away, leaving the longer orange and red waves. Dust, smoke or tiny droplets in the air can make the colours even more dramatic.',
        'And here\'s a final twist: on Mars, it\'s the other way round. The fine red dust in the Martian air makes the daytime sky look pinkish, while sunsets there can appear blue. So the colour of the sky depends not only on the sun, but on exactly what is floating in the air. Thanks for listening to Curious Minds.',
      ],
      questions: [
        q('Which colour of light has the longest waves?', ['Blue', 'Red', 'Violet'], 'Red'),
        q('What is Rayleigh scattering?', ['The way molecules scatter short light waves more strongly', 'A type of cloud', 'The reflection of the sea in the sky'], 'The way molecules scatter short light waves more strongly'),
        q('Why isn\'t the sky violet?', ['There is no violet in sunlight', 'Sunlight has less violet and our eyes prefer blue', 'Violet light is absorbed by the sea'], 'Sunlight has less violet and our eyes prefer blue'),
        q('Why are sunsets red and orange?', ['The sun becomes colder', 'Light travels through more air, and blue is scattered away', 'Clouds reflect the sea'], 'Light travels through more air, and blue is scattered away'),
        q('What is unusual about sunsets on Mars?', ['There are none', 'They can look blue', 'They are always green'], 'They can look blue'),
      ],
    }),
    podcast({
      title: 'Facts 2. The Great Emu War',
      voice: 'en-GB-SoniaNeural',
      paragraphs: [
        'Welcome back to Curious Minds. Today\'s story sounds like a joke, but it really happened. In 1932, the Australian government sent soldiers with machine guns to fight an army of birds. And the birds won.',
        'After the First World War, many former soldiers in Australia were given land in Western Australia to farm wheat. Life was already hard. Wheat prices had fallen sharply during the Great Depression, and the farmers were struggling to make a living.',
        'Then, in 1932, around twenty thousand emus arrived. Emus are large flightless birds, almost two metres tall, and they can run at about fifty kilometres an hour. Every year they move inland after the breeding season, and that year they found the farmers\' fields full of wheat and water. They ate the crops and trampled the fences, which then let rabbits in as well.',
        'The farmers asked the government for help, and the Minister of Defence agreed to send a small military unit led by Major G. P. W. Meredith, armed with two machine guns and ten thousand rounds of ammunition. What could possibly go wrong?',
        'Quite a lot, as it turned out. The emus split into small groups and scattered as soon as the shooting started. The guns jammed. On one occasion the soldiers mounted a machine gun on a truck, but the ground was so rough that the gunner couldn\'t aim, and the emus easily outran it. After several weeks, far fewer birds had been killed than expected, and the newspapers were mocking the whole operation.',
        'The military was withdrawn, sent back for a second attempt, and then withdrawn again. In the end, the problem was dealt with in more practical ways: better fences were built, and farmers were given ammunition to protect their own land. Meredith is said to have remarked that if he had a military division with the bullet-carrying ability of emus, it could face any army in the world.',
        'Today, the so-called Great Emu War is remembered with a smile, but it also reminds us how difficult it is to fight nature with brute force. Thanks for listening.',
      ],
      questions: [
        q('Why were the farmers already struggling before the emus came?', ['There was a long winter', 'Wheat prices had fallen during the Great Depression', 'Their land was flooded'], 'Wheat prices had fallen during the Great Depression'),
        q('About how many emus arrived?', ['Two thousand', 'Twenty thousand', 'Two hundred thousand'], 'Twenty thousand'),
        q('What did the government send?', ['A team of scientists', 'Soldiers with machine guns', 'Hunting dogs'], 'Soldiers with machine guns'),
        q('Why did the truck plan fail?', ['The truck broke down immediately', 'The ground was too rough to aim', 'The emus attacked the truck'], 'The ground was too rough to aim'),
        q('How was the problem finally handled?', ['With better fences and ammunition for farmers', 'By moving the farmers away', 'By catching the emus alive'], 'With better fences and ammunition for farmers'),
      ],
    }),
    podcast({
      title: 'Facts 3. How the Vikings found their way across the ocean',
      voice: 'en-US-BrianMultilingualNeural',
      paragraphs: [
        'Welcome to Curious Minds. Around a thousand years ago, Viking sailors crossed the North Atlantic in open wooden ships. They reached Iceland, Greenland and even North America, long before Columbus. They had no compass, no GPS and no accurate maps. So how did they know where they were going?',
        'The first answer is the sun. During the day, sailors could judge their direction from the position of the sun, and they probably used simple tools to measure its height at midday. This told them roughly how far north or south they were.',
        'At night, they could use the stars, especially the Pole Star, which always appears in the north. The problem is that in the far north, summer nights are very short and bright, so the stars aren\'t always visible.',
        'Then there was nature itself. Experienced sailors read the sea like a book. They watched which way the waves were moving, noticed the colour of the water, and followed birds and whales, which could show that land was near. Old Norse sagas even describe sailors releasing ravens: if a raven flew away and didn\'t return, it had probably spotted land.',
        'One of the most fascinating theories involves the so-called sunstone. Old texts mention a sunstone that could show the position of the sun even when it was hidden by clouds. Some researchers believe this may have been a crystal such as Icelandic spar, which splits light in a special way. Experiments have shown that it\'s possible to find the sun with such a crystal on a cloudy day, but we still don\'t know for certain whether the Vikings really used it.',
        'What we do know is that Viking navigation depended on knowledge passed down from one generation of sailors to the next. It was a mixture of science, observation and a great deal of courage. Thanks for joining us on Curious Minds.',
      ],
      questions: [
        q('Which places did the Vikings reach?', ['Iceland, Greenland and North America', 'Only Norway and Denmark', 'Australia and Africa'], 'Iceland, Greenland and North America'),
        q('Why couldn\'t the Vikings always use the stars?', ['They didn\'t know about stars', 'Summer nights in the far north are short and bright', 'It was always foggy'], 'Summer nights in the far north are short and bright'),
        q('What could a raven that didn\'t return tell sailors?', ['That a storm was coming', 'That land was probably near', 'That they were going south'], 'That land was probably near'),
        q('What is said about the sunstone?', ['It definitely existed and was used everywhere', 'It might have been a crystal, but it\'s not certain', 'It was a kind of compass'], 'It might have been a crystal, but it\'s not certain'),
      ],
    }),
  ],
}
