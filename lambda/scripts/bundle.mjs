// Produces deployable zip bundles for each Lambda handler.
// Run after `npm run build` (creates dist/).
// Output: dist/http.zip, dist/websocket.zip

import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import archiver from 'archiver'
import { createWriteStream, existsSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const dist = resolve(root, 'dist')

if (!existsSync(dist)) {
  console.error('dist/ not found — run `npm run build` first.')
  process.exit(1)
}

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))

// Write a minimal package.json inside dist so node_modules resolves at runtime.
writeFileSync(
  resolve(dist, 'package.json'),
  JSON.stringify(
    {
      name: pkg.name,
      version: pkg.version,
      type: 'commonjs',
      dependencies: pkg.dependencies ?? {},
    },
    null,
    2,
  ) + '\n',
)

// Install production deps into dist/node_modules
execSync('npm install --omit=dev --silent --no-audit --no-fund', { cwd: dist, stdio: 'inherit' })

async function zipHandler(entry, zipName) {
  const out = resolve(dist, zipName)
  const output = createWriteStream(out)
  const archive = archiver('zip', { zlib: { level: 9 } })
  archive.pipe(output)
  archive.file(resolve(dist, entry), { name: entry })
  archive.file(resolve(dist, 'auth.js'), { name: 'auth.js' })
  archive.file(resolve(dist, 'storage.js'), { name: 'storage.js' })
  archive.file(resolve(dist, 'roomCode.js'), { name: 'roomCode.js' })
  archive.file(resolve(dist, 'package.json'), { name: 'package.json' })
  archive.directory(resolve(dist, 'node_modules'), 'node_modules')
  await new Promise((res, rej) => {
    output.on('close', res)
    archive.on('error', rej)
    archive.finalize()
  })
  console.log(`bundled ${out}`)
}

mkdirSync(dist, { recursive: true })

await zipHandler('http.js', 'http.zip')
await zipHandler('websocket.js', 'websocket.zip')
