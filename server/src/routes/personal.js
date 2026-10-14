import { cancelAdventLesson } from '../adventLessons.js'
import { timetableChanged } from '../bot.js'
import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db.js'
import { requireAuth } from '../auth.js'

export const personalRouter = Router()
personalRouter.use(requireAuth)

const todoSchema = z.object({
  title: z.string().trim().min(1).max(500),
  completed: z.boolean().optional(),
  dueDate: z.string().datetime().optional().nullable(),
  // The client round-trips a todo's own fields back on every update
  // (toggling done, editing) — a todo with no notes has notes: null from
  // the database, and .optional() alone rejects null, not just missing.
  notes: z.string().max(2000).optional().nullable()
})

const eventSchema = z.object({
  title: z.string().trim().min(1).max(500),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  studentIds: z.array(z.string()).default([]),
  // The page sends null for "No repeat": that was refused before, so no
  // one-off lesson could be saved at all.
  recurrence: z.enum(['WEEKLY']).nullable().optional(),
  recurrenceEndDate: z.string().datetime().optional().nullable(),
  // The browser's IANA zone (Intl), so weekly lessons keep their local time.
  timezone: z.string().max(64).optional().nullable()
})

// Todos
personalRouter.get('/todos', async (req, res) => {
  const todos = await prisma.userTodo.findMany({
    where: { userId: req.user.id },
    orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }]
  })
  res.json({ todos })
})

personalRouter.post('/todos', async (req, res) => {
  const parsed = todoSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid todo data' })

  const todo = await prisma.userTodo.create({
    data: {
      ...parsed.data,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      userId: req.user.id
    }
  })
  res.status(201).json({ todo })
})

personalRouter.patch('/todos/:id', async (req, res) => {
  const parsed = todoSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid todo data' })

  const todo = await prisma.userTodo.findFirst({
    where: { id: req.params.id, userId: req.user.id }
  })
  if (!todo) return res.status(404).json({ error: 'Todo not found' })

  const updated = await prisma.userTodo.update({
    where: { id: req.params.id },
    data: {
      ...parsed.data,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null
    }
  })
  res.json({ todo: updated })
})

personalRouter.delete('/todos/:id', async (req, res) => {
  const todo = await prisma.userTodo.findFirst({
    where: { id: req.params.id, userId: req.user.id }
  })
  if (!todo) return res.status(404).json({ error: 'Todo not found' })

  await prisma.userTodo.delete({ where: { id: req.params.id } })
  res.json({ ok: true })
})

// Helper to generate recurring event instances
const validZone = (zone) => {
  if (!zone) return null
  try { new Intl.DateTimeFormat('en', { timeZone: zone }); return zone } catch { return null }
}
// The local calendar parts of an instant in a zone.
function partsIn(date, zone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
    .formatToParts(date).filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)]))
  return parts
}
// The instant that reads as the same local time as `start`, `weeks` weeks later.
export function addWeeksInZone(start, weeks, zone) {
  const p = partsIn(start, zone)
  const wall = Date.UTC(p.year, p.month - 1, p.day + weeks * 7, p.hour, p.minute, p.second)
  // Find the UTC instant whose local reading is `wall` (two passes settle DST).
  let guess = wall
  for (let i = 0; i < 2; i++) {
    const q = partsIn(new Date(guess), zone)
    const reads = Date.UTC(q.year, q.month - 1, q.day, q.hour, q.minute, q.second)
    guess += wall - reads
  }
  return new Date(guess)
}

export function generateRecurringInstances(event, rangeStart, rangeEnd) {
  if (!event.recurrence || event.recurrence !== 'WEEKLY') {
    return [event]
  }

  const instances = []
  const eventStart = new Date(event.startTime)
  const eventEnd = new Date(event.endTime)
  const duration = eventEnd - eventStart

  // Each week at the same wall-clock time in the creator's zone, so a
  // lesson at 15:00 stays at 15:00 after the clocks change (adding 7×24 h
  // in UTC moved every weekly lesson by an hour in late October).
  const zone = validZone(event.timezone) ?? 'Europe/Madrid'
  const endDate = event.recurrenceEndDate ? new Date(event.recurrenceEndDate) : new Date(rangeEnd.getTime() + 365 * 24 * 60 * 60 * 1000)
  let week = 0
  let currentDate = new Date(eventStart)

  while (currentDate <= endDate && currentDate < rangeEnd) {
    if (currentDate >= rangeStart) {
      instances.push({
        ...event,
        startTime: new Date(currentDate),
        endTime: new Date(currentDate.getTime() + duration),
        // Include parent event ID for identification
        _isInstance: true,
        _parentId: event.id
      })
    }
    week += 1
    currentDate = addWeeksInZone(eventStart, week, zone)
  }

  return instances
}

// Calendar Events
personalRouter.get('/calendar', async (req, res) => {
  const { start, end } = req.query
  const rangeStart = start ? new Date(start) : new Date()
  const rangeEnd = end ? new Date(end) : new Date(rangeStart.getTime() + 365 * 24 * 60 * 60 * 1000)

  // Get all events (including recurring) that overlap with range
  // A teacher sees their own plan; a student sees the lessons their
  // teachers put them in (their own list used to be always empty).
  const events = await prisma.userCalendarEvent.findMany({
    where: {
      ...(req.user.role === 'STUDENT'
        ? { studentIds: { has: req.user.id }, user: { schoolId: req.user.schoolId } }
        : { userId: req.user.id }),
      // Get events that could have instances in the range
      startTime: { lt: rangeEnd }
    },
    orderBy: { startTime: 'asc' }
  })

  // Collect all student IDs from events
  const allStudentIds = new Set()
  events.forEach(event => {
    if (event.studentIds && Array.isArray(event.studentIds)) {
      event.studentIds.forEach(id => allStudentIds.add(id))
    }
  })

  // Fetch all mentioned students
  const students = await prisma.user.findMany({
    where: { id: { in: Array.from(allStudentIds) } },
    select: { id: true, name: true }
  })
  const studentMap = new Map(students.map(s => [s.id, s]))
  // Lessons booked on the Advent site carry their link, for "Cancel lesson".
  const advent = new Map((await prisma.adventLesson.findMany({
    where: { calendarEventId: { in: events.map((e) => e.id) } }, select: { id: true, kind: true, source: true, calendarEventId: true }
  })).map((a) => [a.calendarEventId, { id: a.id, kind: a.kind, source: a.source }]))

  // Expand recurring events into instances
  const allInstances = events.flatMap(event => {
    const instances = generateRecurringInstances(event, rangeStart, rangeEnd)
    return instances.map(inst => ({
      ...inst,
      advent: req.user.role === 'STUDENT' ? null : advent.get(event.id) ?? null,
      students: (inst.studentIds || []).map(id => studentMap.get(id)).filter(Boolean)
    }))
  })

  res.json({ events: allInstances })
})

// A lesson booked on Advent, cancelled from the platform: Advent is told
// (it warns the student and Maxim) and the lesson leaves the Timetable.
personalRouter.post('/advent-lessons/:id/cancel', async (req, res) => {
  if (req.user.role === 'STUDENT') return res.status(403).json({ error: 'Only staff can cancel lessons' })
  const reason = String(req.body?.reason ?? '').trim().slice(0, 300)
  if (!reason) return res.status(400).json({ error: 'Write the reason' })
  try {
    await cancelAdventLesson(req.params.id, req.user, reason)
    res.json({ ok: true })
  } catch (error) {
    res.status(error.status ?? 502).json({ error: error.message })
  }
})

personalRouter.post('/calendar', async (req, res) => {
  const parsed = eventSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid event data' })

  const startTime = new Date(parsed.data.startTime)
  const endTime = new Date(parsed.data.endTime)

  const event = await prisma.userCalendarEvent.create({
    data: {
      title: parsed.data.title,
      startTime,
      endTime,
      studentIds: parsed.data.studentIds || [],
      recurrence: parsed.data.recurrence || null,
      recurrenceEndDate: parsed.data.recurrenceEndDate ? new Date(parsed.data.recurrenceEndDate) : null,
      timezone: validZone(parsed.data.timezone),
      userId: req.user.id
    }
  })
  res.status(201).json({ event })
})

personalRouter.patch('/calendar/:id', async (req, res) => {
  const parsed = eventSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid event data' })

  const event = await prisma.userCalendarEvent.findFirst({
    where: { id: req.params.id, userId: req.user.id }
  })
  if (!event) return res.status(404).json({ error: 'Event not found' })

  const startTime = new Date(parsed.data.startTime)
  const endTime = new Date(parsed.data.endTime)

  const updated = await prisma.userCalendarEvent.update({
    where: { id: req.params.id },
    data: {
      title: parsed.data.title,
      startTime,
      endTime,
      studentIds: parsed.data.studentIds || [],
      recurrence: parsed.data.recurrence || null,
      recurrenceEndDate: parsed.data.recurrenceEndDate ? new Date(parsed.data.recurrenceEndDate) : null,
      ...(validZone(parsed.data.timezone) ? { timezone: validZone(parsed.data.timezone) } : {})
    }
  })
  // Moved: the students hear of it in Telegram.
  timetableChanged(event, updated).catch((error) => console.error('[bot] timetable', error.message))
  res.json({ event: updated })
})

personalRouter.delete('/calendar/:id', async (req, res) => {
  const { deleteAll } = req.query
  const event = await prisma.userCalendarEvent.findFirst({
    where: { id: req.params.id, userId: req.user.id }
  })
  if (!event) return res.status(404).json({ error: 'Event not found' })

  if (deleteAll === 'true' && event.recurrence) {
    // Delete all instances of recurring event by removing the recurrence
    // and deleting the base event - all instances will be gone
    await prisma.userCalendarEvent.delete({ where: { id: req.params.id } })
  } else {
    // Delete only this single instance
    await prisma.userCalendarEvent.delete({ where: { id: req.params.id } })
  }
  timetableChanged(event, null).catch((error) => console.error('[bot] timetable', error.message))

  res.json({ ok: true })
})
