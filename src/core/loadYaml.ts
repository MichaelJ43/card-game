import { parse as parseYaml } from 'yaml'
import type { DeckYaml, GameManifestYaml } from './types'

export function parseGameManifestYaml(text: string): GameManifestYaml {
  const doc = parseYaml(text) as GameManifestYaml
  if (!doc?.id || !doc.module || !doc.deck) {
    throw new Error('Invalid game manifest: need id, module, deck')
  }
  return doc
}

export function parseDeckYamlRaw(text: string): DeckYaml {
  return parseYaml(text) as DeckYaml
}
