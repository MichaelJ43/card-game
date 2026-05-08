import type { CardInstance } from '../../core/types'

export interface SkyjoGameState {
  phase: 'opening' | 'play' | 'final' | 'roundOver'
  playerCount: number
  currentPlayer: number
  message: string
  pendingDraw: CardInstance | null
  /** If the pending card came from the discard pile it must be placed (no dump). */
  pendingFromDiscard: boolean
  skyjoFinisher: number | null
  finalQueue: number[]
  roundScores: number[] | null
  finisherDoubled: boolean
  /**
   * House rule: the discard pile may only be taken to swap onto face-up grid cards
   * (face-down cells accept deck draws only).
   */
  discardSwapFaceUpOnly: boolean
  /** House rule: shuffle discard into draw when draw is empty (except visible top discard). */
  reshuffleDiscardWhenDrawEmpty: boolean
}
