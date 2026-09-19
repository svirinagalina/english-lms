// The offer printed at the end of a trial-lesson report and shown on the
// Payment page of students who came through a trial lesson. Numbers and
// wording live here so they are easy to change.
export const OFFER = {
  discountPercent: 5,
  discountDays: 3,
  heading: 'Как улучшить свой уровень?',
  intro: 'Мы предлагаем вам индивидуальный план обучения с вашим преподавателем. Интенсивность — 2 раза в неделю по 60 минут.',
  intro2: 'Это полностью адаптированная под вас и ваши задачи программа, которая составляется на основе пробного тестирования, которое вы уже прошли, а также аналитики, которая собирается в ходе последующих уроков.',
  format: '1 на 1, 2 занятия в неделю, 60 минут',
  between: 'ИИ-тренажёр + отчёт после каждого урока',
  plans: [
    {
      id: 'solo',
      name: 'Соло',
      line: 'Самостоятельно на платформе, без занятий с преподавателем',
      price: 5980,
      discounted: 5681,
      includes: ['ИИ-тренажёр', 'Интерактивная практика по учебнику Галины Свириной', 'Словарь для интервального повторения', 'Отчёт о прогрессе']
    },
    {
      id: 'mentor',
      name: 'Ментор',
      line: '9 уроков в месяц один на один с вашим преподавателем',
      price: 18990,
      discounted: 18041,
      includes: ['Адаптированная лично под вас программа обучения', '2 занятия в неделю по 60 минут', 'Отчёт после каждого урока', 'ИИ-тренажёр', 'Интерактивная практика по учебнику Галины Свириной между уроками', 'Словарь для интервального повторения', 'Записи уроков на месяц'],
      recommended: true
    }
  ],
  expertNote: 'Также доступно обучение лично с Галиной Свириной — подробности уточните у вашего менеджера.',
  guarantee: 'Передумали до начала занятий — вернём 100% оплаты, без условий.',
  // Stripe page where the customer enters the amount: the plan's rouble
  // price converted to euros at the Bank of Russia rate of the day.
  stripeLink: 'https://buy.stripe.com/6oU3cvace4Be4TpgX0bQY1M',
  ctaText: 'Продолжить с преподавателем со скидкой →',
  ctaLink: '/billing',
  expiry: 'Через 3 дня скидка сгорает.'
}

export const formatRub = (n) => `${n.toLocaleString('ru-RU')} ₽`

// The discount runs for a few days from the report's publication (Moscow time).
export function discountDeadline(publishedAt) {
  const since = new Date(publishedAt)
  const until = new Date(since.getTime() + OFFER.discountDays * 24 * 60 * 60 * 1000)
  return {
    until,
    label: `${until.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Moscow' })}, ${until.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' })} МСК`,
    active: until.getTime() > Date.now()
  }
}
