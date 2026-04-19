import type { CardInstance, CardTemplate, TableState, Zone } from './types'
import { shuffleInPlace } from './shuffle'

export function createEmptyTable(
  templates: Record<string, CardTemplate>,
  zoneIds: string[],
  zoneConfigs?: Array<{ id: string; kind?: Zone['kind']; defaultFaceUp?: boolean; owner?: number }>,
): TableState {
  const zones: Record<string, Zone> = {}
  const order: string[] = []
  for (const id of zoneIds) {
    const cfg = zoneConfigs?.find((z) => z.id === id)
    zones[id] = {
      id,
      kind: cfg?.kind ?? 'stack',
      defaultFaceUp: cfg?.defaultFaceUp ?? false,
      ownerPlayerIndex: cfg?.owner,
      cards: [],
    }
    order.push(id)
  }
  return { templates, zones, zoneOrder: order }
}

export function getZoneCards(table: TableState, zoneId: string): CardInstance[] {
  return table.zones[zoneId]?.cards ?? []
}

/** Top of stack = last index (push/pop) */
export function peekTop(table: TableState, zoneId: string): CardInstance | undefined {
  const z = table.zones[zoneId]
  if (!z?.cards.length) return undefined
  return z.cards[z.cards.length - 1]
}

export function moveCard(
  table: TableState,
  fromZoneId: string,
  cardInstanceId: string,
  toZoneId: string,
  opts?: { index?: number; faceUp?: boolean },
): void {
  const from = table.zones[fromZoneId]
  const to = table.zones[toZoneId]
  if (!from || !to) throw new Error(`Unknown zone: ${fromZoneId} or ${toZoneId}`)

  const idx = from.cards.findIndex((c) => c.instanceId === cardInstanceId)
  if (idx < 0) throw new Error(`Card ${cardInstanceId} not in ${fromZoneId}`)

  const [card] = from.cards.splice(idx, 1)
  if (opts?.faceUp !== undefined) card.faceUp = opts.faceUp
  const insertAt = opts?.index ?? to.cards.length
  to.cards.splice(insertAt, 0, card)
}

/** Move top card from stack (last element) */
export function moveTop(
  table: TableState,
  fromZoneId: string,
  toZoneId: string,
  faceUp?: boolean,
): CardInstance | undefined {
  const from = table.zones[fromZoneId]
  const to = table.zones[toZoneId]
  if (!from?.cards.length || !to) return undefined
  const card = from.cards.pop()!
  if (faceUp !== undefined) card.faceUp = faceUp
  to.cards.push(card)
  return card
}

export function moveAll(
  table: TableState,
  fromZoneId: string,
  toZoneId: string,
  faceUp?: boolean,
): void {
  const from = table.zones[fromZoneId]
  const to = table.zones[toZoneId]
  if (!from || !to) return
  const batch = from.cards.splice(0, from.cards.length)
  for (const c of batch) {
    if (faceUp !== undefined) c.faceUp = faceUp
    to.cards.push(c)
  }
}

export function flipCard(table: TableState, zoneId: string, cardInstanceId: string, faceUp: boolean): void {
  const z = table.zones[zoneId]
  const c = z?.cards.find((x) => x.instanceId === cardInstanceId)
  if (c) c.faceUp = faceUp
}

export function flipZone(
  table: TableState,
  zoneId: string,
  faceUp: boolean,
  filter?: (c: CardInstance) => boolean,
): void {
  const z = table.zones[zoneId]
  if (!z) return
  for (const c of z.cards) {
    if (!filter || filter(c)) c.faceUp = faceUp
  }
}

/** Shuffle cards within a zone (in place) */
export function shuffleZone(
  table: TableState,
  zoneId: string,
  rng: () => number = Math.random,
): void {
  const z = table.zones[zoneId]
  if (!z?.cards.length) return
  shuffleInPlace(z.cards, rng)
}

export function cloneTable(table: TableState): TableState {
  return structuredClone(table)
}
