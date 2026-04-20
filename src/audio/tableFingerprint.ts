import type { TableState } from '../core/types'

/** Stable string for card layout + face-up state (ignores templates map). */
export function tableCardFingerprint(table: TableState): string {
  let s = ''
  for (const zid of table.zoneOrder) {
    const z = table.zones[zid]
    if (!z) continue
    s += `${zid}:`
    for (const c of z.cards) {
      s += `${c.instanceId},${c.faceUp ? 1 : 0},${c.templateId};`
    }
    s += '|'
  }
  return s
}
