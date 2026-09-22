#!/usr/bin/env node

/**
 * Cleans up the IELTS course: removes every block that references Edvibe
 * (placeholder notes pointing at copyrighted material that wasn't
 * transferred), deletes lesson 37 ("Additional Resources Library" — a pure
 * bibliography of third-party commercial books, no original material), and
 * replaces the emptied practice lessons with original, generated practice
 * content (reading passages + questions, listening scripts read aloud via
 * the browser's own speech synthesis, and a Writing Task 1 chart-description
 * bank).
 *
 * Usage: node scripts/generate-practice-content.js <schoolId>
 */

import { prisma } from '../src/db.js'

// --- Reading & listening practice content, one entry per lesson position ---

const LESSON_CONTENT = {
  7: {
    blocks: [
      {
        type: 'tts',
        payload: {
          title: 'Listening script — Section 1: Booking a hotel room',
          script: `Receptionist: Good afternoon, Lakeview Hotel, how can I help you?
Caller: Hi, I'd like to book a room for a weekend in November, please.
Receptionist: Of course. Could I take your name first?
Caller: Yes, it's Daniel Petrov. That's P, E, T, R, O, V.
Receptionist: Thank you. And what dates are you looking at?
Caller: Friday the fourteenth to Sunday the sixteenth. So two nights.
Receptionist: Let me check... yes, we have a double room available. That's ninety-five pounds a night, breakfast included.
Caller: Great. Does the room have a view of the lake?
Receptionist: The standard double faces the car park, but for an extra fifteen pounds a night you can upgrade to a lake view.
Caller: I'll take the upgrade, thanks.
Receptionist: No problem. Can I have a contact number?
Caller: Sure, it's oh-seven-nine-two-two, four-four-one, one-oh-five.
Receptionist: And will you need parking?
Caller: Yes, please, if that's free.
Receptionist: It is, for guests. I'll also need a deposit of twenty pounds to confirm — you can pay that by card when you arrive.
Caller: That's fine. One more thing — is there a gym at the hotel?
Receptionist: There is, on the second floor, open from six a.m. to ten p.m.
Caller: Perfect, thank you.`
        }
      }
    ],
    exercises: [
      { type: 'FILL_BLANK', question: 'Guest surname: ____', payload: { answer: 'Petrov', alternatives: ['petrov'] } },
      { type: 'FILL_BLANK', question: 'Number of nights: ____', payload: { answer: '2', alternatives: ['two'] } },
      { type: 'FILL_BLANK', question: 'Standard double room price per night: £____', payload: { answer: '95', alternatives: ['£95', 'ninety-five'] } },
      { type: 'FILL_BLANK', question: 'Lake view upgrade costs an extra £____ per night', payload: { answer: '15', alternatives: ['£15', 'fifteen'] } },
      { type: 'FILL_BLANK', question: 'Deposit required to confirm the booking: £____', payload: { answer: '20', alternatives: ['£20', 'twenty'] } },
      { type: 'FILL_BLANK', question: 'The gym is open from 6 a.m. until ____', payload: { answer: '10 p.m.', alternatives: ['10pm', 'ten p.m.', '22:00'] } }
    ]
  },
  8: {
    blocks: [
      {
        type: 'tts',
        payload: {
          title: 'Listening script — Section 3: Choosing a research topic',
          script: `Tutor: So, Maria, you wanted to talk about your dissertation topic?
Maria: Yes — I'm torn between two ideas. The first is about how remote work has changed team communication, and the second is about the effect of social media on local news.
Tutor: Both are workable. What draws you to the first one?
Maria: I did a placement at a software company last year and noticed how much communication moved from meetings to written messages. I think there's a lot to say about what gets lost.
Tutor: That's a strong personal angle. What about access to data — would the company let you use their records?
Maria: I'd have to ask, but I think so, since I still have contacts there.
Tutor: And the second topic?
Maria: That one's more about journalism generally — how small local newspapers are struggling because readers get news from social media instead.
Tutor: That's a bigger topic, and the data might be harder to get hold of unless you focus on one specific region.
Maria: True. I suppose the first topic is more manageable in the time I have.
Tutor: I'd agree. I'd suggest narrowing it further, though — perhaps just how communication changed for one team, rather than the whole company.
Maria: That makes sense. I'll draft a proposal along those lines and send it to you by Friday.
Tutor: Sounds good. Also, before you start, have a look at the study by Chen and Osei from twenty twenty-one — it's very close to what you're planning and will help you shape your questions.`
        }
      }
    ],
    exercises: [
      { type: 'MULTIPLE_CHOICE', question: 'Why is Maria interested in the remote-work topic?', payload: { options: ['She read about it in a newspaper', 'She noticed it during a work placement', 'Her tutor suggested it', 'She interviewed local journalists'], correctAnswer: 'She noticed it during a work placement' } },
      { type: 'MULTIPLE_CHOICE', question: 'What does the tutor say about the local-news topic?', payload: { options: ['It is too personal', 'The data may be hard to access unless narrowed', 'Nobody has researched it before', 'It requires travel abroad'], correctAnswer: 'The data may be hard to access unless narrowed' } },
      { type: 'MULTIPLE_CHOICE', question: 'What does the tutor recommend Maria do with her chosen topic?', payload: { options: ['Compare it with the second topic in her essay', 'Interview journalists instead', 'Narrow it to one team rather than the whole company', 'Postpone the dissertation by a year'], correctAnswer: 'Narrow it to one team rather than the whole company' } },
      { type: 'MULTIPLE_CHOICE', question: 'When does Maria need to send her proposal?', payload: { options: ['By Friday', 'By Monday', 'Next semester', 'After her placement ends'], correctAnswer: 'By Friday' } },
      { type: 'FILL_BLANK', question: 'The tutor recommends reading a study by Chen and ____.', payload: { answer: 'Osei', alternatives: ['osei'] } }
    ]
  },
  9: {
    blocks: [
      {
        type: 'tts',
        payload: {
          title: 'Listening script — Spelling names and addresses',
          script: `Assistant: Can I take your details for the newsletter?
Customer: Sure. My first name's Siobhan — that's S, I, O, B, H, A, N.
Assistant: Got it. And your surname?
Customer: McAllister. M, C, A, double L, I, S, T, E, R.
Assistant: And your email address?
Customer: It's siobhan dot m, at outlook dot com.
Assistant: Thank you. And a postcode for our records?
Customer: It's E, C, one, V, nine, B, T.`
        }
      },
      {
        type: 'tts',
        payload: {
          title: 'Listening script — Giving directions',
          script: `Visitor: Excuse me, how do I get to the library from here?
Local: Sure — go straight ahead until you reach the traffic lights, then turn left onto Mill Road.
Visitor: Turn left at the lights, okay.
Local: Keep going past the supermarket on your right, and the library is the second building on the left, just opposite the park.
Visitor: So it's opposite the park, got it. Thank you!`
        }
      }
    ],
    exercises: [
      { type: 'FILL_BLANK', question: 'First name (spelled out in the recording): ____', payload: { answer: 'Siobhan', alternatives: ['siobhan'] } },
      { type: 'FILL_BLANK', question: 'Surname (spelled out in the recording): ____', payload: { answer: 'McAllister', alternatives: ['mcallister'] } },
      { type: 'FILL_BLANK', question: 'Postcode: ____', payload: { answer: 'EC1V 9BT', alternatives: ['ec1v9bt', 'ec1v 9bt'] } },
      { type: 'MULTIPLE_CHOICE', question: 'Where should the visitor turn left?', payload: { options: ['At the supermarket', 'At the traffic lights', 'At the park', 'At the library'], correctAnswer: 'At the traffic lights' } },
      { type: 'MULTIPLE_CHOICE', question: 'Where exactly is the library?', payload: { options: ['Opposite the supermarket', 'Next to the traffic lights', 'Opposite the park', 'Behind the park'], correctAnswer: 'Opposite the park' } }
    ]
  },
  12: {
    blocks: [
      {
        type: 'text',
        payload: {
          title: 'Reading passage — Urban Beekeeping',
          content: `Over the past two decades, beekeeping has moved from rural farms onto the rooftops of major cities. London, New York and Paris all now host thousands of hives, kept not by professional farmers but by hobbyists, restaurants and even hotels. Proponents argue that urban bees benefit from a longer flowering season, since city parks and gardens are planted with a wider variety of species than the single-crop fields common in the countryside, and are rarely treated with the pesticides used in industrial agriculture.

Critics, however, warn that the trend has grown faster than the available food supply. A single hive can contain fifty thousand bees, and in areas where beekeeping has become fashionable, several hives are often kept within a few streets of one another, forcing colonies to compete for the same limited flowers. Some ecologists argue that this competition is now harming wild bee species and other pollinating insects, which cannot travel as far as honeybees to find food.

City authorities have responded in different ways. Some, including Paris, have capped the number of hives permitted per building, while others provide free training on sustainable practices such as leaving nectar-producing plants unmown. Researchers generally agree that the solution lies not in banning urban beekeeping but in ensuring cities plant enough flowering trees and wildflower meadows to support the insects already living there.`
        }
      }
    ],
    exercises: [
      { type: 'TRUE_FALSE_NG', question: 'Urban beekeeping is mostly practised by professional farmers.', payload: { options: ['True', 'False', 'Not Given'], correctAnswer: 'False' } },
      { type: 'TRUE_FALSE_NG', question: 'City parks tend to have a wider variety of flowering plants than single-crop farmland.', payload: { options: ['True', 'False', 'Not Given'], correctAnswer: 'True' } },
      { type: 'TRUE_FALSE_NG', question: 'Every city has now introduced a limit on the number of hives allowed.', payload: { options: ['True', 'False', 'Not Given'], correctAnswer: 'False' } },
      { type: 'TRUE_FALSE_NG', question: 'Wild pollinators can travel just as far as honeybees to find food.', payload: { options: ['True', 'False', 'Not Given'], correctAnswer: 'False' } },
      { type: 'TRUE_FALSE_NG', question: 'Researchers believe urban beekeeping should be banned entirely.', payload: { options: ['True', 'False', 'Not Given'], correctAnswer: 'False' } }
    ]
  },
  15: {
    blocks: [
      {
        type: 'text',
        payload: {
          title: 'Reading passage — Sleep and Memory',
          content: `Scientists have long known that sleep plays a role in learning, but recent research has clarified exactly how. During deep sleep, the brain appears to replay the neural activity recorded while a task was being learned, effectively rehearsing it without conscious effort. This process, known as memory consolidation, transfers information from the hippocampus, a region used for short-term storage, into the cortex, where long-term memories are held.

A study at a Swiss university asked two groups of volunteers to learn a sequence of hand movements. One group slept for eight hours before being tested again, while the other stayed awake for the same period. The group that slept performed the sequence with noticeably fewer errors, even though neither group practised the movements again before the test. Brain scans showed increased activity in the regions associated with the original learning task during the sleeping group's deep sleep phases.

Interestingly, the benefit was not evenly distributed across all types of memory. Consolidation of physical skills, such as the hand-movement sequence, was strongest during deep, slow-wave sleep, while memory for facts and vocabulary benefited more from the lighter stages of sleep that occur later in the night. This has led some researchers to suggest that students preparing for exams that test factual recall may gain more from a full night's sleep than from an equivalent amount of daytime revision.`
        }
      }
    ],
    exercises: [
      { type: 'MULTIPLE_CHOICE', question: 'What is memory consolidation, according to the passage?', payload: { options: ['Forgetting information that is no longer needed', 'Transferring information from short-term to long-term storage during sleep', 'Learning a new skill for the first time', 'Testing memory immediately after learning'], correctAnswer: 'Transferring information from short-term to long-term storage during sleep' } },
      { type: 'MULTIPLE_CHOICE', question: 'In the Swiss study, what did the group who slept do differently from the group who stayed awake?', payload: { options: ['They practised the movements again before the test', 'They performed the sequence with fewer errors', 'They learned a different sequence', 'They were tested twice as often'], correctAnswer: 'They performed the sequence with fewer errors' } },
      { type: 'MULTIPLE_CHOICE', question: 'Which stage of sleep most benefits memory for physical skills?', payload: { options: ['Deep, slow-wave sleep', 'Light sleep later in the night', 'The first ten minutes of sleep', 'Daytime naps'], correctAnswer: 'Deep, slow-wave sleep' } },
      { type: 'MULTIPLE_CHOICE', question: 'What do some researchers suggest for students revising facts and vocabulary?', payload: { options: ['Avoid sleep the night before an exam', 'A full night of sleep may help more than extra daytime revision', 'Only physical skills benefit from sleep', 'Memory consolidation does not apply to vocabulary'], correctAnswer: 'A full night of sleep may help more than extra daytime revision' } },
      { type: 'MULTIPLE_CHOICE', question: 'Where does the passage say long-term memories are eventually held?', payload: { options: ['The hippocampus', 'The cortex', 'The brainstem', 'Short-term storage only'], correctAnswer: 'The cortex' } }
    ]
  },
  16: {
    blocks: [
      {
        type: 'text',
        payload: {
          title: 'Reading passage — Staff Notice: Office Relocation',
          content: `To all staff,

As previously announced, our office will relocate to the new building on Harbour Street from the 3rd of next month. Please note the following arrangements.

Packing: Personal items should be packed into the labelled boxes provided by the facilities team by Friday the 28th. Boxes will be collected over the weekend and delivered to your new desk before Monday morning. Please do not pack computer equipment — IT will handle this separately.

IT equipment: The IT team will disconnect and move all desktop computers, monitors and printers on Thursday and Friday. Staff who need to work remotely during this period should contact IT by Wednesday to arrange a laptop loan.

Parking: The new building has a smaller car park than our current site, so staff are encouraged to use the staff shuttle bus, which will run every twenty minutes between the old and new buildings during the first two weeks.

Post and deliveries: Please update any suppliers or clients with the new address as soon as possible. Post sent to the old address after the 10th will not be forwarded automatically.

If you have any questions, contact the facilities team on extension 204.`
        }
      }
    ],
    exercises: [
      { type: 'FILL_BLANK', question: 'Personal items should be packed by Friday the ____.', payload: { answer: '28th', alternatives: ['28', 'twenty-eighth'] } },
      { type: 'FILL_BLANK', question: 'Staff needing to work remotely should contact IT by ____.', payload: { answer: 'Wednesday', alternatives: ['wednesday'] } },
      { type: 'FILL_BLANK', question: 'The staff shuttle bus runs every ____ minutes.', payload: { answer: '20', alternatives: ['twenty'] } },
      { type: 'FILL_BLANK', question: 'Post sent to the old address will not be forwarded after the ____.', payload: { answer: '10th', alternatives: ['10', 'tenth'] } },
      { type: 'FILL_BLANK', question: 'Questions should be directed to extension ____.', payload: { answer: '204', alternatives: [] } }
    ]
  },
  17: {
    blocks: [
      {
        type: 'text',
        payload: {
          title: 'Reading passage — Coral Reef Restoration',
          content: `Coral reefs cover less than one percent of the ocean floor but support around a quarter of all marine species, making their recent decline a serious concern for marine biologists. Rising sea temperatures cause corals to expel the algae living in their tissue, a process known as bleaching, which leaves the coral white and vulnerable to disease. In severe cases, entire reefs can die within a few years.

In response, scientists have developed several restoration techniques. The most widely used is coral gardening, in which small fragments of healthy coral are grown on underwater frames until they are large enough to be transplanted onto a damaged reef. This method has been used successfully in the Caribbean and parts of Southeast Asia, though it remains labour-intensive and expensive to scale up.

A newer approach, selective breeding, focuses on identifying coral colonies that have naturally survived bleaching events and are therefore more heat-tolerant. By breeding these resilient corals together, researchers hope to create populations better suited to warmer future oceans. Early trials in Australia's Great Barrier Reef have shown promising results, although scientists caution that breeding alone cannot outpace the rate at which ocean temperatures are rising, and must be combined with broader efforts to reduce global carbon emissions.`
        }
      }
    ],
    exercises: [
      {
        type: 'FILL_BLANK',
        question: 'Complete the summary. Word bank: bleaching, gardening, breeding, emissions, temperatures.\n\nRising ocean ____(1)____ cause corals to expel algae in a process called ____(2)____. One restoration method, coral ____(3)____, grows fragments on frames before transplanting them. A newer method, selective ____(4)____, breeds heat-tolerant corals, but must be combined with reducing carbon ____(5)____.\n\nAnswer for gap (1):',
        payload: { answer: 'temperatures', alternatives: ['temperature'] }
      },
      { type: 'FILL_BLANK', question: 'Gap (2):', payload: { answer: 'bleaching', alternatives: [] } },
      { type: 'FILL_BLANK', question: 'Gap (3):', payload: { answer: 'gardening', alternatives: [] } },
      { type: 'FILL_BLANK', question: 'Gap (4):', payload: { answer: 'breeding', alternatives: [] } },
      { type: 'FILL_BLANK', question: 'Gap (5):', payload: { answer: 'emissions', alternatives: [] } }
    ]
  },
  18: {
    blocks: [
      {
        type: 'text',
        payload: {
          title: 'Reading passage — Three reviews of a co-working space',
          content: `A. I've used the Riverside Hub for about six months now, and the main draw for me is the location — five minutes from the train station, with a decent coffee shop downstairs. The desks are comfortable and the wifi has never dropped once. My only complaint is that meeting rooms need to be booked at least two days in advance, which doesn't suit last-minute client calls.

B. What sold me on this place was the community, not the facilities. There's a Slack channel where members share job leads and even recommend freelancers to each other. I've made three genuine business contacts here that turned into paid work. The desks themselves are fairly basic, and the printer is often out of order, but for the networking alone it's worth the monthly fee.

C. I switched here after my previous co-working space closed down, and I have mixed feelings. The 24-hour access is fantastic for those of us who work late, and the phone booths for private calls are a nice touch most places don't offer. However, it does get quite noisy in the afternoons, and I've had to use noise-cancelling headphones most days just to concentrate.`
        }
      }
    ],
    exercises: [
      { type: 'MULTIPLE_CHOICE', question: 'Match paragraph A to its best heading.', payload: { options: ['Convenient but hard to book last-minute', 'A place to concentrate', 'Best for making contacts', 'Open around the clock'], correctAnswer: 'Convenient but hard to book last-minute' } },
      { type: 'MULTIPLE_CHOICE', question: 'Match paragraph B to its best heading.', payload: { options: ['Convenient but hard to book last-minute', 'Basic facilities, valuable networking', 'Open around the clock', 'A quiet place to work'], correctAnswer: 'Basic facilities, valuable networking' } },
      { type: 'MULTIPLE_CHOICE', question: 'Match paragraph C to its best heading.', payload: { options: ['Best for making contacts', 'Flexible hours, but noisy', 'Cheapest option in town', 'Convenient but hard to book last-minute'], correctAnswer: 'Flexible hours, but noisy' } }
    ]
  },
  19: {
    blocks: [
      {
        type: 'text',
        payload: {
          title: 'Reading passage — Electric Vehicles and the Power Grid',
          content: `As electric vehicles become more common, questions have arisen about whether national power grids can handle the additional demand. A single electric car charging overnight uses roughly as much electricity as an average household consumes in a day, and forecasts suggest that by 2035 electric vehicles could account for a third of all cars on the road in some countries.

Grid operators point out that most charging currently happens at times of low overall demand, such as overnight, which helps balance the load rather than adding pressure at peak hours. However, this pattern may not hold as adoption grows and more people begin charging during the day, particularly at workplaces. Some utility companies have introduced variable pricing, charging less for electricity used at night to encourage drivers to keep charging outside peak hours.

A more forward-looking solution being tested in several countries is vehicle-to-grid technology, which allows an electric car's battery to send power back into the grid during periods of high demand, then recharge later when demand falls. Early trials have shown this can reduce strain on local networks, though widespread adoption depends on further advances in battery technology and on convincing drivers that frequent charging and discharging will not significantly shorten their battery's lifespan.`
        }
      }
    ],
    exercises: [
      { type: 'TRUE_FALSE_NG', question: 'An electric car charging overnight typically uses about as much electricity as an average household uses in a day.', payload: { options: ['True', 'False', 'Not Given'], correctAnswer: 'True' } },
      { type: 'TRUE_FALSE_NG', question: 'By 2035, electric vehicles will make up a third of all cars in every country.', payload: { options: ['True', 'False', 'Not Given'], correctAnswer: 'False' } },
      { type: 'TRUE_FALSE_NG', question: 'Most charging currently happens during hours of low overall demand.', payload: { options: ['True', 'False', 'Not Given'], correctAnswer: 'True' } },
      { type: 'TRUE_FALSE_NG', question: 'All utility companies now offer the same variable pricing scheme.', payload: { options: ['True', 'False', 'Not Given'], correctAnswer: 'False' } },
      { type: 'TRUE_FALSE_NG', question: 'Vehicle-to-grid technology allows a car battery to send electricity back to the grid.', payload: { options: ['True', 'False', 'Not Given'], correctAnswer: 'True' } },
      { type: 'TRUE_FALSE_NG', question: 'Scientists have already proven that vehicle-to-grid charging has no effect on battery lifespan.', payload: { options: ['True', 'False', 'Not Given'], correctAnswer: 'False' } }
    ]
  },
  20: {
    blocks: [
      {
        type: 'text',
        payload: {
          title: 'Reading passage — The Printing Press',
          content: `A. Before the mid-fifteenth century, books in Europe were copied by hand, a slow process usually carried out by monks in monasteries. A single Bible could take a scribe over a year to complete, which meant books were rare and expensive, owned mainly by churches, universities and the very wealthy. Literacy itself was uncommon, partly because there was so little for most people to read.

B. This changed with Johannes Gutenberg's development of the movable-type printing press around 1440. Unlike earlier printing methods used in East Asia, which typically carved a whole page onto a single block, Gutenberg's system used individual metal letters that could be rearranged and reused for different pages. This made it far faster to set up a new page of text and dramatically reduced the cost of producing each copy.

C. Within fifty years of Gutenberg's invention, printing presses had spread to over two hundred cities across Europe, and millions of books had been printed — more than had been produced by hand copying in the previous thousand years combined. Scholars argue that this rapid spread of printed material helped accelerate the Renaissance and, later, the Reformation, as ideas could travel between countries far more quickly than before.

D. The press also changed language itself. As printers standardised spelling and grammar to make texts easier to produce at scale, regional dialects that had once varied enormously from town to town began to give way to more uniform national languages, a process that in some countries took centuries to complete.`
        }
      }
    ],
    exercises: [
      { type: 'MULTIPLE_CHOICE', question: 'Which heading best fits paragraph A?', payload: { options: ['Books before printing', 'Gutenberg\'s invention', 'The spread of the press across Europe', 'Standardising language'], correctAnswer: 'Books before printing' } },
      { type: 'MULTIPLE_CHOICE', question: 'Which heading best fits paragraph B?', payload: { options: ['Books before printing', 'A new kind of printing technology', 'The Renaissance begins', 'The decline of monasteries'], correctAnswer: 'A new kind of printing technology' } },
      { type: 'MULTIPLE_CHOICE', question: 'Which heading best fits paragraph C?', payload: { options: ['A new kind of printing technology', 'Rapid growth and its effect on ideas', 'The cost of hand-copied books', 'East Asian printing methods'], correctAnswer: 'Rapid growth and its effect on ideas' } },
      { type: 'MULTIPLE_CHOICE', question: 'Which heading best fits paragraph D?', payload: { options: ['The spread of the press across Europe', 'The effect of printing on language', 'The role of monks', 'The cost of paper'], correctAnswer: 'The effect of printing on language' } }
    ]
  },
  21: {
    blocks: [
      {
        type: 'text',
        payload: {
          title: 'Reading passage — Riverside Gym: Membership Information',
          content: `Thank you for your interest in Riverside Gym. We offer three membership tiers to suit different needs.

Basic (£25/month): Access to the main gym floor and cardio equipment, Monday to Friday, 6 a.m. to 10 p.m. Does not include weekend access or group classes.

Standard (£40/month): All Basic benefits, plus weekend access and up to four group classes per month, including yoga, spinning and circuit training. A one-off joining fee of £15 applies to this tier only.

Premium (£60/month): Unlimited group classes, full seven-day access including public holidays, and one free personal training session each month. Premium members may also bring a guest free of charge twice a month.

All memberships require thirty days' written notice to cancel. Members who joined before January this year are entitled to a ten percent discount on any upgrade. New members receive a free induction session with a trainer, which must be booked within two weeks of joining.`
        }
      }
    ],
    exercises: [
      { type: 'TRUE_FALSE_NG', question: 'The Basic membership includes weekend access.', payload: { options: ['True', 'False', 'Not Given'], correctAnswer: 'False' } },
      { type: 'TRUE_FALSE_NG', question: 'A joining fee applies only to the Standard membership.', payload: { options: ['True', 'False', 'Not Given'], correctAnswer: 'True' } },
      { type: 'TRUE_FALSE_NG', question: 'Premium members can bring a guest for free twice a month.', payload: { options: ['True', 'False', 'Not Given'], correctAnswer: 'True' } },
      { type: 'TRUE_FALSE_NG', question: 'Cancelling a membership requires sixty days’ written notice.', payload: { options: ['True', 'False', 'Not Given'], correctAnswer: 'False' } },
      { type: 'TRUE_FALSE_NG', question: 'The free induction session must be booked within two weeks of joining.', payload: { options: ['True', 'False', 'Not Given'], correctAnswer: 'True' } }
    ]
  },
  30: {
    blocks: [
      {
        type: 'text',
        payload: {
          title: 'Writing Task 1 (Academic) — Practice prompt 1: Bar chart',
          content: `The bar chart below shows the percentage of households with internet access in four countries (Brazil, India, Norway, South Korea) in 2005 and 2023.

Country — 2005 — 2023
Brazil — 14% — 81%
India — 3% — 52%
Norway — 62% — 99%
South Korea — 71% — 98%

Summarise the information by selecting and reporting the main features, and make comparisons where relevant. Write at least 150 words.`
        }
      },
      {
        type: 'text',
        payload: {
          title: 'Writing Task 1 (Academic) — Practice prompt 2: Line graph',
          content: `The line graph below shows average monthly electricity consumption (in kWh) for a household in three different months over five years.

Year — January — July — October
2019 — 420 — 260 — 310
2020 — 440 — 250 — 320
2021 — 460 — 275 — 330
2022 — 510 — 300 — 355
2023 — 560 — 320 — 380

Summarise the information by selecting and reporting the main features, and make comparisons where relevant. Write at least 150 words.`
        }
      },
      {
        type: 'text',
        payload: {
          title: 'Writing Task 1 (Academic) — Practice prompt 3: Pie charts',
          content: `The pie charts below show the breakdown of a university's operating budget in 2010 and 2023.

2010: Staff salaries 45%, Facilities 20%, Research 15%, Student services 12%, Other 8%
2023: Staff salaries 38%, Facilities 18%, Research 24%, Student services 14%, Other 6%

Summarise the information by selecting and reporting the main features, and make comparisons where relevant. Write at least 150 words.`
        }
      },
      {
        type: 'text',
        payload: {
          title: 'Writing Task 1 (Academic) — Practice prompt 4: Process diagram',
          content: `The diagram below shows the stages involved in recycling a plastic bottle.

Stage 1: Collection — used bottles are collected from household recycling bins and public bins.
Stage 2: Sorting — bottles are sorted by plastic type and colour at a recycling facility.
Stage 3: Cleaning — labels are removed and bottles are washed to remove residue.
Stage 4: Shredding — clean bottles are shredded into small plastic flakes.
Stage 5: Melting — flakes are melted and formed into pellets.
Stage 6: Manufacturing — pellets are sold to manufacturers to make new plastic products.

Summarise the information by describing the main stages of the process. Write at least 150 words.`
        }
      }
    ],
    exercises: []
  }
}

// Lesson 4 keeps its real audio; only the Edvibe note is removed (handled by
// the generic sweep below, no replacement content needed).

async function run() {
  const [, , schoolId] = process.argv
  if (!schoolId) {
    console.error('Usage: node scripts/generate-practice-content.js <schoolId>')
    process.exit(1)
  }

  const skillset = await prisma.skillset.findFirst({ where: { schoolId, name: 'IELTS' } })
  if (!skillset) throw new Error('No IELTS skillset found for this school')
  const course = await prisma.course.findFirst({ where: { skillsetId: skillset.id } })
  if (!course) throw new Error('No course found in the IELTS skillset')
  console.log(`Course: ${course.title} (${course.id})`)

  // 1. Delete every block that mentions Edvibe.
  const edvibeBlocks = await prisma.courseLessonBlock.findMany({
    where: { lesson: { courseId: course.id }, payload: { path: ['content'], string_contains: 'Edvibe' } }
  })
  for (const block of edvibeBlocks) {
    await prisma.courseLessonBlock.delete({ where: { id: block.id } })
  }
  console.log(`Deleted ${edvibeBlocks.length} Edvibe-referencing blocks`)

  // 2. Delete lesson 37 entirely (pure third-party book bibliography).
  const lesson37 = await prisma.courseLesson.findUnique({ where: { courseId_position: { courseId: course.id, position: 37 } } })
  if (lesson37) {
    await prisma.courseLesson.delete({ where: { id: lesson37.id } })
    console.log('Deleted lesson 37 (Additional Resources Library)')
  }

  // 3. Insert generated content into the targeted lessons.
  for (const [positionStr, content] of Object.entries(LESSON_CONTENT)) {
    const position = Number(positionStr)
    const lesson = await prisma.courseLesson.findUnique({ where: { courseId_position: { courseId: course.id, position } } })
    if (!lesson) { console.warn(`Lesson ${position} not found, skipping`); continue }

    const existingBlocks = await prisma.courseLessonBlock.count({ where: { lessonId: lesson.id } })
    if (content.blocks.length) {
      await prisma.courseLessonBlock.createMany({
        data: content.blocks.map((b, i) => ({ lessonId: lesson.id, position: existingBlocks + i, type: b.type, payload: b.payload }))
      })
    }
    if (content.exercises.length) {
      await prisma.courseExercise.createMany({
        data: content.exercises.map((e, i) => ({ lessonId: lesson.id, position: i, type: e.type, question: e.question, payload: e.payload }))
      })
    }
    console.log(`Lesson ${position}: +${content.blocks.length} blocks, +${content.exercises.length} exercises`)
  }

  console.log('\nDone.')
}

run().catch((err) => { console.error(err); process.exit(1) }).finally(() => prisma.$disconnect())
