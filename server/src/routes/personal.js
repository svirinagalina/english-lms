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
  notes: z.string().max(2000).optional()
})

const eventSchema = z.object({
  title: z.string().trim().min(1).max(500),
  description: z.string().max(2000).optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  recurrence: z.string().optional(), // null | "WEEKLY"
  recurrenceEndDate: z.string().datetime().optional().nullable()
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
function generateRecurringInstances(event, rangeStart, rangeEnd) {
  if (!event.recurrence || event.recurrence !== 'WEEKLY') {
    return [event]
  }

  const instances = []
  const eventStart = new Date(event.startTime)
  const eventEnd = new Date(event.endTime)
  const duration = eventEnd - eventStart

  // Start from the first occurrence
  let currentDate = new Date(eventStart)
  const endDate = event.recurrenceEndDate ? new Date(event.recurrenceEndDate) : new Date(rangeEnd.getTime() + 365 * 24 * 60 * 60 * 1000)

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
    // Move to next week
    currentDate.setDate(currentDate.getDate() + 7)
  }

  return instances
}

// Calendar Events
personalRouter.get('/calendar', async (req, res) => {
  const { start, end } = req.query
  const rangeStart = start ? new Date(start) : new Date()
  const rangeEnd = end ? new Date(end) : new Date(rangeStart.getTime() + 365 * 24 * 60 * 60 * 1000)

  // Get all events (including recurring) that overlap with range
  const events = await prisma.userCalendarEvent.findMany({
    where: {
      userId: req.user.id,
      // Get events that could have instances in the range
      startTime: { lt: rangeEnd }
    },
    orderBy: { startTime: 'asc' }
  })

  // Expand recurring events into instances
  const allInstances = events.flatMap(event => generateRecurringInstances(event, rangeStart, rangeEnd))

  res.json({ events: allInstances })
})

personalRouter.post('/calendar', async (req, res) => {
  const parsed = eventSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid event data' })

  const startTime = new Date(parsed.data.startTime)
  const endTime = new Date(parsed.data.endTime)

  if (endTime <= startTime) {
    return res.status(400).json({ error: 'End time must be after start time' })
  }

  const event = await prisma.userCalendarEvent.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description,
      startTime,
      endTime,
      recurrence: parsed.data.recurrence || null,
      recurrenceEndDate: parsed.data.recurrenceEndDate ? new Date(parsed.data.recurrenceEndDate) : null,
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

  if (endTime <= startTime) {
    return res.status(400).json({ error: 'End time must be after start time' })
  }

  const updated = await prisma.userCalendarEvent.update({
    where: { id: req.params.id },
    data: {
      title: parsed.data.title,
      description: parsed.data.description,
      startTime,
      endTime,
      recurrence: parsed.data.recurrence || null,
      recurrenceEndDate: parsed.data.recurrenceEndDate ? new Date(parsed.data.recurrenceEndDate) : null
    }
  })
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

  res.json({ ok: true })
})
