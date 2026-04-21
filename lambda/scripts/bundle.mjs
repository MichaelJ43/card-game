// Produces deployable zip bundles for each Lambda handler.
// Run after `npm run build` (creates dist/).
// Output: dist/http.zip, dist/websocket.zip, dist/turnScheduled.zip

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

execSync('npm install --omit=dev --silent --no-audit --no-fund', { cwd: dist, stdio: 'inherit' })

async function zipPackage(files, zipName) {
  const out = resolve(dist, zipName)
  const output = createWriteStream(out)
  const archive = archiver('zip', { zlib: { level: 9 } })
  archive.pipe(output)
  for (const f of files) {
    archive.file(resolve(dist, f), { name: f })
  }
  archive.directory(resolve(dist, 'node_modules'), 'node_modules')
  await new Promise((res, rej) => {
    output.on('close', res)
    archive.on('error', rej)
    archive.finalize()
  })
  console.log(`bundled ${out}`)
}

mkdirSync(dist, { recursive: true })

const common = ['package.json']

await zipPackage(
  [
    'http.js',
    'auth.js',
    'storage.js',
    'roomCode.js',
    'turnHttpHandlers.js',
    'turnState.js',
    'turnEc2Ops.js',
    'wsRoomNotify.js',
    'turnBackoff.js',
    ...common,
  ],
  'http.zip',
)

await zipPackage(['websocket.js', 'auth.js', 'storage.js', 'roomCode.js', ...common], 'websocket.zip')

await zipPackage(
  ['turnScheduled.js', 'turnState.js', 'turnEc2Ops.js', 'turnBackoff.js', 'storage.js', ...common],
  'turnScheduled.zip',
)
