import type { SelectAiContext } from '../../core/gameModule'
import type { GameAction } from '../../core/types'
import { cloneTable } from '../../core/table'
import type { TableState } from '../../core/types'
import {
  enumerateLegalAsks,
  replenishIfEmpty,
  scoreGoFishAsk,
  scoreGoFishAskExpert,
} from './helpers'
import type { GoFishGameState } from './types'

/** Go Fish AI: ranked asks by hand composition and opponent hand size. */
export function goFishSelectAiAction(
  table: TableState,
  gameState: GoFishGameState,
  playerIndex: number,
  rng: () => number,
  context: SelectAiContext,
): GameAction | null {
  if (gameState.phase === 'over') return null
  if (gameState.currentPlayer !== playerIndex) return null
  const sim = cloneTable(table)
  replenishIfEmpty(sim, playerIndex, sim.templates)
  const legal = enumerateLegalAsks(sim, sim.templates, playerIndex, gameState.playerCount)
  if (legal.length === 0) return { type: 'goFishPass' }

  const { difficulty } = context
  if (difficulty === 'medium') {
    return legal[Math.floor(rng() * legal.length)]!
  }

  const templates = sim.templates
  const scored = legal.map((a) => ({
    a,
    s: a.type === 'goFishAsk' ? scoreGoFishAsk(a, sim, templates, playerIndex) : 0,
  }))

  if (difficulty === 'hard') {
    const maxS = Math.max(...scored.map((x) => x.s))
    const top = scored.filter((x) => x.s === maxS)
    return top[Math.floor(rng() * top.length)]!.a
  }

  if (difficulty === 'expert') {
    const exp = legal.map((a) => ({
      a,
      s: a.type === 'goFishAsk' ? scoreGoFishAskExpert(a, sim, templates, playerIndex) : 0,
    }))
    const sorted = [...exp].sort((x, y) => y.s - x.s)
    if (sorted.length > 1 && rng() < 0.12) {
      return sorted[1]!.a
    }
    const maxE = Math.max(...exp.map((x) => x.s))
    const topE = exp.filter((x) => x.s === maxE)
    return topE[Math.floor(rng() * topE.length)]!.a
  }

  const minS = Math.min(...scored.map((x) => x.s))
  const weak = scored.filter((x) => x.s === minS)
  if (rng() < 0.58) {
    return weak[Math.floor(rng() * weak.length)]!.a
  }
  return legal[Math.floor(rng() * legal.length)]!
}
