// After the build: a brotli twin next to every large text/wasm asset, so the
// server can hand out a fifth of the bytes (the blur runtime alone is 12 MB).
import { readdirSync, statSync, readFileSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { brotliCompressSync, constants } from 'zlib'

const root = new URL('../dist/', import.meta.url).pathname
const EXT = new Set(['.js', '.css', '.wasm', '.tflite', '.svg', '.json', '.html'])
const MIN = 4096
let files = 0, before = 0, after = 0
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const file = join(dir, name)
    const info = statSync(file)
    if (info.isDirectory()) { walk(file); continue }
    if (!EXT.has(extname(name)) || info.size < MIN) continue
    const data = readFileSync(file)
    const packed = brotliCompressSync(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 10, [constants.BROTLI_PARAM_SIZE_HINT]: data.length } })
    writeFileSync(`${file}.br`, packed)
    files++; before += data.length; after += packed.length
  }
}
walk(root)
console.log(`precompressed ${files} files: ${(before / 1e6).toFixed(1)} MB → ${(after / 1e6).toFixed(1)} MB`)
