import crypto from 'crypto'
import { prisma } from './db.js'
import { encrypt, decrypt, supportContact } from './settings.js'
import { sendTelegramCodeEmail, mailEnabled } from './mailer.js'

// The school's own Telegram bot (Galina, 2026-10-13: the platform sends every
// message itself instead of Advent's bot). The owner pastes the token from
// @BotFather in Settings; it is stored encrypted like the other keys. People
// connect by pressing Start through a personal link (t.me/<bot>?start=…):
// l_<student lesson token>, t_<teacher lesson token>, u_<user id>_<signature>.
// What the bot says and when is in bot.js; nothing goes to students or
// teachers until the owner switches messages on (so it never doubles Advent's
// bot while that one is still running).

const API = () => (process.env.TELEGRAM_API_URL ?? 'https://api.telegram.org').replace(/\/$/, '')
const APP_URL = () => (process.env.APP_URL ?? 'https://lms.advent-academy.online').replace(/\/$/, '')

const state = { token: null, username: null, on: false, onSince: null, connectedAt: null, bookingUrl: null, generation: 0, offset: 0 }
export const botToken = () => process.env.TELEGRAM_BOT_TOKEN || state.token
export const botUsername = () => state.username
// The Settings switch: messages about trials booked on Maxim's site (his bot
// may still be sending its own). Everything else goes once the bot is
// connected, and only about what happened after that (`botSince`).
export const botOn = () => Boolean(botToken() && state.on)
export const botOnSince = () => state.onSince ?? new Date()
export const botSince = () => state.connectedAt ?? new Date()
// «Выбрать время»: the booking page on Maxim's site unless Settings says otherwise.
export const bookingUrl = () => state.bookingUrl || 'https://advent-academy.online/free-lesson'
export const botSettings = () => ({
  configured: Boolean(botToken()),
  fromEnv: Boolean(process.env.TELEGRAM_BOT_TOKEN),
  username: state.username,
  on: state.on,
  onSince: state.onSince,
  bookingUrl: bookingUrl()
})

async function call(token, method, body, timeoutMs = 15000) {
  const response = await fetch(`${API()}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(timeoutMs)
  })
  const data = await response.json().catch(() => ({ ok: false, description: `HTTP ${response.status}` }))
  if (!data.ok) {
    const error = new Error(data.description || `Telegram ${method} failed`)
    error.code = data.error_code
    throw error
  }
  return data.result
}
export const tg = (method, body, timeoutMs) => {
  const token = botToken()
  if (!token) throw new Error('The Telegram bot is not set up')
  return call(token, method, body, timeoutMs)
}

const put = (key, value) => prisma.platformSetting.upsert({ where: { key }, create: { key, value }, update: { value } })

export async function loadBotSettings() {
  const rows = await prisma.platformSetting.findMany({ where: { key: { in: ['telegram.token', 'telegram.username', 'telegram.on', 'telegram.onSince', 'telegram.connectedAt', 'telegram.bookingUrl'] } } })
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  try { state.token = map['telegram.token'] ? decrypt(map['telegram.token']) : null } catch { state.token = null }
  state.username = map['telegram.username'] || null
  state.on = map['telegram.on'] === 'on'
  state.onSince = map['telegram.onSince'] ? new Date(map['telegram.onSince']) : null
  state.bookingUrl = map['telegram.bookingUrl'] || null
  state.connectedAt = map['telegram.connectedAt'] ? new Date(map['telegram.connectedAt']) : null
  if (botToken() && !state.connectedAt) {
    state.connectedAt = new Date()
    await put('telegram.connectedAt', state.connectedAt.toISOString())
  }
  if (botToken() && !state.username) {
    try { state.username = (await tg('getMe')).username } catch (error) { console.error('[telegram] getMe', error.message) }
  }
  // The bot's menu: signing in to the platform is one tap away.
  if (botToken()) tg('setMyCommands', { commands: [{ command: 'login', description: 'Войти на платформу' }] }).catch(() => {})
  startPolling()
}

// A token is checked with Telegram before it is kept.
export async function saveBotToken(token) {
  if (!token) {
    await prisma.platformSetting.deleteMany({ where: { key: { in: ['telegram.token', 'telegram.username', 'telegram.connectedAt'] } } })
    return loadBotSettings()
  }
  let me
  try { me = await call(token, 'getMe') } catch (error) {
    throw Object.assign(new Error(`Telegram did not accept this key: ${error.message}`), { status: 400 })
  }
  // Polling and a webhook can't both be on.
  await call(token, 'deleteWebhook', {}).catch(() => {})
  await prisma.$transaction([put('telegram.token', encrypt(token)), put('telegram.username', me.username), put('telegram.connectedAt', new Date().toISOString())])
  return loadBotSettings()
}

export async function saveBotSwitch(on) {
  const writes = [put('telegram.on', on ? 'on' : 'off')]
  // Switched on now: what happened before (old lessons, reports, payments) is not announced.
  if (on && !state.on) writes.push(put('telegram.onSince', new Date().toISOString()))
  await prisma.$transaction(writes)
  return loadBotSettings()
}

export async function saveBookingUrl(url) {
  await put('telegram.bookingUrl', url || '')
  return loadBotSettings()
}

// --- Sending ------------------------------------------------------------------

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// One message to a person's connected chat. `buttons` are rows of
// { text, url } or { text, data } (data = a callback). Returns whether it went.
export async function sendTo(user, text, buttons) {
  if (!user?.telegramChatId || !botToken()) return false
  // Telegram refuses buttons that don't point to a public https page.
  const rows = (buttons ?? []).map((row) => row.filter((b) => b.data || /^https:\/\//.test(b.url ?? ''))
    .map((b) => (b.data ? { text: b.text, callback_data: b.data } : { text: b.text, url: b.url }))).filter((row) => row.length)
  try {
    await tg('sendMessage', {
      chat_id: user.telegramChatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...(rows.length ? { reply_markup: { inline_keyboard: rows } } : {})
    })
    return true
  } catch (error) {
    // Blocked the bot or deleted the chat: forget it, nothing more can reach them there.
    if (error.code === 403 || /chat not found/i.test(error.message)) {
      await prisma.user.updateMany({ where: { telegramChatId: user.telegramChatId }, data: { telegramChatId: null } })
    }
    console.error('[telegram] send', error.code ?? '', error.message)
    return false
  }
}

// Once per key, across restarts (the push log's table, with a prefix). The
// key is taken back if nothing was sent, so it is tried again next time.
export async function once(key, send) {
  const id = `tg:${key}`.slice(0, 190)
  try { await prisma.pushSent.create({ data: { key: id } }) } catch { return false }
  let sent = false
  try { sent = await send() } finally {
    if (!sent) await prisma.pushSent.deleteMany({ where: { key: id } })
  }
  return sent
}
export const wasSent = async (key) => Boolean(await prisma.pushSent.findUnique({ where: { key: `tg:${key}`.slice(0, 190) } }))

// --- Connecting ---------------------------------------------------------------

const signature = (userId) => crypto.createHmac('sha256', String(process.env.JWT_SECRET)).update(`telegram:${userId}`).digest('base64url').slice(0, 16)
export const startLink = (param) => (state.username ? `https://t.me/${state.username}?start=${param}` : null)
export const userStartLink = (userId) => startLink(`u_${userId}_${signature(userId)}`)

// What the bot last saw of a student's package (see bot.js, payments).
export const packageMark = (user) => `${user.lessonsPaid ?? 0}|${user.packageStartedAt ? new Date(user.packageStartedAt).getTime() : ''}`

async function whoStarts(param) {
  const p = String(param ?? '')
  if (p.startsWith('l_') || p.startsWith('t_')) {
    const token = p.slice(2)
    // l_ also takes a booking's own id: Maxim's site builds the link from the
    // end of student_join_url, which for bookings before the tokens (13.10)
    // was /?advent=<id>.
    const lesson = await prisma.adventLesson.findFirst({
      where: p.startsWith('l_')
        ? { OR: [{ studentToken: token }, { id: token, createdAt: { lt: new Date('2026-10-13T14:00:00Z') } }] }
        : { teacherToken: token }
    })
    if (!lesson) return null
    return { userId: p.startsWith('l_') ? lesson.studentUserId : lesson.teacherId, lesson }
  }
  const m = p.match(/^u_([A-Za-z0-9]+)_([A-Za-z0-9_-]{16})$/)
  if (m && crypto.timingSafeEqual(Buffer.from(m[2]), Buffer.from(signature(m[1])))) return { userId: m[1] }
  return null
}

const reply = (chatId, text) => tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true })
  .catch((error) => console.error('[telegram] reply', error.message))

const hooks = { onLinked: null, onCourseStart: null }
// coursePurchases.js: a course buyer connects to get the access link here.
export const onCourseStart = (fn) => { hooks.onCourseStart = fn }
// bot.js sends the lesson's confirmation right after a student connects.
export const onLinked = (fn) => { hooks.onLinked = fn }

async function handleStart(message, param) {
  const chatId = String(message.chat.id)
  if (!param) {
    const known = await prisma.user.findFirst({ where: { telegramChatId: chatId }, select: { name: true } })
    return reply(chatId, known
      ? `Вы подключены, ${esc(known.name)} ✅ Сюда приходят напоминания об уроках.\n\nЧтобы подключить ещё один аккаунт (например, второго ребёнка), напишите его почту.`
      : CONNECT_HELP)
  }
  if (param.startsWith('i_')) return handleInvite(message, param.slice(2))
  if (param === 'login') return sendLoginLinks(chatId)
  if (param.startsWith('co_') && hooks.onCourseStart) {
    const text = await hooks.onCourseStart({ chatId, orderId: param.slice(3), username: message.from?.username ?? null }).catch((error) => { console.error('[telegram] course', error.message); return null })
    return reply(chatId, text ?? 'Ссылка не подошла. Напишите нам, и мы откроем доступ.')
  }
  const found = await whoStarts(param)
  if (!found) return reply(chatId, 'Ссылка не подошла. Откройте её ещё раз со страницы урока или из профиля на платформе.')
  if (!found.userId) return reply(chatId, 'Сначала откройте ссылку на урок и введите своё имя, потом снова нажмите «Напоминания в Telegram».')
  const user = await prisma.user.findUnique({ where: { id: found.userId } })
  if (!user) return reply(chatId, 'Ссылка не подошла.')
  return linkChat(message, user, found.lesson)
}

// Connects this chat to the user: reminders and messages start coming here.
async function linkChat(message, user, lesson = null, { quiet = false } = {}) {
  const chatId = String(message.chat.id)
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      telegramChatId: chatId,
      telegramName: message.from?.username ? `@${message.from.username}` : null,
      telegramLinkedAt: new Date(),
      // Payments made before connecting are not thanked.
      ...(user.telegramChatId === chatId ? {} : { telegramPaidSeen: packageMark(user) })
    }
  })
  const staff = user.role !== 'STUDENT'
  if (!quiet) await reply(chatId, staff
    ? `Готово, ${esc(user.name)}! Сюда будут приходить новые пробные уроки, напоминания и оплаты учеников.`
    : `Готово, ${esc(user.name)}! Сюда будут приходить напоминания об уроках, отчёт и всё важное. Ничего нажимать не нужно.`)
  if (hooks.onLinked) await hooks.onLinked(updated, lesson).catch((error) => console.error('[telegram] linked', error.message))
}

// --- Students without email: invited and signed in through the bot -------------
// The teacher's invitation (Invite.viaTelegram) is t.me/<bot>?start=i_<token>.
// Start makes the student's account (a placeholder .invalid email, a random
// password nobody knows), links it to the teacher and to this chat. Signing
// in is /login (or the button): a one-time link, 10 minutes, per student on
// this chat — a parent with two children gets a button for each.

const LOGIN_TTL_MS = 10 * 60_000
const loginTokens = new Map() // token → { userId, expires }

async function handleInvite(message, token) {
  const chatId = String(message.chat.id)
  const invite = await prisma.invite.findUnique({ where: { token } })
  if (!invite || !invite.viaTelegram) return reply(chatId, 'Приглашение не найдено. Попросите учителя прислать ссылку ещё раз.')
  if (invite.acceptedAt) {
    const made = await prisma.user.findUnique({ where: { email: invite.email } })
    if (made?.telegramChatId === chatId) return sendLoginLinks(chatId, `Аккаунт «${esc(made.name)}» уже создан.`)
    return reply(chatId, 'Это приглашение уже использовано. Если это ваш аккаунт, нажмите /login в том Telegram, где его создавали, или попросите учителя прислать новое приглашение.')
  }
  if (invite.expiresAt < new Date()) return reply(chatId, 'Срок приглашения истёк. Попросите учителя прислать новое.')

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email: invite.email,
        name: invite.name,
        passwordHash: crypto.randomBytes(32).toString('hex'),
        role: 'STUDENT',
        schoolId: invite.schoolId
      }
    })
    await tx.teacherStudent.create({ data: { teacherId: invite.invitedById, studentId: created.id } })
    await tx.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } })
    return created
  })
  await linkChat(message, user, null, { quiet: true })
  return sendLoginLinks(chatId, `Готово! Аккаунт «${esc(user.name)}» создан ✅\nСюда будут приходить напоминания об уроках.`)
}

// The buttons that sign this chat's students in.
async function sendLoginLinks(chatId, intro = null) {
  const students = await prisma.user.findMany({ where: { telegramChatId: String(chatId), role: 'STUDENT' }, select: { id: true, name: true }, orderBy: { createdAt: 'asc' } })
  if (!students.length) {
    return reply(chatId, `${intro ? `${intro}\n\n` : ''}К этому Telegram не привязан ни один ученик. Учитель может прислать вам приглашение в Telegram, или напишите сюда почту, с которой входите на платформу.`)
  }
  const now = Date.now()
  for (const [token, entry] of loginTokens) if (entry.expires < now) loginTokens.delete(token)
  const buttons = students.map((student) => {
    const token = crypto.randomBytes(24).toString('base64url')
    loginTokens.set(token, { userId: student.id, expires: now + LOGIN_TTL_MS })
    return [{ text: students.length > 1 ? `Войти как ${student.name}` : 'Войти на платформу', url: `${APP_URL()}/tg-login/${token}` }]
  })
  const text = `${intro ? `${intro}\n\n` : ''}Нажмите, чтобы войти на платформу. Кнопка работает один раз и 10 минут — новую всегда можно получить командой /login.`
  return tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', reply_markup: { inline_keyboard: buttons } })
    .catch((error) => console.error('[telegram] login links', error.message))
}

// POST /api/auth/telegram-login/:token — the user it signs in, once.
export function useLoginToken(token) {
  const entry = loginTokens.get(String(token))
  loginTokens.delete(String(token))
  if (!entry || entry.expires < Date.now()) return null
  return entry.userId
}

// --- Connecting from Telegram itself -------------------------------------------
// Someone finds the bot on their own: they write the email they sign in with,
// a 6-digit code goes to that address, they send the code back — connected.
// The code proves the address is theirs; the bot answers the same whether
// the email exists or not, so it can't be used to find out who is a student.

const CONNECT_HELP = 'Здравствуйте! Это бот школы Advent Academy.\n\nЧтобы получать сюда напоминания об уроках, напишите почту, с которой вы входите на платформу, — я пришлю на неё код.\n\nЕсли вы записались на пробный урок и почты на платформе у вас нет, откройте ссылку на урок и нажмите там «Напоминания в Telegram».'
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const CODE_TTL_MS = 15 * 60_000
const CODE_TRIES = 5
const pendingCodes = new Map() // chatId → { userId, hash, expires, tries }
const codeRequests = new Map() // "chat:<id>" | "email:<address>" → request times
const hashCode = (code) => crypto.createHash('sha256').update(code).digest()

// At most 3 codes an hour per chat and per address.
function mayRequestCode(key) {
  const hour = Date.now() - 60 * 60_000
  const recent = (codeRequests.get(key) ?? []).filter((t) => t > hour)
  if (recent.length >= 3) return false
  codeRequests.set(key, [...recent, Date.now()])
  return true
}

async function handleEmail(message, email) {
  const chatId = String(message.chat.id)
  email = email.toLowerCase()
  if (!mayRequestCode(`chat:${chatId}`) || !mayRequestCode(`email:${email}`)) {
    return reply(chatId, 'Слишком много попыток. Попробуйте через час.')
  }
  const user = email.endsWith('.invalid') ? null : await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, email: true } })
  if (user) {
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
    pendingCodes.set(chatId, { userId: user.id, hash: hashCode(code), expires: Date.now() + CODE_TTL_MS, tries: 0 })
    const sent = await sendTelegramCodeEmail({ to: user.email, name: user.name, code })
    // Local development without a mail service: the code is in the server log.
    if (!sent.sent && !mailEnabled() && process.env.NODE_ENV !== 'production') console.log(`[telegram] code for ${email}: ${code}`)
  }
  return reply(chatId, `Если <b>${esc(email)}</b> есть на платформе, туда пришло письмо с кодом из 6 цифр. Отправьте код сюда.\n\nПисьма нет — проверьте «Спам» или напишите почту ещё раз.`)
}

async function handleCode(message, code) {
  const chatId = String(message.chat.id)
  const pending = pendingCodes.get(chatId)
  if (!pending || pending.expires < Date.now()) {
    pendingCodes.delete(chatId)
    return reply(chatId, 'Код устарел. Напишите почту ещё раз — пришлю новый.')
  }
  if (!crypto.timingSafeEqual(hashCode(code), pending.hash)) {
    pending.tries += 1
    if (pending.tries >= CODE_TRIES) {
      pendingCodes.delete(chatId)
      return reply(chatId, 'Код не подошёл несколько раз. Напишите почту ещё раз — пришлю новый.')
    }
    return reply(chatId, 'Код не подошёл. Проверьте цифры в письме.')
  }
  pendingCodes.delete(chatId)
  const user = await prisma.user.findUnique({ where: { id: pending.userId } })
  if (!user) return reply(chatId, 'Аккаунт не найден. Напишите почту ещё раз.')
  return linkChat(message, user)
}

// «Подтверждаю» under a new trial lesson: only its teacher's chat counts.
async function handleCallback(query) {
  const data = String(query.data ?? '')
  const chatId = String(query.message?.chat?.id ?? query.from?.id ?? '')
  const answer = (text) => tg('answerCallbackQuery', { callback_query_id: query.id, text }).catch(() => {})
  const m = data.match(/^c:(.+)$/)
  if (!m) return answer('')
  const lesson = await prisma.adventLesson.findUnique({ where: { id: m[1] } })
  const teacher = lesson ? await prisma.user.findUnique({ where: { id: lesson.teacherId }, select: { telegramChatId: true } }) : null
  if (!lesson || teacher?.telegramChatId !== chatId) return answer('Этот урок у другого преподавателя')
  if (lesson.status === 'cancelled') return answer('Урок отменён')
  if (!lesson.teacherConfirmedAt) await prisma.adventLesson.update({ where: { id: lesson.id }, data: { teacherConfirmedAt: new Date() } })
  await answer('Спасибо! Урок подтверждён ✅')
  // The button goes; the link to the lesson stays.
  const keep = (query.message?.reply_markup?.inline_keyboard ?? []).map((row) => row.filter((b) => !b.callback_data)).filter((row) => row.length)
  await tg('editMessageReplyMarkup', { chat_id: chatId, message_id: query.message?.message_id, reply_markup: { inline_keyboard: keep } }).catch(() => {})
  await reply(chatId, 'Урок подтверждён ✅')
}

async function handleUpdate(update) {
  if (update.callback_query) return handleCallback(update.callback_query)
  // Blocked the bot: the chat is forgotten.
  if (update.my_chat_member?.new_chat_member?.status === 'kicked') {
    await prisma.user.updateMany({ where: { telegramChatId: String(update.my_chat_member.chat.id) }, data: { telegramChatId: null } })
    return
  }
  const message = update.message
  if (!message?.chat || message.chat.type !== 'private') return
  const text = String(message.text ?? '').trim()
  const start = text.match(/^\/start(?:@\w+)?(?:\s+(\S+))?/)
  if (start) return handleStart(message, start[1])
  if (/^\/login\b/.test(text) || /^войти$/i.test(text)) return sendLoginLinks(message.chat.id)
  if (/^\/stop\b/.test(text)) {
    await prisma.user.updateMany({ where: { telegramChatId: String(message.chat.id) }, data: { telegramChatId: null } })
    return reply(message.chat.id, 'Отключено, сообщений больше не будет. Чтобы подключиться снова, напишите сюда свою почту.')
  }
  if (EMAIL.test(text)) return handleEmail(message, text)
  if (/^\d{6}$/.test(text.replace(/\s/g, '')) && pendingCodes.has(String(message.chat.id))) return handleCode(message, text.replace(/\s/g, ''))
  const known = await prisma.user.findFirst({ where: { telegramChatId: String(message.chat.id) }, select: { id: true } })
  if (!known) return reply(message.chat.id, CONNECT_HELP)
  const help = supportContact()
  return reply(message.chat.id, `Я присылаю напоминания и не читаю сообщения.${help ? ` По любым вопросам: ${esc(help)}` : ''}`)
}

// Long polling: works behind anything and needs no public address. A new
// token starts a new loop; the old one ends after its current request.
function startPolling() {
  const generation = ++state.generation
  if (!botToken()) return
  ;(async () => {
    while (generation === state.generation && botToken()) {
      try {
        const updates = await tg('getUpdates', { offset: state.offset, timeout: 50, allowed_updates: ['message', 'callback_query', 'my_chat_member'] }, 65000)
        for (const update of updates) {
          state.offset = update.update_id + 1
          await handleUpdate(update).catch((error) => console.error('[telegram] update', error.message))
        }
      } catch (error) {
        if (generation !== state.generation) return
        if (error.code === 409) await tg('deleteWebhook', {}).catch(() => {})
        console.error('[telegram] poll', error.code ?? '', error.message)
        await new Promise((resolve) => setTimeout(resolve, error.code === 401 ? 60000 : 5000))
      }
    }
  })()
}

export const appUrl = APP_URL
