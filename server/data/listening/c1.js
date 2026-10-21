// Listening · Advanced (C1): longer stories and podcasts with idiomatic
// language, complex sentences, hedging and abstract vocabulary.
import { story, podcast, q } from './helpers.js'

export const C1 = {
  title: 'Listening · Advanced (C1)',
  description: 'Детективные истории и мини-подкасты об интересных фактах для уровня Advanced. Слушайте и читайте одновременно; двойной клик по слову — перевод и добавление в ваш словарь.',
  rate: '+4%',
  lessons: [
    story({
      title: 'Detective 1. The Cartographer\'s Error',
      voice: 'en-GB-RyanNeural',
      paragraphs: [
        'Edmund Hale had spent forty years drawing maps, and in all that time, he liked to boast, he had never once made a mistake. So when the Royal Geographical Archive announced that it had acquired a seventeenth-century map of the Scottish coast, supposedly the work of the legendary cartographer Thomas Ainsley, it was Hale they invited to authenticate it.',
        'The map had been sold to the archive by a charming dealer named Victor Crane, for a sum that made the trustees wince. Crane claimed he had discovered it rolled up inside the wall of a crumbling manor house in Fife, a story that was as romantic as it was impossible to verify.',
        'Hale examined the map for three days. The paper was undeniably old, the ink had faded in all the right places, and the handwriting matched Ainsley\'s surviving letters almost perfectly. The archive\'s director, Dr Imogen Shaw, was beginning to relax. Then, on the fourth morning, Hale asked to see her urgently.',
        '"It\'s a forgery," he said, before she had even closed the door. "An exceptionally good one, but a forgery nonetheless." He unrolled the map and pointed to a tiny island off the northern coast. "Ainsley never saw this island. Nobody did, in fact, because it doesn\'t exist."',
        'Dr Shaw frowned. Surely, she suggested, a seventeenth-century mapmaker might simply have made an error. Hale shook his head. The island, he explained, had a peculiar history. It had first appeared on a map printed in 1872, inserted deliberately by a Victorian publisher as a trap, a so-called "paper town", to catch rivals who copied his work. Anyone who reproduced the island had, by definition, copied that particular map.',
        '"So whoever drew this," Shaw said slowly, "must have been working from a map made two centuries after Ainsley died." Hale nodded. "Our forger did his homework on the paper, the ink and the handwriting. But he trusted a Victorian map for the coastline, and he fell straight into a trap that was set a hundred and fifty years ago."',
        'Victor Crane, when he was questioned, initially denied everything with considerable charm. However, the police found in his flat an extensive collection of nineteenth-century maps, including a copy of the 1872 edition, with the phantom island carefully circled in pencil. His romantic manor house in Fife, it emerged, had been demolished in the 1950s.',
        'The archive got its money back, and the forgery now hangs in a small exhibition about the history of deception. Edmund Hale, for his part, insists that the case proves his point. "Mapmakers," he likes to say, "are the only people who lie on purpose in order to tell the truth."',
      ],
      questions: [
        q('How did Crane say he had found the map?', ['In a library in London', 'Inside the wall of a manor house in Fife', 'At an auction in Edinburgh'], 'Inside the wall of a manor house in Fife'),
        q('What convinced Hale that the map was a forgery?', ['The paper was too new', 'It showed an island that was invented in 1872', 'The handwriting didn\'t match'], 'It showed an island that was invented in 1872'),
        q('What is a "paper town" in this story?', ['A fake place added to catch people who copy a map', 'A town made of paper houses', 'A town that disappeared in a fire'], 'A fake place added to catch people who copy a map'),
        q('What did the police find in Crane\'s flat?', ['The original Ainsley map', 'A copy of the 1872 map with the island circled', 'Letters from Ainsley'], 'A copy of the 1872 map with the island circled'),
        q('What does Hale mean by "lie on purpose in order to tell the truth"?', ['Mapmakers add false details to protect their genuine work', 'Mapmakers never tell the truth', 'All old maps are forgeries'], 'Mapmakers add false details to protect their genuine work'),
      ],
    }),
    story({
      title: 'Detective 2. The Vanishing at Hollow Mere',
      voice: 'en-US-AndrewMultilingualNeural',
      paragraphs: [
        'Every October, the members of the Hollow Mere Writers\' Retreat gathered for a week of silence, long walks and, in theory, productive work. The rules were strict: no phones, no internet and no conversation before dinner. So when the celebrated crime novelist Marguerite Vale failed to appear at the evening meal on the third day, nobody noticed until the soup had gone cold.',
        'Her room was empty. Her bed had not been slept in, her typewriter still held a half-finished page, and her coat hung on the back of the door, despite the fact that it had been pouring with rain all afternoon. Outside, the lake that gave the house its name lay grey and perfectly still.',
        'Detective Inspector Sam Okafor, who arrived the next morning, found himself in the unusual position of interviewing six people whose profession consisted of inventing plausible lies. Each of them had a theory, and each theory was, he noted wryly, considerably better plotted than the facts.',
        'The poet, Felix Grant, suggested that Marguerite had staged her own disappearance as a publicity stunt; her latest novel had received lukewarm reviews. The young memoirist, Ada Lin, was convinced that something sinister had happened by the lake. The retreat\'s organiser, Bernard Holloway, said very little, but kept glancing at the typewriter.',
        'Okafor read the half-finished page. It described, in some detail, a woman leaving a country house at night by the back stairs, crossing a field in the rain and catching the last bus from the village. The final sentence broke off in the middle of a word.',
        'At first, everyone took it to be fiction. But Okafor had spent the morning checking the timetable, and the last bus from the village did indeed leave at 9:52. He also discovered, from the driver, that a woman matching Marguerite\'s description had boarded it on the night in question, soaked to the skin and carrying nothing but a notebook.',
        'Marguerite was found two days later in a guesthouse on the coast, writing furiously. She was mildly embarrassed by the fuss but entirely unrepentant. She had, she explained, been suffering from writer\'s block for a year, and she had decided that the only way to write a convincing escape was to make one. She had left her coat behind because her heroine did.',
        'Bernard Holloway, it turned out, had known all along. Marguerite had asked him to keep her secret for a week, and he had agreed, on the condition that she dedicate the book to him. When the novel was published the following year, it became her first bestseller in a decade. The dedication read simply: "For B., who kept quiet, and for Inspector Okafor, who didn\'t."',
      ],
      questions: [
        q('Why didn\'t anyone notice Marguerite was missing earlier?', ['The rules of the retreat meant people didn\'t talk until dinner', 'She often went to the village', 'She had said she was ill'], 'The rules of the retreat meant people didn\'t talk until dinner'),
        q('What did Okafor find "wry" about interviewing the guests?', ['Their theories were better plotted than the facts', 'They all refused to talk', 'They all had the same story'], 'Their theories were better plotted than the facts'),
        q('What helped Okafor find out what really happened?', ['A phone call from Marguerite', 'The page in her typewriter and the bus timetable', 'Footprints by the lake'], 'The page in her typewriter and the bus timetable'),
        q('Why did Marguerite disappear?', ['She was running away from danger', 'She wanted to experience an escape to overcome writer\'s block', 'She had lost her memory'], 'She wanted to experience an escape to overcome writer\'s block'),
        q('Why did Bernard keep the secret?', ['Marguerite threatened him', 'She promised to dedicate the book to him', 'He didn\'t know anything'], 'She promised to dedicate the book to him'),
      ],
    }),
    podcast({
      title: 'Facts 1. The placebo effect: when nothing works',
      voice: 'en-US-AvaMultilingualNeural',
      paragraphs: [
        'Welcome to Deep Dive, the podcast that takes a closer look at ideas that shape the way we think. Today we\'re exploring one of the most puzzling phenomena in medicine: the placebo effect, the curious fact that treatments with no active ingredient can nonetheless make people feel better.',
        'A placebo is typically a sugar pill or a salt-water injection that looks exactly like a real treatment. In clinical trials, one group of patients receives the actual drug, while another receives the placebo, and crucially, neither the patients nor the doctors know who is getting which. Time and again, a significant proportion of the placebo group report genuine improvements, particularly in symptoms such as pain, nausea and fatigue.',
        'It would be tempting to dismiss this as imagination, but brain-imaging studies suggest that something real is going on. When people expect pain relief, their brains can release the body\'s own natural painkillers. In other words, expectation itself appears to trigger measurable biological changes.',
        'The details are remarkably sensitive to context. In some studies, larger pills have been perceived as more powerful than smaller ones, injections more powerful than tablets, and expensive-looking treatments more effective than cheap ones. Even the warmth and confidence of the doctor seems to make a difference.',
        'Perhaps most surprisingly, the effect doesn\'t always depend on deception. In so-called open-label placebo studies, patients were told plainly that they were taking pills containing no medicine at all, and yet some still reported feeling better. Researchers are still debating why, but one explanation is that the ritual of treatment itself, being cared for and taking something regularly, can be therapeutic.',
        'It\'s worth adding a word of caution. Placebos can ease how we feel, but they don\'t shrink tumours or cure infections. And there is a darker twin, known as the nocebo effect, in which negative expectations make people feel worse, for instance, experiencing side effects they have read about, even when they\'ve been given a dummy pill.',
        'So the next time you feel better the moment you swallow a painkiller, before it could possibly have reached your bloodstream, you might want to give a little credit to your own brain. Thanks for listening to Deep Dive.',
      ],
      questions: [
        q('What is a placebo?', ['A treatment with no active ingredient', 'A very strong painkiller', 'A type of brain scan'], 'A treatment with no active ingredient'),
        q('What do brain-imaging studies suggest?', ['The effect is purely imaginary', 'Expectation can cause real biological changes', 'Placebos damage the brain'], 'Expectation can cause real biological changes'),
        q('What is surprising about open-label placebo studies?', ['Patients knew the pills had no medicine and still felt better', 'The doctors didn\'t know about the study', 'The pills were very expensive'], 'Patients knew the pills had no medicine and still felt better'),
        q('What can placebos NOT do, according to the speaker?', ['Reduce pain', 'Help with nausea', 'Cure infections'], 'Cure infections'),
        q('What is the nocebo effect?', ['Negative expectations making people feel worse', 'A placebo that works twice as fast', 'A medicine without side effects'], 'Negative expectations making people feel worse'),
      ],
    }),
    podcast({
      title: 'Facts 2. Tardigrades: the toughest animals on Earth',
      voice: 'en-GB-LibbyNeural',
      paragraphs: [
        'Hello and welcome to Deep Dive. If you were asked to name the toughest animal on the planet, you might think of a crocodile, a shark or perhaps a cockroach. But the true champion of survival is barely half a millimetre long, and it has been nicknamed the "water bear".',
        'Tardigrades, as they are properly known, are tiny eight-legged creatures that look, under a microscope, a bit like chubby vacuum cleaner bags with claws. They live almost everywhere: in moss and lichen, in soil, in the deep sea and on mountain tops. You may well have some in your garden.',
        'What makes them extraordinary is their ability to survive conditions that would kill almost anything else. When their environment dries out, they curl up, lose nearly all the water in their bodies and enter a state called cryptobiosis, in which their metabolism slows almost to a standstill. In this state they can endure extreme cold, intense heat and doses of radiation that would be lethal to humans.',
        'In 2007, a team of scientists sent dried tardigrades into space on a satellite and exposed them to the vacuum and radiation of open space. When the creatures were brought back and rehydrated, a number of them came back to life, and some even went on to lay eggs that hatched normally.',
        'How do they do it? Part of the secret appears to lie in special proteins. Some form a kind of glass-like gel that protects the cells as they dry out, while another, discovered more recently, seems to shield their DNA from damage. Scientists are investigating whether these proteins could one day help to preserve vaccines or other medicines without refrigeration.',
        'It\'s important not to exaggerate, though. Tardigrades are not indestructible, and in their active state they are actually quite fragile. Their superpower is not strength but the ability to wait, sometimes for years, until conditions improve. Which, if you think about it, is not a bad survival strategy for the rest of us either. Thanks for listening to Deep Dive.',
      ],
      questions: [
        q('What is the nickname for tardigrades?', ['Water bears', 'Moss dogs', 'Sea mice'], 'Water bears'),
        q('What happens in cryptobiosis?', ['The animal grows much bigger', 'The animal loses water and its metabolism almost stops', 'The animal lays thousands of eggs'], 'The animal loses water and its metabolism almost stops'),
        q('What happened to tardigrades sent into space in 2007?', ['All of them died', 'Some came back to life and laid eggs', 'They grew larger'], 'Some came back to life and laid eggs'),
        q('How might tardigrade proteins be useful to people?', ['To build stronger houses', 'To preserve vaccines without refrigeration', 'To make food taste better'], 'To preserve vaccines without refrigeration'),
        q('What is the speaker\'s final point?', ['Tardigrades are indestructible', 'Their real strength is the ability to wait for better conditions', 'They are dangerous to humans'], 'Their real strength is the ability to wait for better conditions'),
      ],
    }),
    podcast({
      title: 'Facts 3. The Voynich manuscript: a book nobody can read',
      voice: 'en-US-BrianMultilingualNeural',
      paragraphs: [
        'Welcome to Deep Dive. Deep in a library at Yale University, there is a small book of around two hundred and forty pages that has defeated some of the finest minds of the last century. It is written in an unknown script, in a language nobody has been able to identify, and it is illustrated with plants that don\'t seem to exist. It\'s called the Voynich manuscript.',
        'The book takes its name from Wilfrid Voynich, a Polish-born book dealer who bought it in 1912. Radiocarbon dating of its vellum pages has shown that they were made in the early fifteenth century, which rules out the theory that Voynich himself forged it.',
        'The pages are divided into sections that appear to deal with herbs, astronomy and, rather mysteriously, groups of women bathing in pools connected by strange tubes. There are also pages that look like recipes or instructions, each paragraph marked with a small star.',
        'Over the years, the manuscript has attracted professional codebreakers, including some who had worked on breaking enemy codes during the Second World War. None of them succeeded. Statistical analysis has shown that the text has some of the patterns of natural language: certain words repeat in predictable ways, and the frequency of words resembles that of real languages. Yet it also has oddities, such as the same word appearing two or three times in a row.',
        'Theories abound. Some researchers believe it is a cipher hiding a known language. Others argue that it is a real but lost language written in an invented alphabet. A third camp suspects that it is an elaborate hoax created in the fifteenth century, perhaps to impress a wealthy buyer, and that it contains no meaning at all. Every few years, someone announces that they have finally cracked it, and so far, every one of these claims has failed to convince other experts.',
        'Perhaps that is the manuscript\'s real fascination. In an age when almost any question can be answered in seconds, here is an object that stubbornly refuses to give up its secrets. The full manuscript has been scanned and made available online, so if you fancy your chances, you are welcome to try. Thanks for listening to Deep Dive.',
      ],
      questions: [
        q('Where is the Voynich manuscript kept today?', ['In the British Museum', 'In a library at Yale University', 'In a private collection in Poland'], 'In a library at Yale University'),
        q('What did radiocarbon dating show?', ['The pages were made in the early fifteenth century', 'Voynich made it in 1912', 'It is about two thousand years old'], 'The pages were made in the early fifteenth century'),
        q('What does statistical analysis suggest about the text?', ['It is completely random', 'It has some patterns of natural language', 'It is written in Latin'], 'It has some patterns of natural language'),
        q('Which is NOT one of the theories mentioned?', ['It is a cipher hiding a known language', 'It is a lost language with an invented alphabet', 'It was written by aliens'], 'It was written by aliens'),
        q('How can people try to decode it today?', ['By visiting Yale only', 'By looking at the scans available online', 'By buying a copy from Voynich\'s family'], 'By looking at the scans available online'),
      ],
    }),
  ],
}
