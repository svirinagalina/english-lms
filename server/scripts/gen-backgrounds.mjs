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
    prompt: 'Interior of a sleek science-fiction spaceship observation deck: a wide panoramic window onto deep space with a blue-purple nebula and distant stars, soft cyan and violet ambient lighting, clean white and dark-grey panels. Cinematic, photorealistic, no people, no text. The centre is uncluttered so a person can sit in front of it on a video call.'
  },
  {
    file: 'library.jpg',
    prompt: 'A cosy modern home library and study: tall wooden bookshelves with books, a warm reading lamp, soft daylight from a side window, muted green and cream tones, tasteful and calm. Photorealistic, slightly out of focus as a video-call background, no people, no text. The centre is uncluttered so a person can sit in front of it.'
  }
]

const outDir = process.argv[2] || '/tmp/backgrounds'
await fs.mkdir(outDir, { recursive: true })
await loadAiSettings()
const config = aiConfig()
if (!config || config.provider !== 'openai') throw new Error('An OpenAI key is needed (Settings → AI assistant)')

for (const scene of SCENES) {
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
