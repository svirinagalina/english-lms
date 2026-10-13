import http2 from 'http2'
import { createPrivateKey, sign } from 'crypto'
import { prisma } from './db.js'
import { apnsConfig } from './settings.js'
import { generateRecurringInstances } from './routes/personal.js'

// Push notifications to the iOS app, straight to Apple's APNs over HTTP/2
// with token auth (the .p8 key saved in Settings, or APNS_KEY / APNS_KEY_ID /
// APNS_TEAM_ID in the environment). Without a key nothing is sent and nothing
// fails. Every sender here is fire-and-forget: a push must never break the
// action that caused it.

export const BUNDLE_ID = process.env.APNS_BUNDLE_ID || 'online.adventacademy.lms'
const HOSTS = { production: 'https://api.push.apple.com', sandbox: 'https://api.sandbox.push.apple.com' }

export const pushEnabled = () => Boolean(apnsConfig())

// Apple wants a fresh provider token at most every hour and no more often
// than every 20 minutes: one per 50 minutes.
let tokenCache = null
function providerToken(config) {
  const now = Math.floor(Date.now() / 1000)
  if (tokenCache && tokenCache.keyId === config.keyId && now - tokenCache.at < 50 * 60) return tokenCache.token
  const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const unsigned = `${part({ alg: 'ES256', kid: config.keyId })}.${part({ iss: config.teamId, iat: now })}`
  const signature = sign('sha256', Buffer.from(unsigned), { key: createPrivateKey(config.key), dsaEncoding: 'ieee-p1363' })
  tokenCache = { token: `${unsigned}.${signature.toString('base64url')}`, at: now, keyId: config.keyId }
  return tokenCache.token
}

// Checks a key before it is saved: it must be an EC private key we can sign with.
export function validApnsKey(pem) {
  try {
    sign('sha256', Buffer.from('test'), { key: createPrivateKey(pem), dsaEncoding: 'ieee-p1363' })
    return true
  } catch {
    return false
  }
}

const connections = {}
function connection(env) {
  const existing = connections[env]
  if (existing && !existing.closed && !existing.destroyed) return existing
  const client = http2.connect(HOSTS[env])
  client.on('error', (error) => console.error(`APNs (${env}) connection:`, error.message))
  client.on('goaway', () => client.close())
  client.setTimeout(10 * 60 * 1000, () => client.close())
  connections[env] = client
  return client
}

function post(env, deviceToken, payload, config) {
  return new Promise((resolve) => {
    let request
    try {
      request = connection(env).request({
        ':method': 'POST',
        ':path': `/3/device/${deviceToken}`,
        authorization: `bearer ${providerToken(config)}`,
        'apns-topic': BUNDLE_ID,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'content-type': 'application/json'
      })
    } catch (error) {
      return resolve({ status: 0, reason: error.message })
    }
    let status = 0
    let body = ''
    request.setTimeout(15000, () => { request.close(); resolve({ status: 0, reason: 'timeout' }) })
    request.on('response', (headers) => { status = headers[':status'] })
    request.on('data', (chunk) => { body += chunk })
    request.on('end', () => {
      let reason = ''
      try { reason = JSON.parse(body).reason ?? '' } catch { /* 200 has no body */ }
      resolve({ status, reason })
    })
    request.on('error', (error) => resolve({ status: 0, reason: error.message }))
    request.end(JSON.stringify(payload))
  })
}

// A token from a build run out of Xcode belongs to Apple's sandbox: the
// production server calls it a BadDeviceToken, so it is tried there once and
// remembered. A token Apple no longer knows is deleted.
async function sendToDevice(device, payload, config) {
  let result = await post(device.sandbox ? 'sandbox' : 'production', device.token, payload, config)
  if (result.status === 400 && result.reason === 'BadDeviceToken' && !device.sandbox) {
    const sandbox = await post('sandbox', device.token, payload, config)
    if (sandbox.status === 200) {
      await prisma.pushDevice.update({ where: { id: device.id }, data: { sandbox: true } }).catch(() => {})
      return true
    }
    result = sandbox
  }
  if (result.status === 200) return true
  if (result.status === 410 || result.reason === 'BadDeviceToken' || result.reason === 'Unregistered') {
    await prisma.pushDevice.deleteMany({ where: { id: device.id } }).catch(() => {})
  } else {
    console.error('Push not delivered:', result.status, result.reason)
  }
  return false
}

// { title, body, url }: url is the page the app opens when the notification
// is tapped (/call/…, /classroom/…). Returns how many phones got it.
export async function notify(userIds, { title, body, url }) {
  const config = apnsConfig()
  const ids = [...new Set((userIds ?? []).filter(Boolean))]
  if (!config || !ids.length) return 0
  const devices = await prisma.pushDevice.findMany({ where: { userId: { in: ids } } })
  const payload = { aps: { alert: { title, body }, sound: 'default' }, url: url ?? '/' }
  let delivered = 0
  for (const device of devices) if (await sendToDevice(device, payload, config)) delivered += 1
  return delivered
}

const quietly = (promise) => promise.catch((error) => console.error('Push failed:', error.message))

// Sent at most once per key, even across restarts (the key is recorded).
async function once(key, send) {
  try {
    await prisma.pushSent.create({ data: { key } })
  } catch {
    return // already sent
  }
  await send()
}

// --- What the app is told about ------------------------------------------------

// The teacher started a call: its student (or every student of the board).
export function notifyCallStarted(callId) {
  quietly((async () => {
    if (!pushEnabled()) return
    const call = await prisma.call.findUnique({
      where: { id: callId },
      select: {
        token: true,
        host: { select: { name: true } },
        classroom: { select: { studentId: true } },
        board: { select: { classroom: { select: { studentId: true } }, sharedWith: { select: { studentId: true } } } }
      }
    })
    if (!call) return
    const students = [call.classroom?.studentId, call.board?.classroom?.studentId, ...(call.board?.sharedWith ?? []).map((c) => c.studentId)]
    await notify(students, { title: 'Your lesson has started', body: `${call.host.name} is waiting for you — tap to join.`, url: `/call/${call.token}` })
  })())
}

// New homework on a board: a few minutes later (the teacher is still typing
// it), if the heading is still there, its students are told.
const HOMEWORK_DELAY_MS = 3 * 60 * 1000
export function notifyHomeworkLater(boardId, elementId, stillThere) {
  if (!pushEnabled()) return
  setTimeout(() => quietly((async () => {
    if (!(await stillThere())) return
    const board = await prisma.board.findUnique({
      where: { id: boardId },
      select: { classroom: { select: { id: true, studentId: true, teacher: { select: { name: true } } } }, sharedWith: { select: { id: true, studentId: true } } }
    })
    if (!board) return
    const rooms = [board.classroom, ...board.sharedWith].filter((c) => c?.studentId)
    await once(`homework:${elementId}`, async () => {
      for (const room of rooms) {
        await notify([room.studentId], {
          title: 'New homework',
          body: `${board.classroom.teacher.name} has set your homework — it is on your board.`,
          url: `/classroom/${room.id}?board=${boardId}&focus=${elementId}`
        })
      }
    })
  })()), HOMEWORK_DELAY_MS)
}

// After a lesson: the mistakes and words it added. Sent once the session has
// stayed closed past the resume window (a reconnect continues the lesson).
const AFTER_LESSON_DELAY_MS = 16 * 60 * 1000
export function notifyAfterLessonLater(sessionId) {
  if (!pushEnabled()) return
  setTimeout(() => quietly((async () => {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { startedAt: true, endedAt: true, classroom: { select: { studentId: true } } }
    })
    const studentId = session?.classroom?.studentId
    if (!session?.endedAt || !studentId) return
    const [mistakes, words] = await Promise.all([
      prisma.lessonMistake.count({ where: { studentId, createdAt: { gte: session.startedAt } } }),
      prisma.vocabCard.count({ where: { set: { ownerId: studentId }, createdAt: { gte: session.startedAt } } })
    ])
    if (!mistakes && !words) return
    const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
    const parts = [mistakes && plural(mistakes, 'mistake to fix', 'mistakes to fix'), words && plural(words, 'new word', 'new words')].filter(Boolean)
    await once(`lesson:${sessionId}`, () => notify([studentId], {
      title: 'After today\'s lesson',
      body: `${parts.join(' and ')} — a few minutes of practice keeps them.`,
      url: mistakes ? '/practice/mistakes' : '/vocabulary?review=1'
    }))
  })()), AFTER_LESSON_DELAY_MS)
}

// Someone left a request on the website: the school's owners.
export function notifyLead(lead) {
  quietly((async () => {
    if (!pushEnabled()) return
    const owners = await prisma.user.findMany({ where: { schoolId: lead.schoolId, role: 'OWNER' }, select: { id: true } })
    await notify(owners.map((o) => o.id), { title: 'New request from the IELTS / TOEFL page', body: [lead.name, lead.messenger || lead.email].filter(Boolean).join(' · '), url: '/people' })
  })())
}

// A free user asked for a trial lesson: the school's owner.
export function notifyTrialRequest(user) {
  quietly((async () => {
    if (!pushEnabled()) return
    const owners = await prisma.user.findMany({ where: { schoolId: user.schoolId, role: 'OWNER' }, select: { id: true } })
    await notify(owners.map((o) => o.id), { title: 'Trial lesson request', body: `${user.name} (${user.email}) would like a trial lesson.`, url: '/people' })
  })())
}

// Lesson reminders: every minute, the Timetable lessons (Calendar events with
// students) starting within the next 15 minutes remind their students — once
// per lesson date.
const REMIND_BEFORE_MS = 15 * 60 * 1000
async function sendReminders() {
  if (!pushEnabled()) return
  const now = new Date()
  const horizon = new Date(now.getTime() + REMIND_BEFORE_MS)
  const events = await prisma.userCalendarEvent.findMany({
    where: {
      studentIds: { isEmpty: false },
      startTime: { lte: horizon },
      OR: [
        { recurrence: null, startTime: { gt: now } },
        { recurrence: 'WEEKLY', OR: [{ recurrenceEndDate: null }, { recurrenceEndDate: { gte: now } }] }
      ]
    },
    include: { user: { select: { name: true, schoolId: true } } }
  })
  for (const event of events) {
    for (const lesson of generateRecurringInstances(event, now, horizon)) {
      const start = new Date(lesson.startTime)
      if (start <= now || start > horizon) continue
      // Only students of the teacher's own school.
      const students = await prisma.user.findMany({ where: { id: { in: event.studentIds }, schoolId: event.user.schoolId }, select: { id: true } })
      const minutes = Math.max(1, Math.round((start - now) / 60000))
      await once(`remind:${event.id}:${start.toISOString()}`, () => notify(students.map((s) => s.id), {
        title: 'Lesson soon',
        body: `${event.title} with ${event.user.name} starts in ${minutes} min.`,
        url: '/'
      }))
    }
  }
}

export function startPushJobs() {
  setInterval(() => quietly(sendReminders()), 60 * 1000)
  // The once-only log only needs to cover the last few weeks.
  setInterval(() => quietly(prisma.pushSent.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } })), 24 * 60 * 60 * 1000)
}
