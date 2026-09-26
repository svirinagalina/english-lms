// Sets up an Advent trainer account, with full access, for every student
// already on the platform (new ones are enrolled when they join — see
// routes/invites.js; enrollStudent grants the access too).
// Safe to run again: the trainer finds an existing account by email.
//
//   node --env-file=.env scripts/trainer-enroll-all.js
//   (on the server: docker exec -w /app srv3-lms-app node scripts/trainer-enroll-all.js)
import { PrismaClient } from '@prisma/client'
import { loadAiSettings } from '../src/settings.js'
import { adventEnabled, enrollStudent } from '../src/advent.js'

const prisma = new PrismaClient()
await loadAiSettings()
if (!adventEnabled()) {
  console.error('The trainer is not connected (no key in Settings or ADVENT_PARTNER_KEY)')
  process.exit(1)
}

const students = await prisma.user.findMany({ where: { role: 'STUDENT' }, select: { email: true, name: true }, orderBy: { createdAt: 'asc' } })
let done = 0
const failed = []
for (const student of students) {
  if (await enrollStudent(student.email, student.name)) done++
  else failed.push(student.name)
  await new Promise((resolve) => setTimeout(resolve, 300)) // gently, one after another
}
console.log(`Trainer accounts with full access: ${done} of ${students.length}${failed.length ? ` · failed: ${failed.join(', ')}` : ''}`)
await prisma.$disconnect()
process.exit(0)
