import type { CardTemplate, GameManifestYaml } from '../../core/types'
import type { GameAction } from '../../core/types'
import type { TableState } from '../../core/types'
import { moveTop } from '../../core/table'

export function totalPlayers(m: GameManifestYaml): number {
  return m.players.human + m.players.ai
}

export function handId(i: number): string {
  return `hand:${i}`
}

export function cmd(p: Record<string, unknown> | undefined): string {
  return typeof p?.cmd === 'string' ? p.cmd : ''
}

export function cardValue(templates: Record<string, CardTemplate>, templateId: string): number {
  const v = templates[templateId]?.value
  return typeof v === 'number' ? v : -1
}

export function canPlayOnPile(piles: number[], pileIndex: number, v: number): boolean {
  const need = piles[pileIndex]!
  if (v === 0) return true
  return v === need
}

export function advancePile(piles: number[], pileIndex: number, v: number): void {
  const need = piles[pileIndex]!
  if (v !== 0 && v !== need) return
  piles[pileIndex] = need >= 12 ? 1 : need + 1
}

export function legalPlays(table: TableState, piles: number[], playerIndex: number): GameAction[] {
  const hand = table.zones[handId(playerIndex)]!.cards
  const out: GameAction[] = []
  for (let i = 0; i < hand.length; i++) {
    const v = cardValue(table.templates, hand[i]!.templateId)
    if (v < 0) continue
    for (let p = 0; p < 4; p++) {
      if (canPlayOnPile(piles, p, v)) {
        out.push({ type: 'custom', payload: { cmd: 'srPlay', handIndex: i, pileIndex: p } })
      }
    }
  }
  return out
}

export function drawToFive(t: TableState, playerIndex: number): void {
  const hand = t.zones[handId(playerIndex)]!.cards
  while (hand.length < 5 && t.zones.draw!.cards.length > 0) {
    const c = moveTop(t, 'draw', handId(playerIndex), playerIndex === 0)
    if (c) c.faceUp = playerIndex === 0
  }
}
