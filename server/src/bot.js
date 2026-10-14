import { prisma } from './db.js'
import { botOn, botOnSince, botSince, botToken, bookingUrl, sendTo, once, wasSent, esc, packageMark, onLinked, appUrl } from './telegram.js'
import { confirmBooking } from './booking.js'
import { maySeeStudent } from './partnerScope.js'
import { OFFER_PLANS, DISCOUNT_DAYS } from './offer.js'
import { countedCalls } from './routes/billing.js'
import { generateRecurringInstances } from './routes/personal.js'

// What the school's bot says, and when: the table Galina approved
// (https://claude.ai/artifact/5tegZL9cFy81DFe6mpbzNP). The platform decides
// and keeps everything; this file only turns what happened into messages.
// Almost everything is found by looking (every minute) rather than hooked
// into the code that changes it, so a lesson, a report or a payment is
// announced however it came about. Each message is sent once (`once`).
// What the bot does (Galina, 2026-10-14): the trial lesson from booking to
// the first payment; a reminder 15 minutes before every Timetable lesson; a
// polite reminder to pay when a package is used up; and every payment and
// debt to the owner and the partner (Galina, Maxim). Only trials booked on
// Maxim's site wait for the Settings switch (his bot may still be talking to
// those students); everything else goes as soon as the bot is connected.

const MIN = 60000
const HOUR = 60 * MIN
const MSK = 'Europe/Moscow'
const mskDate = (d) => new Date(d).toLocaleDateString('ru-RU', { timeZone: MSK, day: 'numeric', month: 'long' })
const mskTime = (d) => new Date(d).toLocaleTimeString('ru-RU', { timeZone: MSK, hour: '2-digit', minute: '2-digit' })
const mskDay = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: MSK })
// «сегодня» / «завтра» / «14 октября»
function day(d) {
  const today = mskDay(Date.now())
  const tomorrow = mskDay(Date.now() + 24 * HOUR)
  const that = mskDay(d)
  return that === today ? 'сегодня' : that === tomorrow ? 'завтра' : mskDate(d)
}
const rub = (n) => `${n.toLocaleString('ru-RU')} ₽`
const MENTOR = OFFER_PLANS.find((p) => p.id === 'mentor')
const SOLO = OFFER_PLANS.find((p) => p.id === 'solo')

const PERSON = { id: true, name: true, role: true, schoolId: true, telegramChatId: true, viaLink: true, lessonsPaid: true, packageStartedAt: true, heldAdjust: true, telegramPaidSeen: true, paymentReportedAt: true, trialAccessUntil: true, plan: true, planUntil: true }
const person = (id) => (id ? prisma.user.findUnique({ where: { id }, select: PERSON }) : null)
const owners = (schoolId) => prisma.user.findMany({ where: { schoolId, role: 'OWNER', telegramChatId: { not: null } }, select: PERSON })
// Who hears of a student's payments, package and debt: the owner always; the
// partner (Maxim) only for students who came from his site (partnerScope.js).
async function admins(student) {
  const fromSite = await maySeeStudent({ role: 'PARTNER' }, student.id)
  return prisma.user.findMany({ where: { schoolId: student.schoolId, role: { in: fromSite ? ['OWNER', 'PARTNER'] : ['OWNER'] }, telegramChatId: { not: null } }, select: PERSON })
}
const teachersOf = async (studentId) => (await prisma.teacherStudent.findMany({ where: { studentId }, select: { teacher: { select: PERSON } } })).map((l) => l.teacher)

const lessonUrl = (token) => `${appUrl()}/lesson/${token}`
// A student who came by a lesson link opens the platform through it (no password).
async function latestLessonToken(studentId) {
  return (await prisma.adventLesson.findFirst({ where: { studentUserId: studentId, studentToken: { not: null } }, orderBy: { startsAt: 'desc' }, select: { studentToken: true } }))?.studentToken ?? null
}
async function classUrl(student) {
  const token = student.viaLink ? await latestLessonToken(student.id) : null
  return token ? lessonUrl(token) : `${appUrl()}/`
}
async function payUrl(student) {
  const token = student.viaLink ? await latestLessonToken(student.id) : null
  return token ? `${lessonUrl(token)}?to=${encodeURIComponent('/billing')}` : `${appUrl()}/billing`
}
const paid = (s) => s.lessonsPaid > 0 || (s.plan && s.planUntil && new Date(s.planUntil) > new Date())
const kindWord = (lesson) => (lesson.kind === 'trial' ? 'пробный урок' : 'урок')
const cap = (s) => s[0].toUpperCase() + s.slice(1)
const test = (lesson) => (lesson.isTest ? '[ТЕСТ] ' : '')
const ours = (lesson) => lesson?.source === 'platform'
const fromAdvent = (lesson) => Boolean(lesson) && !ours(lesson)
// May the bot speak about this lesson now, and is it new enough to announce?
const allowed = (lesson) => !fromAdvent(lesson) || botOn()
const recent = (lesson, at) => new Date(at) >= (fromAdvent(lesson) ? botOnSince() : botSince())

// --- 1–2. A booking from the Advent site, before the lesson --------------------

function confirmation(lesson, teacherName) {
  const name = lesson.studentName ? `${esc(lesson.studentName)}, в` : 'В'
  const what = lesson.kind === 'trial' ? 'бесплатный пробный урок' : 'урок'
  return [
    `${name}ы записаны на ${what} ✅`,
    `${mskDate(lesson.startsAt)}, ${mskTime(lesson.startsAt)} МСК, ${lesson.durationMin} минут, преподаватель ${esc(teacherName ?? '')}.`,
    'Регистрироваться не нужно: в назначенное время откройте ссылку, введите имя — и вы в классе. Урок идёт в браузере, с компьютера или телефона, лучше в наушниках.',
    'Ссылка не изменится — сохраните это сообщение.'
  ].join('\n')
}
const enterButton = (lesson) => [[{ text: 'Войти на урок', url: lessonUrl(lesson.studentToken) }]]
const openButton = (lesson) => [[{ text: 'Открыть урок', url: lessonUrl(lesson.teacherToken) }]]

async function confirmToStudent(lesson, student, teacher) {
  if (!lesson.studentToken || lesson.status !== 'scheduled' || new Date(lesson.startsAt) < Date.now() - 10 * MIN) return false
  return once(`book:s:${lesson.id}`, () => sendTo(student, confirmation(lesson, teacher?.name), enterButton(lesson)))
}

async function noticeToTeacher(lesson, teacher) {
  const what = lesson.kind === 'trial' ? 'Новый пробный урок' : 'Новый урок'
  const text = [
    `${test(lesson)}${what}: ${esc(lesson.studentName ?? 'ученик')}, ${day(lesson.startsAt)} в ${mskTime(lesson.startsAt)} МСК.`,
    lesson.kind === 'trial' ? 'В назначенное время откройте ссылку и нажмите Trial lesson — ученик войдёт сам.' : 'В назначенное время откройте ссылку и начните урок.',
    'Подтвердите, пожалуйста, что проведёте урок.'
  ].join('\n')
  return once(`book:t:${lesson.id}:${lesson.teacherId}`, () => sendTo(teacher, text, [[{ text: 'Подтверждаю', data: `c:${lesson.id}` }], ...openButton(lesson)]))
}

// A student connected the bot from their lesson link: the booking at once.
// A booking made on the platform is confirmed by this very Start.
onLinked(async (user, lesson) => {
  if (!lesson || user.role !== 'STUDENT' || lesson.studentUserId !== user.id) return
  let fresh = await prisma.adventLesson.findUnique({ where: { id: lesson.id } })
  if (ours(fresh) && fresh.status === 'pending') fresh = await confirmBooking(fresh)
  if (!allowed(fresh)) return
  const sent = await confirmToStudent(fresh, user, await person(fresh.teacherId))
  if (sent && !fresh.botStartsAt) await prisma.adventLesson.update({ where: { id: fresh.id }, data: { botStartsAt: fresh.startsAt, botTeacherId: fresh.teacherId } })
})

async function bookings() {
  const now = Date.now()
  const lessons = await prisma.adventLesson.findMany({
    where: { startsAt: { gt: new Date(now - 30 * MIN), lt: new Date(now + 30 * 24 * HOUR) }, OR: [{ status: 'scheduled' }, { status: 'cancelled', botStartsAt: { not: null } }] }
  })
  for (const lesson of lessons) {
    if (!allowed(lesson)) continue
    const [student, teacher] = await Promise.all([person(lesson.studentUserId), person(lesson.teacherId)])
    const start = new Date(lesson.startsAt)

    if (lesson.status === 'cancelled') {
      // Cancelled after it was announced.
      if (await wasSent(`book:s:${lesson.id}`)) {
        await once(`cancel:s:${lesson.id}`, () => sendTo(student, `${lesson.kind === 'trial' ? 'Пробный урок' : 'Урок'} ${mskDate(start)} в ${mskTime(start)} МСК отменён. Выберите другое удобное время${lesson.kind === 'trial' ? ' — урок по-прежнему бесплатный' : ''}.`, [[{ text: 'Выбрать время', url: bookingUrl() }]]))
      }
      if (await wasSent(`book:t:${lesson.id}:${lesson.teacherId}`)) {
        await once(`cancel:t:${lesson.id}`, () => sendTo(teacher, `${test(lesson)}${cap(kindWord(lesson))} ${mskDate(start)} в ${mskTime(start)} МСК отменён. Ученик: ${esc(lesson.studentName ?? '—')}.`))
      }
      continue
    }

    // Moved, or given to another teacher, after it was announced.
    if (lesson.botStartsAt) {
      const moved = new Date(lesson.botStartsAt).getTime() !== start.getTime()
      const newTeacher = lesson.botTeacherId && lesson.botTeacherId !== lesson.teacherId
      if (moved || newTeacher) {
        const key = `${start.getTime()}:${lesson.teacherId}`
        if (await wasSent(`book:s:${lesson.id}`)) {
          const lines = [
            moved ? `${lesson.kind === 'trial' ? 'Пробный урок' : 'Урок'} перенесён на ${mskDate(start)}, ${mskTime(start)} МСК.` : null,
            newTeacher ? `Урок проведёт ${esc(teacher?.name ?? '')}.${moved ? '' : ' Время и ссылка прежние.'}` : null,
            moved ? 'Ссылка та же.' : null
          ].filter(Boolean)
          await once(`change:s:${lesson.id}:${key}`, () => sendTo(student, lines.join('\n'), enterButton(lesson)))
        }
        if (newTeacher) {
          const before = await person(lesson.botTeacherId)
          await once(`change:old:${lesson.id}:${key}`, () => sendTo(before, `${test(lesson)}${cap(kindWord(lesson))} ${mskDate(lesson.botStartsAt)} в ${mskTime(lesson.botStartsAt)} МСК передан другому преподавателю. Ученик: ${esc(lesson.studentName ?? '—')}.`))
        } else {
          await once(`change:t:${lesson.id}:${key}`, () => sendTo(teacher, `${test(lesson)}${cap(kindWord(lesson))} перенесён на ${day(start)}, ${mskTime(start)} МСК. Ученик: ${esc(lesson.studentName ?? '—')}.`, openButton(lesson)))
        }
        await prisma.adventLesson.update({ where: { id: lesson.id }, data: { botStartsAt: start, botTeacherId: lesson.teacherId } })
      }
    }

    // New: the teacher (booked after the bot was switched on) and the student (once connected).
    let told = false
    if (start > now && recent(lesson, lesson.createdAt)) told = (await noticeToTeacher(lesson, teacher)) || told
    if (student) told = (await confirmToStudent(lesson, student, teacher)) || told
    if (told && !lesson.botStartsAt) await prisma.adventLesson.update({ where: { id: lesson.id }, data: { botStartsAt: start, botTeacherId: lesson.teacherId } })

    // The teacher hasn't confirmed in 2 hours (or it's 3 hours to the lesson): the owner.
    if (lesson.kind === 'trial' && !lesson.teacherConfirmedAt && start > now && recent(lesson, lesson.createdAt) &&
        now > new Date(lesson.createdAt).getTime() + 30 * MIN &&
        (now > new Date(lesson.createdAt).getTime() + 2 * HOUR || now > start.getTime() - 3 * HOUR)) {
      const notified = await wasSent(`book:t:${lesson.id}:${lesson.teacherId}`)
      const text = notified
        ? `${test(lesson)}Пробный урок ${day(start)} в ${mskTime(start)} МСК ещё не подтверждён. Ученик: ${esc(lesson.studentName ?? '—')}, преподаватель: ${esc(teacher?.name ?? '')}.`
        : `${test(lesson)}Сообщение о пробном уроке ${day(start)} в ${mskTime(start)} МСК не дошло до преподавателя: Telegram не подключён. Преподаватель: ${esc(teacher?.name ?? '')}, ученик: ${esc(lesson.studentName ?? '—')}. Напомните, пожалуйста.`
      for (const owner of await owners(teacher?.schoolId)) await once(`noconfirm:${lesson.id}:${owner.id}`, () => sendTo(owner, text))
    }

    // Reminders: a day before, 15 and 5 minutes before.
    const left = start.getTime() - now
    const at = start.getTime()
    if (left > 23 * HOUR && left <= 24 * HOUR) {
      await once(`r24:${lesson.id}:${at}`, () => sendTo(student, `${cap(day(start))} в ${mskTime(start)} МСК — ваш ${kindWord(lesson)}. Преподаватель: ${esc(teacher?.name ?? '')}. Ссылка та же.`, enterButton(lesson)))
    }
    if (left > 5 * MIN && left <= 15 * MIN) {
      await once(`r15:s:${lesson.id}:${at}`, () => sendTo(student, 'Через 15 минут урок. Откройте ссылку чуть раньше — на странице можно проверить камеру и микрофон.', enterButton(lesson)))
      await once(`r15:t:${lesson.id}:${at}`, () => sendTo(teacher, `${test(lesson)}Через 15 минут ${kindWord(lesson)}. Ученик: ${esc(lesson.studentName ?? '—')}.`, openButton(lesson)))
    }
    if (left > 0 && left <= 5 * MIN) {
      await once(`r5:${lesson.id}:${at}`, () => sendTo(student, 'Урок через 5 минут — заходите, преподаватель скоро будет.', enterButton(lesson)))
    }
  }
}

// --- 3. After the trial: how it went ---------------------------------------------

async function outcomes() {
  const now = Date.now()
  const lessons = await prisma.adventLesson.findMany({
    where: { finishedSentAt: { gt: new Date(now - 3 * 24 * HOUR) }, outcome: { not: null } }
  })
  for (const lesson of lessons) {
    if (!allowed(lesson) || !recent(lesson, lesson.finishedSentAt)) continue
    const [student, teacher] = await Promise.all([person(lesson.studentUserId), person(lesson.teacherId)])
    const ended = new Date(lesson.finishedSentAt).getTime()
    const report = lesson.callId ? await prisma.trialReport.findFirst({ where: { callId: lesson.callId, publishedAt: { not: null } }, select: { id: true } }) : null
    if (lesson.outcome === 'held' && lesson.kind === 'trial') {
      if (!report) await once(`held:${lesson.id}`, () => sendTo(student, 'Спасибо за урок! Преподаватель готовит для вас отчёт: уровень, ошибки и план обучения. Пришлём его сюда в течение пары часов.'))
      // No report two hours later: the teacher.
      if (!report && now > ended + 2 * HOUR && now < ended + 24 * HOUR) {
        const room = lesson.classroomId ? `${appUrl()}/classroom/${lesson.classroomId}?trial=1` : `${appUrl()}/trial-reports`
        await once(`noreport:${lesson.id}`, () => sendTo(teacher, `${test(lesson)}Отправьте, пожалуйста, отчёт по пробному уроку (ученик: ${esc(lesson.studentName ?? '—')}): кабинет ученика → Send to the student.`, [[{ text: 'Открыть кабинет ученика', url: room }]]))
      }
    }
    if (lesson.outcome === 'student_no_show') {
      const again = [[{ text: 'Выбрать время', url: bookingUrl() }]]
      await once(`noshow:${lesson.id}`, () => sendTo(student, `Жаль, что не получилось встретиться.${lesson.kind === 'trial' ? ' Пробный урок всё ещё бесплатный —' : ''} выберите другое удобное время.`, again))
      // Once more a day later, unless they booked again.
      if (now > ended + 24 * HOUR && now < ended + 48 * HOUR) {
        const rebooked = await prisma.adventLesson.findFirst({ where: { id: { not: lesson.id }, createdAt: { gt: lesson.startsAt }, OR: [{ studentUserId: lesson.studentUserId ?? '-' }, { studentAdventId: lesson.studentAdventId ?? '-' }] }, select: { id: true } })
        if (!rebooked) await once(`noshow2:${lesson.id}`, () => sendTo(student, 'Напоминаем: вы можете выбрать новое время для урока — это займёт минуту.', again))
      }
    }
    if (lesson.outcome === 'teacher_no_show') {
      await once(`tnoshow:${lesson.id}`, () => sendTo(student, 'Простите — урок сорвался по нашей вине. Выберите любое удобное время, мы обязательно проведём урок.', [[{ text: 'Выбрать время', url: bookingUrl() }]]))
      for (const owner of await owners(teacher?.schoolId)) {
        await once(`tnoshow:o:${lesson.id}:${owner.id}`, () => sendTo(owner, `${test(lesson)}${lesson.kind === 'trial' ? 'Пробный урок' : 'Урок'} ${mskDate(lesson.startsAt)} в ${mskTime(lesson.startsAt)} МСК не состоялся: не пришёл преподаватель ${esc(teacher?.name ?? '')}. Ученик — ${esc(lesson.studentName ?? '')}.`))
      }
    }
  }
}

// --- 3–4. The trial report, then the discount days -------------------------------

async function reportLinks(report, student) {
  const lesson = report.callId ? await prisma.adventLesson.findUnique({ where: { callId: report.callId }, select: { studentToken: true } }) : null
  const token = lesson?.studentToken ?? (student.viaLink ? await latestLessonToken(student.id) : null)
  return token
    ? { report: `${lessonUrl(token)}?to=${encodeURIComponent(`/report/${report.id}`)}`, pay: `${lessonUrl(token)}?to=${encodeURIComponent('/billing')}` }
    : { report: `${appUrl()}/report/${report.id}`, pay: `${appUrl()}/billing` }
}

async function reports() {
  const now = Date.now()
  const list = await prisma.trialReport.findMany({
    where: { publishedAt: { gt: new Date(now - (DISCOUNT_DAYS + 1) * 24 * HOUR) } },
    select: { id: true, studentId: true, callId: true, publishedAt: true, teacherLevel: true, generated: true }
  })
  for (const report of list) {
    const lesson = report.callId ? await prisma.adventLesson.findUnique({ where: { callId: report.callId }, select: { source: true } }) : null
    if (!allowed(lesson) || !recent(lesson, report.publishedAt)) continue
    const student = await person(report.studentId)
    if (!student?.telegramChatId) continue
    const links = await reportLinks(report, student)
    const end = new Date(report.publishedAt).getTime() + DISCOUNT_DAYS * 24 * HOUR
    const level = report.generated?.level ?? report.teacherLevel
    // The platform's three days for students who came by a lesson link.
    const access = student.viaLink || student.trialAccessUntil ? ' и полный доступ к платформе' : ''
    const buttons = [[{ text: 'Открыть отчёт', url: links.report }], [{ text: 'Оплатить', url: links.pay }]]
    const text = [
      'Ваш отчёт по пробному уроку готов ✅',
      `${level ? `Уровень: ${esc(level)}. ` : ''}Внутри — что уже получается, над чем работать и план на первый месяц.`,
      ...(paid(student) ? [] : [
        '',
        'Как продолжить:',
        `• Ментор — 9 уроков в месяц один на один с преподавателем, по 60 минут: <s>${rub(MENTOR.price)}</s> ${rub(MENTOR.discounted)}/мес`,
        `• Соло — самостоятельно на платформе, без преподавателя: <s>${rub(SOLO.price)}</s> ${rub(SOLO.discounted)}/мес`,
        `Скидка 5%${access} — до ${mskDate(end)}, ${mskTime(end)} МСК.`
      ])
    ].join('\n')
    await once(`report:${report.id}`, () => sendTo(student, text, paid(student) ? [buttons[0]] : buttons))

    // Discount reminders, while they haven't paid (or said they have).
    if (paid(student) || (student.paymentReportedAt && new Date(student.paymentReportedAt) >= new Date(report.publishedAt))) continue
    if (!(await wasSent(`report:${report.id}`))) continue
    const pay = [[{ text: 'Оплатить', url: links.pay }], [{ text: 'Открыть отчёт', url: links.report }]]
    if (now >= end - 24 * HOUR && now < end - 3 * HOUR) {
      const until = day(end) === 'завтра' ? `до завтра, ${mskTime(end)} МСК` : `до ${day(end)}, ${mskTime(end)} МСК`
      await once(`d24:${report.id}`, () => sendTo(student, `Напоминаем: скидка 5%${access} действуют ${until}.\nМентор со скидкой — ${rub(MENTOR.discounted)}/мес вместо ${rub(MENTOR.price)}.`, pay))
    }
    if (now >= end - 3 * HOUR && now < end) {
      await once(`d3:${report.id}`, () => sendTo(student, `Через 3 часа скидка${access ? ' и доступ к платформе' : ''} закончатся. Успейте оплатить со скидкой 5%.`, [pay[0]]))
    }
    if (now >= end && now < end + 24 * HOUR) {
      await once(`dend:${report.id}`, () => sendTo(student, `${access ? 'Пробный доступ закончился.' : 'Скидка закончилась.'} Если захотите продолжить — Ментор ${rub(MENTOR.price)}/мес, 9 уроков по 60 минут. Оплатить можно в любой момент.`, [pay[0]]))
    }
  }
}

// --- 5. Payments: the owner and the partner hear of every one ---------------

async function payments() {
  const since = botSince()
  // «Я оплатил» (a transfer, or a card payment back from Stripe): whoever
  // receives the money checks it and adds the lessons.
  const reported = await prisma.user.findMany({ where: { role: 'STUDENT', paymentReportedAt: { gte: since, gt: new Date(Date.now() - 2 * 24 * HOUR) } }, select: PERSON })
  for (const student of reported) {
    for (const admin of await admins(student)) {
      await once(`reported:${student.id}:${new Date(student.paymentReportedAt).getTime()}:${admin.id}`, () => sendTo(admin,
        `💳 Ученик ${esc(student.name)} сообщил об оплате. Проверьте поступление и начислите уроки: Payments → ученик → Edit → New package.`,
        [[{ text: 'Открыть оплаты', url: `${appUrl()}/billing` }]]))
    }
  }
  // Lessons added (by hand after a transfer, or a payment from Advent's site):
  // every student's package is compared with what the bot saw last time.
  const students = await prisma.user.findMany({ where: { role: 'STUDENT' }, select: PERSON })
  for (const student of students) {
    const mark = packageMark(student)
    if (mark === student.telegramPaidSeen) continue
    await prisma.user.update({ where: { id: student.id }, data: { telegramPaidSeen: mark } })
    // The first look at someone only remembers what is there already.
    if (student.telegramPaidSeen == null || !(student.lessonsPaid > 0)) continue
    const [oldLessons, oldStart] = student.telegramPaidSeen.split('|')
    const newPackage = oldStart !== mark.split('|')[1]
    const more = newPackage ? student.lessonsPaid : student.lessonsPaid - Number(oldLessons)
    if (more <= 0) continue
    const teacher = (await teachersOf(student.id))[0]
    for (const admin of await admins(student)) {
      await sendTo(admin, `✅ Оплата засчитана: ${esc(student.name)}${teacher ? ` (преподаватель ${esc(teacher.name)})` : ''} — уроков в пакете: ${student.lessonsPaid}.`)
    }
    // A student from a trial: the end of the trial's path — sign up and wait for the teacher.
    if (student.viaLink && student.telegramChatId && Number(oldLessons) === 0) {
      await sendTo(student, [
        `Спасибо за оплату! ✅ Оплачено уроков: ${student.lessonsPaid}.`,
        'Откройте ту же ссылку и придумайте почту и пароль — так вы будете входить сами.',
        teacher ? `Преподаватель ${esc(teacher.name)} свяжется с вами, чтобы выбрать время занятий.` : null
      ].filter(Boolean).join('\n'), [[{ text: 'Открыть платформу', url: await classUrl(student) }]])
    }
  }
}

// --- 6. Lessons in the Timetable: a reminder 15 minutes before -----------------

async function timetable() {
  const now = new Date()
  const horizon = new Date(now.getTime() + 15 * MIN)
  const events = await prisma.userCalendarEvent.findMany({
    where: {
      studentIds: { isEmpty: false },
      startTime: { lte: horizon },
      OR: [{ recurrence: null, startTime: { gt: now } }, { recurrence: 'WEEKLY', OR: [{ recurrenceEndDate: null }, { recurrenceEndDate: { gte: now } }] }]
    },
    include: { user: { select: { name: true, schoolId: true } } }
  })
  for (const event of events) {
    const students = await prisma.user.findMany({ where: { id: { in: event.studentIds }, schoolId: event.user.schoolId, telegramChatId: { not: null } }, select: PERSON })
    for (const lesson of generateRecurringInstances(event, now, horizon)) {
      const start = new Date(lesson.startTime)
      const left = start - now
      if (left <= 5 * MIN || left > 15 * MIN) continue
      for (const student of students) {
        await once(`cal15:${event.id}:${start.getTime()}:${student.id}`, async () => sendTo(student,
          `Через 15 минут урок с преподавателем ${esc(event.user.name)} (${mskTime(start)} МСК). Заходите чуть раньше — проверьте камеру и микрофон.`,
          [[{ text: 'Войти на урок', url: await classUrl(student) }]]))
      }
    }
  }
}

// --- 7. The package is used up, or lessons go beyond it ------------------------

async function packages() {
  const since = botSince()
  const students = await prisma.user.findMany({ where: { role: 'STUDENT', lessonsPaid: { gt: 0 } }, select: PERSON })
  for (const student of students) {
    const held = (await countedCalls(student)) + (student.heldAdjust ?? 0)
    if (held < student.lessonsPaid) continue
    const pkg = `${student.id}:${student.packageStartedAt ? new Date(student.packageStartedAt).getTime() : 0}:${student.lessonsPaid}`
    // Only what happened after the bot was connected.
    const last = await prisma.session.findFirst({ where: { classroom: { studentId: student.id }, counted: true }, orderBy: { startedAt: 'desc' }, select: { startedAt: true } })
    const fresh = last && new Date(last.startedAt) >= since
    const teacher = (await teachersOf(student.id))[0]
    const who = `${esc(student.name)}${teacher ? ` (преподаватель ${esc(teacher.name)})` : ''}`
    if (held === student.lessonsPaid) {
      if (!fresh) { await once(`pkgend:${pkg}`, async () => true); continue }
      await once(`pkgend:${pkg}`, async () => {
        if (student.telegramChatId) {
          await sendTo(student, [
            'Спасибо, что занимаетесь с нами! 🌿',
            `Уроки этого пакета закончились — вы прошли все ${student.lessonsPaid}.`,
            'Чтобы занятия шли без перерыва, оплатите, пожалуйста, следующий пакет — расписание сохранится.'
          ].join('\n'), [[{ text: 'Оплатить', url: await payUrl(student) }]])
        }
        for (const admin of await admins(student)) await sendTo(admin, `📦 Пакет закончился: ${who} — проведено ${held} из ${student.lessonsPaid}. Ждём следующую оплату.`)
        return true
      })
    } else {
      // More lessons held than paid for: a debt, told once per extra lesson.
      const debt = held - student.lessonsPaid
      if (!fresh) { await once(`debt:${pkg}:${debt}`, async () => true); continue }
      await once(`debt:${pkg}:${debt}`, async () => {
        for (const admin of await admins(student)) {
          await sendTo(admin, `⚠️ Задолженность: ${who} — проведено ${held}, оплачено ${student.lessonsPaid}. Долг: ${debt} ${debt === 1 ? 'урок' : debt < 5 ? 'урока' : 'уроков'}.`, [[{ text: 'Открыть оплаты', url: `${appUrl()}/billing` }]])
        }
        return true
      })
    }
  }
}

// --- Running -----------------------------------------------------------------

const quietly = (name, job) => job().catch((error) => console.error(`[bot] ${name}`, error.message))
let running = false
async function everyMinute() {
  if (!botToken() || running) return
  running = true
  try {
    await quietly('bookings', bookings)
    await quietly('outcomes', outcomes)
    await quietly('reports', reports)
    await quietly('payments', payments)
    await quietly('timetable', timetable)
  } finally { running = false }
}
let ticks = 0
export function startBotJobs() {
  setTimeout(everyMinute, 30 * 1000)
  setInterval(() => {
    everyMinute()
    // Counting lessons for every student is heavier: every 10 minutes.
    if (++ticks % 10 === 0 && botToken()) quietly('packages', packages)
  }, MIN)
}
// For a test run: one pass of everything.
export async function runBotOnce() {
  await everyMinute()
  await quietly('packages', packages)
}
