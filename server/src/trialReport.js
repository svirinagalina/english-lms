import { z } from 'zod'
import { prisma } from './db.js'
import { assistantEnabled } from './assistant.js'
import { TEST_ITEMS, LEVELS, estimateLevel } from './placementTest.js'
import { topicLabel } from './errorAnalysis.js'

// Builds the student's level report from the marked placement test, the
// teacher's assessment and comments, the mistake notebook and practice
// stats. With the AI key the prose is written by Claude; without it, from
// templates. The report is in Russian — it goes to the student.

const LEVEL_TEXT = {
  A1: { name: 'Beginner / Elementary', can: 'строить простые фразы в настоящем и прошедшем времени, рассказать о себе и о повседневных делах' },
  A2: { name: 'Pre-Intermediate', can: 'уверенно пользоваться основными временами, говорить о планах, опыте и обязанностях, задавать вопросы' },
  B1: { name: 'Intermediate', can: 'связно рассказывать о событиях в разных временах, использовать условные предложения, герундий и фразовые глаголы' },
  B2: { name: 'Upper-Intermediate', can: 'свободно выражать мысли, используя сложные времена, модальные конструкции в прошедшем и условные предложения третьего типа' }
}

const AiSchema = z.object({
  summary: z.string(),
  strengths: z.array(z.string()).max(5),
  focus: z.array(z.object({ topic: z.string(), why: z.string(), example: z.string() })).max(6),
  recommendations: z.array(z.string()).max(6),
  plan: z.array(z.string()).max(6)
})

function gather(report, answers) {
  const wrong = TEST_ITEMS.filter((i) => answers[i.n] === 'no')
  const partly = TEST_ITEMS.filter((i) => answers[i.n] === 'partly')
  const right = TEST_ITEMS.filter((i) => answers[i.n] === 'ok')
  // Topics needing attention, weighted: wrong counts twice, partly once.
  const weight = new Map()
  const example = new Map()
  for (const i of wrong) { weight.set(i.topic, (weight.get(i.topic) ?? 0) + 2); example.set(i.topic, i) }
  for (const i of partly) { weight.set(i.topic, (weight.get(i.topic) ?? 0) + 1); if (!example.has(i.topic)) example.set(i.topic, i) }
  const focus = [...weight.entries()].sort((a, b) => b[1] - a[1]).map(([topic]) => ({ topic, item: example.get(topic) }))
  return { wrong, partly, right, focus }
}

async function unitTitles(schoolId, positions) {
  if (!positions.length) return []
  const units = await prisma.unit.findMany({ where: { schoolId, position: { in: positions } }, select: { position: true, title: true }, orderBy: { position: 'asc' } })
  return units.map((u) => u.title)
}

export async function buildTrialReport(reportId) {
  const report = await prisma.trialReport.findUnique({ where: { id: reportId }, include: { classroom: { select: { schoolId: true, student: { select: { id: true, name: true } }, teacher: { select: { name: true } } } } } })
  if (!report) return null
  const answers = report.answers ?? {}
  const estimate = estimateLevel(answers)
  const { wrong, partly, right, focus } = gather(report, answers)
  const level = report.teacherLevel || (estimate.plus ? `${estimate.estimated}+` : estimate.estimated)
  const base = level.replace('+', '')

  const mistakes = await prisma.lessonMistake.findMany({ where: { studentId: report.studentId }, orderBy: { createdAt: 'desc' }, take: 30 })
  const mistakeTopics = [...new Set(mistakes.flatMap((m) => m.topics.map(topicLabel)))].slice(0, 6)

  const unitPositions = [...new Set(focus.slice(0, 5).flatMap((f) => f.item.units))]
  const units = await unitTitles(report.classroom.schoolId, unitPositions)

  let generated = null
  if (assistantEnabled()) {
    try {
      const { default: Anthropic } = await import('@anthropic-ai/sdk')
      const { zodOutputFormat } = await import('@anthropic-ai/sdk/helpers/zod')
      const client = new Anthropic()
      const material = [
        `Student: ${report.classroom.student?.name ?? 'student'}. Teacher's level assessment: ${report.teacherLevel ?? 'not given'}; test estimate: ${estimate.estimated}${estimate.plus ? '+' : ''} (A1 ${estimate.rates.A1 ?? '-'}%, A2 ${estimate.rates.A2 ?? '-'}%, B1 ${estimate.rates.B1 ?? '-'}%, B2 ${estimate.rates.B2 ?? '-'}%).`,
        `Teacher's comments: ${report.comments || '—'}`,
        '', 'CORRECT:', ...right.map((i) => `${i.n}. ${i.ru} → ${i.en} [${i.topic}, ${i.level}]`),
        '', 'PARTLY CORRECT:', ...partly.map((i) => `${i.n}. ${i.ru} → ${i.en} [${i.topic}, ${i.level}]`),
        '', 'WRONG:', ...wrong.map((i) => `${i.n}. ${i.ru} → ${i.en} [${i.topic}, ${i.level}]`),
        '', 'MISTAKES NOTED IN LESSONS (said → correct):', ...mistakes.slice(0, 15).map((m) => `${m.said} → ${m.correct}`),
        '', 'TEXTBOOK CHAPTERS THAT COVER THE WEAK TOPICS:', ...units
      ].join('\n')
      const response = await client.messages.parse({
        model: 'claude-opus-5',
        max_tokens: 4000,
        thinking: { type: 'adaptive' },
        system:
          'You write a level report for an adult Russian-speaking learner of English after a trial lesson at Advent Academy (a private English school, warm and professional tone, no bureaucratic language). ' +
          'Write in Russian; keep grammar terms in English (Present Perfect, Second Conditional…). Address the student as «вы». Be specific: name the exact points, quote the test sentences as examples. ' +
          'Return: summary (3–4 sentences: the level, what it means in practice, the overall impression); strengths (2–4 things the student already does well, from the correct answers and the teacher\'s comments); ' +
          'focus (up to 5 grammar points that need attention, each with why it matters and one example sentence from the test in English with the correct form); ' +
          'recommendations (3–5 practical pieces of advice: what to practise and how, which textbook chapters, habits — concrete, no platitudes); plan (3–5 steps for the first month of lessons). ' +
          'Never mention that the report was generated automatically.',
        messages: [{ role: 'user', content: material }],
        output_config: { format: zodOutputFormat(AiSchema) }
      })
      const ai = response.parsed_output
      if (ai) generated = { ...ai, withAi: true }
    } catch (error) {
      console.error('Trial report AI step failed:', error.message)
    }
  }

  if (!generated) {
    const info = LEVEL_TEXT[base] ?? LEVEL_TEXT.A1
    const next = LEVELS[Math.min(LEVELS.indexOf(base) + 1, LEVELS.length - 1)]
    generated = {
      withAi: false,
      summary: `По итогам пробного урока ваш уровень — примерно ${level} (${info.name}). На этом уровне вы уже можете ${info.can}. ` +
        (right.length ? `В тесте вы верно перевели ${right.length} из ${estimate.answered} предложений` : 'Тест ещё не размечен') +
        (report.comments ? `. Комментарий преподавателя: ${report.comments}` : '.'),
      strengths: right.slice(0, 4).map((i) => `${i.topic} — «${i.en}»`),
      focus: focus.slice(0, 5).map((f) => ({
        topic: f.topic,
        why: `В тесте это предложение вызвало трудность (уровень ${f.item.level}).`,
        example: `${f.item.ru} → ${f.item.en}`
      })),
      recommendations: [
        ...(units.length ? [`Пройти главы учебника: ${units.slice(0, 4).join('; ')}.`] : []),
        ...(mistakeTopics.length ? [`Повторить темы из тетради ошибок: ${mistakeTopics.join(', ')}.`] : []),
        'Каждый день 10–15 минут практики на платформе: раздел Practice подбирает упражнения под ваши ошибки.',
        'Сохранять новые слова в «My words» прямо с доски и повторять их карточками.',
        `Цель на ближайшие месяцы — уверенный ${next}.`
      ],
      plan: [
        'Урок 1–2: закрепляем то, что уже получается, и разбираем первые темы из списка выше.',
        'Урок 3–4: разговорная практика на пройденных конструкциях, тетрадь ошибок.',
        'После 8 уроков — короткий повторный тест, чтобы увидеть прогресс.'
      ]
    }
  }

  const data = {
    level,
    estimate,
    focusTopics: focus.slice(0, 6).map((f) => f.topic),
    mistakeTopics,
    units,
    counts: { right: right.length, partly: partly.length, wrong: wrong.length, answered: estimate.answered, total: estimate.total },
    ...generated
  }
  return prisma.trialReport.update({ where: { id: reportId }, data: { generated: data } })
}
