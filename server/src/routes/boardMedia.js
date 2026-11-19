import { Router } from 'express'
import { randomBytes } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { requireAuth } from '../auth.js'
import { mayUseBoard } from '../boardAccess.js'

// Pictures put on a board by anyone who may draw on it — the teacher and,
// since 2026-11-19, the students too (Galina: "students should be able to
// add their drawings and pictures").
export const boardMediaRouter = Router()
boardMediaRouter.use(requireAuth)

const UPLOAD_ROOT = process.env.UPLOAD_DIR
  ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads')
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const IMAGE_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' }

boardMediaRouter.post('/:boardId/images', async (req, res) => {
  const board = await mayUseBoard(req.user, req.params.boardId)
  if (!board) return res.status(404).json({ error: 'Board not found' })

  const dataUrl = typeof req.body?.data === 'string' ? req.body.data : ''
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|gif|webp));base64,(.+)$/)
  if (!match) return res.status(400).json({ error: 'Only PNG, JPEG, GIF or WebP images are accepted' })

  const bytes = Buffer.from(match[2], 'base64')
  if (bytes.length > MAX_IMAGE_BYTES) return res.status(413).json({ error: 'Image is larger than 5 MB' })

  const fileName = `${randomBytes(12).toString('hex')}.${IMAGE_TYPES[match[1]]}`
  const directory = path.join(UPLOAD_ROOT, board.id.toLowerCase())
  await mkdir(directory, { recursive: true })
  await writeFile(path.join(directory, fileName), bytes)
  res.status(201).json({ src: `/uploads/${board.id.toLowerCase()}/${fileName}` })
})
