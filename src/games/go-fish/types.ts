export interface GoFishGameState {
  phase: 'playing' | 'over'
  playerCount: number
  currentPlayer: number
  message: string
  winnerIndex: number | null
  bookCounts: number[]
}
