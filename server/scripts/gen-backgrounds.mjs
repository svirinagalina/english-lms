// One-off: draws the call backgrounds with OpenAI's image model, using the key
// saved in Settings. Writes JPEGs to the folder given as the first argument.
//   node scripts/gen-backgrounds.mjs /tmp/backgrounds
import fs from 'node:fs/promises'
import path from 'node:path'
import { loadAiSettings, aiConfig } from '../src/settings.js'

const SCENES = [
  {
    file: 'forest-house.jpg',
    prompt: 'Interior of a modern minimalist house in a pine forest, seen from inside: a large floor-to-ceiling window wall showing tall green pines and soft morning light, warm oak wood, light concrete, a few plants, calm and airy. Photorealistic, wide shot, no people, no text. The centre of the image is uncluttered so a person can sit in front of it on a video call.'
  },
  {
    file: 'sci-fi.jpg',
    prompt: 'Blade Runner style cyberpunk apartment interior at night: a wide window onto a rain-soaked neon city with holographic signs in magenta, cyan and orange, wet reflections, light haze, dark teal and warm amber tones. Evenly lit, cinematic, photorealistic, no people, no readable text. Important: no bright light source or glowing element in the centre of the image — the centre is a calm, medium-dark area so a person sitting in front of it on a video call is not backlit; the neon lights sit at the sides and top.'
  },
  {
    file: 'library.jpg',
    prompt: 'A cosy modern home library and study, in sharp focus: tall wooden bookshelves full of books, a warm brass reading lamp, soft daylight from a side window, muted green and cream tones, tasteful and calm. Photorealistic, crisp and detailed, no blur, no people, no readable text. The centre is uncluttered so a person can sit in front of it on a video call.'
  },
  {
    file: 'classroom.jpg',
    prompt: 'A very stylish modern room for English lessons: a light wall with a large clean dark-green chalkboard in a wooden frame, completely empty, no writing, no letters; on the chalkboard ledge a few coloured chalks. A wooden shelf with dictionaries and a small globe, a green plant, a warm desk lamp with a dusty-pink shade, a wooden desk, soft natural light, Scandinavian interior, cream and deep green tones. Photorealistic, wide shot, in focus, no people, absolutely no text or letters anywhere. It must read instantly as a classroom. The centre of the image is the calm empty chalkboard so a person can sit in front of it on a video call.'
  }
]

const outDir = process.argv[2] || '/tmp/backgrounds'
// Only these files, when named: node scripts/gen-backgrounds.mjs /tmp/bg sci-fi.jpg library.jpg
const only = process.argv.slice(3)
await fs.mkdir(outDir, { recursive: true })
await loadAiSettings()
const config = aiConfig()
if (!config || config.provider !== 'openai') throw new Error('An OpenAI key is needed (Settings → AI assistant)')

for (const scene of SCENES.filter((sc) => !only.length || only.includes(sc.file))) {
  process.stdout.write(`${scene.file}… `)
  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${config.key}` },
    body: JSON.stringify({ model: 'gpt-image-1', prompt: scene.prompt, size: '1536x1024', quality: 'medium', output_format: 'jpeg', output_compression: 85, n: 1 })
  })
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`)
  const data = await response.json()
  const b64 = data.data?.[0]?.b64_json
  if (!b64) throw new Error('No image in the response')
  await fs.writeFile(path.join(outDir, scene.file), Buffer.from(b64, 'base64'))
  console.log('ok')
}
