import type { CardInstance, TableState, Zone } from '../core/types'

function handOwnerPlayer(zone: Zone): number | null {
  if (typeof zone.ownerPlayerIndex === 'number') return zone.ownerPlayerIndex
  const m = /^hand:(\d+)$/.exec(zone.id)
  if (m) return Number(m[1])
  const p = /^pile:(\d+)$/.exec(zone.id)
  if (p) return Number(p[1])
  return null
}

/** True if the viewer may know this card's identity (face-up public, or in viewer's hidden hand). */
export function cardIdentityKnownToViewer(
  zone: Zone,
  card: CardInstance,
  _cardIndex: number,
  viewerPlayerIndex: number,
): boolean {
  if (card.faceUp) return true
  const owner = handOwnerPlayer(zone)
  if (owner === viewerPlayerIndex) return true
  return false
}

function cardBrief(
  table: TableState,
  card: CardInstance,
  zone: Zone,
  idx: number,
  viewerPlayerIndex: number,
): string {
  const known = cardIdentityKnownToViewer(zone, card, idx, viewerPlayerIndex)
  if (!known) return '??'
  const tmpl = table.templates[card.templateId]
  const rank = tmpl && typeof tmpl.rank === 'string' ? tmpl.rank : ''
  const suit = tmpl && typeof tmpl.suit === 'string' ? tmpl.suit : ''
  const id = card.templateId
  const up = card.faceUp ? 'up' : 'down'
  return `${id}/${up}/${rank}/${suit}`.replace(/\/+$/, '')
}

/**
 * Size-bounded observation from the given seat's information (no hidden opponent identities).
 */
export function buildRoleAwareTableObservation(
  table: TableState,
  viewerPlayerIndex: number,
  maxLen = 9000,
): string {
  const rows: string[] = []
  rows.push(`viewerSeat: ${viewerPlayerIndex}`)
  rows.push(`zones: ${table.zoneOrder.join(', ')}`)
  for (const zid of table.zoneOrder) {
    const z = table.zones[zid]
    if (!z) continue
    const parts: string[] = []
    z.cards.forEach((c, i) => {
      parts.push(`[${i}]=${cardBrief(table, c, z, i, viewerPlayerIndex)}`)
    })
    rows.push(`${zid}: n=${z.cards.length} kind=${z.kind} ${parts.join(' ')}`)
    if (rows.join('\n').length > maxLen) break
  }
  let s = rows.join('\n')
  if (s.length > maxLen) s = `${s.slice(0, maxLen)}…`
  return s
}
