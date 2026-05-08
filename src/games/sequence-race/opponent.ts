import type { AiDifficulty } from '../../core/aiContext'
import { aiIsHardOrExpert } from '../../core/aiPlaystyle'
import type { SelectAiContext } from '../../core/gameModule'
import type { GameAction, TableState } from '../../core/types'
import { cardValue, cmd, handId, legalPlays } from './helpers'
import type { SequenceRaceGameState } from './types'

/** Sequence race AI: greedy pile matching with tiered randomness. */
export function sequenceRaceSelectAiAction(
  table: TableState,
  gs: SequenceRaceGameState,
  playerIndex: number,
  rng: () => number,
  context: SelectAiContext,
): GameAction | null {
  if (gs.phase !== 'play' || playerIndex !== gs.currentPlayer) return null
  const d: AiDifficulty = context.difficulty
  const plays = legalPlays(table, gs.piles, playerIndex)
  if (plays.length > 0) {
    if (d === 'easy' && rng() < 0.35) {
      return plays[Math.floor(rng() * plays.length)]!
    }
    if (d === 'medium' && rng() < 0.22) {
      return plays[Math.floor(rng() * plays.length)]!
    }
    if (aiIsHardOrExpert(d)) {
      const score = (a: (typeof plays)[0]): number => {
        if (a.type !== 'custom' || cmd(a.payload) !== 'srPlay') return -100
        const pi = Number((a.payload as { pileIndex?: number }).pileIndex)
        const hi = Number((a.payload as { handIndex?: number }).handIndex)
        const v = cardValue(table.templates, table.zones[handId(playerIndex)]!.cards[hi]!.templateId)
        const need = gs.piles[pi]!
        if (v !== 0 && v !== need) return -200
        let s = 40
        s += (13 - need) * 0.5
        if (d === 'expert' && rng() < 0.1) s -= 4
        return s
      }
      const ranked = plays.map((a) => ({ a, s: score(a) })).sort((x, y) => y.s - x.s)
      if (d === 'expert' && ranked.length > 1 && rng() < 0.12) return ranked[1]!.a
      return ranked[0]!.a
    }
    return plays[Math.floor(rng() * plays.length)]!
  }
  return { type: 'custom', payload: { cmd: 'srEndTurn' } }
}
