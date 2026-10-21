// Errors told to the school's owner in Telegram (Galina, 2026-10-21: know
// about a problem before a student writes about it). Sources: a page that
// crashed or threw on someone's device (/api/diag), a request the server
// failed with a 500, and a promise the server dropped. Noise that is not ours
// (browser extensions, a dropped connection) is left in the diagnostic log only.
// The same error is told once per 6 hours, and at most 10 messages an hour go
// out; what was held back is counted in the next one.
import { prisma } from './db.js'
import { sendTo, esc, botToken } from './telegram.js'

const QUIET_MS = 6 * 60 * 60 * 1000
const PER_HOUR = 10

const NOISE = [
  /metamask|ethereum|web3|phantom|solana/i, // wallet extensions injecting into every page
  /chrome-extension:|moz-extension:|safari-(web-)?extension:/i,
  /^(TypeError: )?(Failed to fetch|Load failed|NetworkError when attempting to fetch resource\.?)$/i, // the connection, not the code
  /^ResizeObserver loop/i,
  /^Script error\.?$/i // a cross-origin script; nothing to read
]
export const isNoise = (message = '', stack = '') => NOISE.some((pattern) => pattern.test(message) || pattern.test(stack))

const lastTold = new Map()
let hour = { start: 0, count: 0, held: 0 }

// The owners of the user's school, or of the platform's own school (the
// oldest, as for sign-up) when the error belongs to nobody in particular.
async function owners(schoolId) {
  const school = schoolId
    ? { id: schoolId }
    : process.env.PUBLIC_SCHOOL_ID ? { id: process.env.PUBLIC_SCHOOL_ID } : await prisma.school.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } })
  if (!school) return []
  return prisma.user.findMany({ where: { schoolId: school.id, role: 'OWNER', telegramChatId: { not: null } }, select: { id: true, telegramChatId: true } })
}

// `signature` decides what counts as "the same error"; `lines` are shown as they are.
export async function tellOwners({ signature, title, lines, schoolId = null }) {
  if (!botToken()) return false
  const now = Date.now()
  const key = `${schoolId ?? '-'}|${signature}`.slice(0, 300)
  if (now - (lastTold.get(key) ?? 0) < QUIET_MS) return false
  if (now - hour.start > 60 * 60 * 1000) hour = { start: now, count: 0, held: hour.held }
  if (hour.count >= PER_HOUR) { hour.held += 1; return false }
  lastTold.set(key, now)
  hour.count += 1
  const held = hour.held
  hour.held = 0
  const text = [`⚠️ <b>${esc(title)}</b>`, ...lines.filter(Boolean).map((line) => esc(line).slice(0, 600)),
    held ? `<i>Ещё ${held} сообщ. об ошибках придержано, чтобы не засыпать — всё есть в диагностике.</i>` : null].filter(Boolean).join('\n')
  let sent = false
  for (const owner of await owners(schoolId).catch(() => [])) sent = (await sendTo(owner, text)) || sent
  return sent
}

const firstLine = (value) => String(value ?? '').split('\n')[0].slice(0, 200)

// A page error reported by a browser (see components/ErrorBoundary.jsx).
export function pageError({ user, name, kind, message, details, device }) {
  if (!['page.crash', 'page.error', 'page.rejection'].includes(kind)) return
  if (isNoise(message, details?.stack)) return
  const crashed = kind === 'page.crash'
  return tellOwners({
    signature: `${kind}|${firstLine(message)}`,
    schoolId: user.schoolId,
    title: crashed ? 'У человека не открылась страница' : 'Ошибка на странице',
    lines: [
      `Кто: ${name ?? user.id} (${user.role})`,
      details?.path ? `Где: ${details.path}` : null,
      `Что: ${firstLine(message)}`,
      device ? `Устройство: ${device.split(' · ')[0].slice(0, 160)}` : null,
      crashed ? 'Он видел «Что-то пошло не так» с кнопкой «Обновить».' : null
    ]
  }).catch(() => {})
}

// A request the server could not answer (500).
export function serverError(req, error) {
  return tellOwners({
    signature: `500|${req.method} ${req.route?.path ?? req.path}|${firstLine(error?.message)}`,
    schoolId: req.user?.schoolId ?? null,
    title: 'Сервер не смог выполнить запрос',
    lines: [`Запрос: ${req.method} ${req.originalUrl.split('?')[0].slice(0, 160)}`, `Ошибка: ${firstLine(error?.message ?? error)}`, req.user ? `Кто: ${req.user.role}` : null]
  }).catch(() => {})
}

// A promise nobody handled: the request it belonged to may have hung.
export function droppedError(reason) {
  return tellOwners({
    signature: `rejection|${firstLine(reason?.message ?? reason)}`,
    title: 'Ошибка внутри сервера',
    lines: [`Ошибка: ${firstLine(reason?.message ?? reason)}`, firstLine(String(reason?.stack ?? '').split('\n')[1]?.trim())]
  }).catch(() => {})
}
