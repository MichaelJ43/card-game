import type { CardTemplate, GameManifestYaml } from '../../core/types'
import { moveTop } from '../../core/table'
import type { TableState } from '../../core/types'

export const DURAK_RANKS = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const

export function totalPlayers(m: GameManifestYaml): number {
  return m.players.human + m.players.ai
}

export function handId(i: number): string {
  return `hand:${i}`
}

export function cmd(p: Record<string, unknown> | undefined): string {
  return typeof p?.cmd === 'string' ? p.cmd : ''
}

export function rankPower(r: string | undefined): number {
  if (!r) return -1
  return DURAK_RANKS.indexOf(r as (typeof DURAK_RANKS)[number])
}

export function canBeat(
  templates: Record<string, CardTemplate>,
  attackTid: string,
  defenseTid: string,
  trump: string,
): boolean {
  const a = templates[attackTid]
  const d = templates[defenseTid]
  const as = typeof a?.suit === 'string' ? a.suit : ''
  const ds = typeof d?.suit === 'string' ? d.suit : ''
  const ar = rankPower(typeof a?.rank === 'string' ? a.rank : undefined)
  const dr = rankPower(typeof d?.rank === 'string' ? d.rank : undefined)
  if (ar < 0 || dr < 0) return false
  if (as === trump && ds === trump) return dr > ar
  if (as !== trump && ds === trump) return true
  if (as === ds) return dr > ar
  return false
}

export function refillHands(t: TableState, attackerFirst: number, pCount: number): void {
  const order = [attackerFirst, (attackerFirst + 1) % pCount]
  for (let round = 0; round < 6; round++) {
    for (const p of order) {
      const h = t.zones[handId(p)]!.cards
      if (h.length >= 6) continue
      if (t.zones.draw!.cards.length === 0) continue
      const c = moveTop(t, 'draw', handId(p), p === 0)
      if (c) c.faceUp = p === 0
    }
  }
}

export function checkWin(t: TableState, pCount: number): number | null {
  const stock = t.zones.draw!.cards.length
  if (stock > 0) return null
  for (let p = 0; p < pCount; p++) {
    if (t.zones[handId(p)]!.cards.length === 0) return p
  }
  return null
}
