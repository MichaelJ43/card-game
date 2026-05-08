import type { GameAction } from '../../core/types'

/** Baccarat bets are chosen by the player/timer shell only. */
export function baccaratSelectAiAction(): GameAction | null {
  return null
}
