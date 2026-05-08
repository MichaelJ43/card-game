import type { TableState } from '../core/types'

/** Lossy, size-bounded digest for LLM prompts — not a full authoritative state dump. */
export function buildTableDigest(table: TableState, maxLen = 7000): string {
  const rows: string[] = []
  rows.push(`zones: ${table.zoneOrder.join(', ')}`)
  for (const zid of table.zoneOrder) {
    const z = table.zones[zid]
    if (!z) continue
    const n = z.cards.length
    let top = ''
    if (n > 0) {
      const topId = z.cards[n - 1]
      const tmpl = table.templates[topId.templateId]
      const tid = topId.templateId
      const up = topId.faceUp ? 'up' : 'down'
      const rank = tmpl && typeof tmpl.rank === 'string' ? tmpl.rank : ''
      const suit = tmpl && typeof tmpl.suit === 'string' ? tmpl.suit : ''
      top = ` top=${tid}/${up}/${rank}/${suit}`
    }
    rows.push(`${zid}: n=${n}${top} kind=${z.kind}`)
    if (rows.join('\n').length > maxLen) break
  }
  let s = rows.join('\n')
  if (s.length > maxLen) s = `${s.slice(0, maxLen)}…`
  return s
}
