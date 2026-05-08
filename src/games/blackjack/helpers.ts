import type { GameModuleContext } from '../../core/gameModule'
import type { CardTemplate, GameManifestYaml } from '../../core/types'
import type { TableState } from '../../core/types'
import { moveTop } from '../../core/table'
import { blackjackValue, isSoftBlackjack17 } from '../standard/cardUtils'

export function cmd(payload: Record<string, unknown> | undefined): string {
  return typeof payload?.cmd === 'string' ? payload.cmd : ''
}

export function totalPlayers(m: GameManifestYaml): number {
  return m.players.human + m.players.ai
}

export function startingStacks(ctx: GameModuleContext, pCount: number): number[] {
  const fromMatch = ctx.matchCumulativeScores
  if (fromMatch && fromMatch.length === pCount) return [...fromMatch]
  const s = ctx.manifest.match?.startingStack
  const v = typeof s === 'number' && s > 0 ? s : 100
  return Array.from({ length: pCount }, () => v)
}

export function dealInitial(table: TableState, pCount: number): void {
  for (let r = 0; r < 2; r++) {
    for (let p = 0; p < pCount; p++) {
      const c = moveTop(table, 'draw', `hand:${p}`, p === 0)
      if (c) c.faceUp = p === 0 || (p === 1 && r === 1)
    }
  }
}

export function dealerPlay(
  table: TableState,
  templates: Record<string, CardTemplate>,
  dealerHitsSoft17: boolean,
): void {
  const h = table.zones['hand:1']!.cards
  for (const c of h) c.faceUp = true
  while (table.zones.draw!.cards.length > 0) {
    const ids = h.map((c) => c.templateId)
    const v = blackjackValue(templates, ids)
    if (v < 17) {
      moveTop(table, 'draw', 'hand:1', true)
      continue
    }
    if (v === 17 && dealerHitsSoft17 && isSoftBlackjack17(templates, ids)) {
      moveTop(table, 'draw', 'hand:1', true)
      continue
    }
    break
  }
}
