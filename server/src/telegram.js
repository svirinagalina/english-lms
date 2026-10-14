import crypto from 'crypto'
import { prisma } from './db.js'
import { encrypt, decrypt, supportContact } from './settings.js'

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

const state = { token: null, username: null, on: false, onSince: null, bookingUrl: null, generation: 0, offset: 0 }
export const botToken = () => process.env.TELEGRAM_BOT_TOKEN || state.token
export const botUsername = () => state.username
// Messages to students, teachers and the owner (not the replies to /start).
export const botOn = () => Boolean(botToken() && state.on)
export const botOnSince = () => state.onSince ?? new Date()
// «Выбрать время»: the platform's own booking page unless Settings says otherwise.
export const bookingUrl = () => state.bookingUrl || `${APP_URL()}/trial`
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
  const rows = await prisma.platformSetting.findMany({ where: { key: { in: ['telegram.token', 'telegram.username', 'telegram.on', 'telegram.onSince', 'telegram.bookingUrl'] } } })
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  try { state.token = map['telegram.token'] ? decrypt(map['telegram.token']) : null } catch { state.token = null }
  state.username = map['telegram.username'] || null
  state.on = map['telegram.on'] === 'on'
  state.onSince = map['telegram.onSince'] ? new Date(map['telegram.onSince']) : null
  state.bookingUrl = map['telegram.bookingUrl'] || null
  if (botToken() && !state.username) {
    try { state.username = (await tg('getMe')).username } catch (error) { console.error('[telegram] getMe', error.message) }
  }
  startPolling()
}

// A token is checked with Telegram before it is kept.
export async function saveBotToken(token) {
  if (!token) {
    await prisma.platformSetting.deleteMany({ where: { key: { in: ['telegram.token', 'telegram.username'] } } })
    return loadBotSettings()
  }
  let me
  try { me = await call(token, 'getMe') } catch (error) {
    throw Object.assign(new Error(`Telegram did not accept this key: ${error.message}`), { status: 400 })
  }
  // Polling and a webhook can't both be on.
  await call(token, 'deleteWebhook', {}).catch(() => {})
  await prisma.$transaction([put('telegram.token', encrypt(token)), put('telegram.username', me.username)])
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
    const lesson = await prisma.adventLesson.findFirst({ where: p.startsWith('l_') ? { studentToken: token } : { teacherToken: token } })
    if (!lesson) return null
    return { userId: p.startsWith('l_') ? lesson.studentUserId : lesson.teacherId, lesson }
  }
  const m = p.match(/^u_([A-Za-z0-9]+)_([A-Za-z0-9_-]{16})$/)
  if (m && crypto.timingSafeEqual(Buffer.from(m[2]), Buffer.from(signature(m[1])))) return { userId: m[1] }
  return null
}

const reply = (chatId, text) => tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true })
  .catch((error) => console.error('[telegram] reply', error.message))

const hooks = { onLinked: null }
// bot.js sends the lesson's confirmation right after a student connects.
export const onLinked = (fn) => { hooks.onLinked = fn }

async function handleStart(message, param) {
  const chatId = String(message.chat.id)
  if (!param) {
    const known = await prisma.user.findFirst({ where: { telegramChatId: chatId }, select: { name: true } })
    return reply(chatId, known
      ? `Вы подключены, ${esc(known.name)} ✅ Сюда приходят напоминания об уроках.`
      : 'Здравствуйте! Это бот школы Advent Academy. Чтобы получать напоминания об уроках, откройте свою ссылку на урок и нажмите там «Напоминания в Telegram».')
  }
  const found = await whoStarts(param)
  if (!found) return reply(chatId, 'Ссылка не подошла. Откройте её ещё раз со страницы урока или из профиля на платформе.')
  if (!found.userId) return reply(chatId, 'Сначала откройте ссылку на урок и введите своё имя, потом снова нажмите «Напоминания в Telegram».')
  const user = await prisma.user.findUnique({ where: { id: found.userId } })
  if (!user) return reply(chatId, 'Ссылка не подошла.')
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
  await reply(chatId, staff
    ? `Готово, ${esc(user.name)}! Сюда будут приходить новые пробные уроки, напоминания и оплаты учеников.`
    : `Готово, ${esc(user.name)}! Сюда будут приходить напоминания об уроках, отчёт и всё важное. Ничего нажимать не нужно.`)
  if (hooks.onLinked) await hooks.onLinked(updated, found.lesson).catch((error) => console.error('[telegram] linked', error.message))
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
  if (/^\/stop\b/.test(text)) {
    await prisma.user.updateMany({ where: { telegramChatId: String(message.chat.id) }, data: { telegramChatId: null } })
    return reply(message.chat.id, 'Отключено, сообщений больше не будет. Подключиться снова можно кнопкой на платформе.')
  }
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
