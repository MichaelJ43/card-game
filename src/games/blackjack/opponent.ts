import type { GameAction } from '../../core/types'

/** Blackjack uses timer/button shell actions only on this table build. */
export function blackjackSelectAiAction(): GameAction | null {
  return null
}
