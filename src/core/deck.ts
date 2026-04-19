import { parse as parseYaml } from 'yaml'
import type { CardInstance, CardTemplate, DeckYaml, Rank, Suit } from './types'

const SUIT_CODE: Record<string, string> = {
  spades: 'S',
  hearts: 'H',
  diamonds: 'D',
  clubs: 'C',
}

function expandSkyjoDistribution(dist: NonNullable<DeckYaml['skyjoDistribution']>): CardTemplate[] {
  const out: CardTemplate[] = []
  for (const row of dist) {
    const v = row.value
    const count = Math.max(0, row.count)
    const idBase = v < 0 ? `n${-v}` : `${v}`
    for (let i = 0; i < count; i++) {
      const id = `skyjo_${idBase}__${i}`
      const label = v < 0 ? `${v}` : `${v}`
      out.push({
        id,
        value: v,
        label,
        skyjo: true,
      })
    }
  }
  return out
}

function expandGenerate(gen: NonNullable<DeckYaml['generate']>): CardTemplate[] {
  const suits = gen.suits as Suit[]
  const ranks = gen.ranks as Rank[]
  const out: CardTemplate[] = []
  for (const suit of suits) {
    const code = SUIT_CODE[String(suit)] ?? String(suit).slice(0, 1).toUpperCase()
    for (const rank of ranks) {
      const id = `${rank}${code}`
      out.push({ id, rank, suit })
    }
  }
  return out
}

function rowToTemplate(row: Record<string, unknown> & { id: string }): CardTemplate {
  const { id, copies, ...rest } = row
  void copies
  return { id, ...rest } as CardTemplate
}

/** Parse deck YAML text into templates map and deck id */
export function parseDeckYaml(yamlText: string): {
  deckId: string
  templates: Record<string, CardTemplate>
  back?: DeckYaml['back']
} {
  const doc = parseYaml(yamlText) as DeckYaml
  if (!doc?.id) throw new Error('Deck YAML missing id')

  const templates: Record<string, CardTemplate> = {}

  if (doc.skyjoDistribution?.length) {
    for (const t of expandSkyjoDistribution(doc.skyjoDistribution)) {
      templates[t.id] = t
    }
  }

  if (doc.generate) {
    for (const t of expandGenerate(doc.generate)) {
      templates[t.id] = t
    }
  }

  if (doc.cards?.length) {
    for (const row of doc.cards) {
      const copies = Math.max(1, row.copies ?? 1)
      const base = rowToTemplate(row)
      for (let i = 0; i < copies; i++) {
        const id = copies > 1 ? `${base.id}__${i}` : base.id
        templates[id] = { ...base, id }
      }
    }
  }

  if (Object.keys(templates).length === 0) {
    throw new Error(`Deck "${doc.id}" has no cards (use generate or cards)`)
  }

  return { deckId: doc.id, templates, back: doc.back }
}

export function newInstanceId(): string {
  return crypto.randomUUID()
}

/** Build one instance per template id (unique template ids only) */
export function buildDeckInstances(templates: Record<string, CardTemplate>): CardInstance[] {
  return Object.keys(templates).map((templateId) => ({
    instanceId: newInstanceId(),
    templateId,
    faceUp: false,
  }))
}
