/**
 * Build src/llm/generated/heuristic-catalog.json from `selectAiAction` JSDoc in game modules.
 * Run via `npm run gen:ai-catalog`.
 */
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Node, Project } from 'ts-morph'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const gamesDir = join(root, 'src', 'games')
const outDir = join(root, 'src', 'llm', 'generated')
const outFile = join(outDir, 'heuristic-catalog.json')

const project = new Project({})

/** @type {Record<string, string>} */
const catalog = {}

function jsDocBlockFromNode(node) {
  let block = ''
  const docs = node.getJsDocs()
  for (const d of docs) {
    const t = d.getDescription().trim()
    if (t) block += `${t}\n\n`
  }
  for (const d of docs) {
    for (const tag of d.getTags()) {
      const c = tag.getComment()
      const comment = (typeof c === 'string' ? c : Array.isArray(c) ? c.join(' ') : '').trim()
      if (comment) block += `@${tag.getTagName()} ${comment}\n`
    }
  }
  return block.trim()
}

for (const name of readdirSync(gamesDir)) {
  const gamePath = join(gamesDir, name)
  if (!statSync(gamePath).isDirectory()) continue
  let block = ''

  const opponentTs = join(gamePath, 'opponent.ts')
  try {
    const sfOpp = project.addSourceFileAtPath(opponentTs)
    for (const fn of sfOpp.getFunctions()) {
      const fnName = fn.getName()
      if (!fnName || !fnName.endsWith('SelectAiAction')) continue
      const b = jsDocBlockFromNode(fn)
      if (b) {
        block = b
        break
      }
    }
  } catch {
    /* no opponent.ts */
  }

  if (!block) {
    const indexTs = join(gamePath, 'index.ts')
    let sf
    try {
      sf = project.addSourceFileAtPath(indexTs)
    } catch {
      catalog[name] = '(no index.ts)'
      continue
    }
    let found = false
    sf.forEachDescendant((node) => {
      if (found) return
      if (!Node.isMethodDeclaration(node)) return
      if (node.getName() !== 'selectAiAction') return
      found = true
      block = jsDocBlockFromNode(node)
    })
  }

  catalog[name] = block || '(no JSDoc on selectAiAction / *SelectAiAction)'
}

mkdirSync(outDir, { recursive: true })
writeFileSync(outFile, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8')
console.log(`Wrote ${outFile}`)
