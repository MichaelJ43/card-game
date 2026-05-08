import type { AiDifficulty } from '../../core/aiContext'
import type { SelectAiContext } from '../../core/gameModule'
import type { GameAction } from '../../core/types'
import { isDeckDrawAvailableAfterOptionalRecycle } from '../../core/discardRecycle'
import type { TableState } from '../../core/types'
import { canastaCardWeight, handId } from './helpers'
import type { CanastaGameState } from './types'

/** Practice-table Canasta AI: draw-two then discard by meld-weight heuristic. */
export function canastaSelectAiAction(
  table: TableState,
  gs: CanastaGameState,
  playerIndex: number,
  rng: () => number,
  context: SelectAiContext,
): GameAction | null {
  if (gs.phase !== 'play' || playerIndex !== gs.currentPlayer) return null
  const d: AiDifficulty = context.difficulty
  if (!gs.drewThisTurn) {
    if (isDeckDrawAvailableAfterOptionalRecycle(table, gs.reshuffleDiscardWhenDrawEmpty, true)) {
      return { type: 'custom', payload: { cmd: 'cnsDrawTwo' } }
    }
  }
  const hand = table.zones[handId(playerIndex)]!.cards
  if (!hand.length) return null
  if (d === 'easy' && rng() < 0.35) {
    return { type: 'custom', payload: { cmd: 'cnsDiscard', index: Math.floor(rng() * hand.length) } }
  }
  if (d === 'medium' && rng() < 0.2) {
    return { type: 'custom', payload: { cmd: 'cnsDiscard', index: Math.floor(rng() * hand.length) } }
  }
  const tpl = table.templates
  const byRank = (tid: string) => canastaCardWeight(tid, tpl)
  const countBy = new Map<string, number>()
  for (const c of hand) {
    const k = c.templateId
    countBy.set(k, (countBy.get(k) ?? 0) + 1)
  }
  const scored = hand.map((c, i) => {
    let s = byRank(c.templateId)
    if (d === 'expert' && (countBy.get(c.templateId) ?? 0) >= 2) s -= 18
    return { i, s }
  })
  if (d === 'expert' && rng() < 0.11 && scored.length > 1) {
    scored.sort((a, b) => b.s - a.s)
    return { type: 'custom', payload: { cmd: 'cnsDiscard', index: scored[1]!.i } }
  }
  scored.sort((a, b) => b.s - a.s)
  return { type: 'custom', payload: { cmd: 'cnsDiscard', index: scored[0]!.i } }
}
