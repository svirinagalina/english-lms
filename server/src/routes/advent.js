import { Router } from 'express'
import { requireAuth } from '../auth.js'
import { prisma } from '../db.js'
import { advent, adventEnabled } from '../advent.js'
import { accessibleClassroom } from './classrooms.js'

export const adventRouter = Router()
adventRouter.use(requireAuth)

const me = (req) => prisma.user.findUnique({ where: { id: req.user.id }, select: { email: true, name: true } })
const fail = (res, error) => res.status(error.status && error.status < 600 ? (error.status === 401 || error.status === 403 ? 502 : error.status) : 502).json({ error: error.message })

adventRouter.get('/status', (req, res) => res.json({ connected: adventEnabled() }))

// A fresh sign-in link for the trainer iframe: it lives five minutes and is
// used once, so it's made every time the page opens, never cached.
adventRouter.get('/trainer-link', async (req, res) => {
  try {
    const person = await me(req)
    const data = await advent('POST', '/session', { email: person.email, name: person.name })
    res.json({ url: data.embed_url, plan: data.plan ?? null, pro: Boolean(data.pro) })
  } catch (error) { fail(res, error) }
})

// Grammar topics by status. A student sees their own; staff see the student
// of a classroom they can open.
adventRouter.get('/progress', async (req, res) => {
  try {
    let email = (await me(req)).email
    if (req.query.classroomId && req.user.role !== 'STUDENT') {
      const classroom = await accessibleClassroom(req.user, String(req.query.classroomId))
      if (!classroom?.student) return res.status(404).json({ error: 'Classroom not found' })
      email = (await prisma.user.findUnique({ where: { id: classroom.student.id }, select: { email: true } })).email
    }
    res.json(await advent('GET', `/progress?email=${encodeURIComponent(email)}`))
  } catch (error) { fail(res, error) }
})
