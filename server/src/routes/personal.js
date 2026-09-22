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
  endTime: z.string().datetime()
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

// Calendar Events
personalRouter.get('/calendar', async (req, res) => {
  const { start, end } = req.query
  const where = { userId: req.user.id }

  if (start || end) {
    where.startTime = {}
    if (start) where.startTime.gte = new Date(start)
    if (end) where.startTime.lt = new Date(end)
  }

  const events = await prisma.userCalendarEvent.findMany({
    where,
    orderBy: { startTime: 'asc' }
  })
  res.json({ events })
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
      ...parsed.data,
      startTime,
      endTime,
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
      ...parsed.data,
      startTime,
      endTime
    }
  })
  res.json({ event: updated })
})

personalRouter.delete('/calendar/:id', async (req, res) => {
  const event = await prisma.userCalendarEvent.findFirst({
    where: { id: req.params.id, userId: req.user.id }
  })
  if (!event) return res.status(404).json({ error: 'Event not found' })

  await prisma.userCalendarEvent.delete({ where: { id: req.params.id } })
  res.json({ ok: true })
})
