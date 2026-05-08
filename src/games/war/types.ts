export interface WarGameState {
  phase: 'playing' | 'over'
  winnerIndex: number | null
  message: string
  playerCount: number
  /** Face-down cards each player puts out before the tie-break flip (1 quick, 3 classic). */
  tieDownCards: 1 | 3
}
