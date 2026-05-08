export type UnoColor = 'r' | 'y' | 'g' | 'b'

export const UNO_COLORS: UnoColor[] = ['r', 'y', 'g', 'b']

export interface UnoGameState {
  phase: 'play' | 'roundOver'
  currentPlayer: number
  direction: 1 | -1
  currentColor: UnoColor
  drewThisTurn: boolean
  drawSlot: number | null
  /**
   * When true, after drawing you must play the card at `drawSlot` (cannot pass).
   * Set when the optional “draw until playable” house rule is on and a playable card was drawn.
   */
  mustPlayDrawnCard: boolean
  /** House rule: kept for UI / next round; immutable during a round. */
  drawUntilPlayable: boolean
  message: string
  roundScores: number[] | null
  reshuffleDiscardWhenDrawEmpty: boolean
}
